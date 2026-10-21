"""Detect the annotation format of a dataset and normalise it.

Every format is converted to the same shape model used by the annotation page:
``Shape(label, kind, points)`` with points in *pixel* coordinates of the image.
Detection order matches the frontend (frontend/src/lib/datasetFormat.ts).
"""
import json
import re
from dataclasses import dataclass, field
from xml.etree.ElementTree import ParseError

import yaml
from defusedxml import ElementTree
from defusedxml.common import DefusedXmlException

from .archive import Entry

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".gif", ".tif", ".tiff"}

RECT, POLYGON = "rect", "polygon"


@dataclass
class Shape:
    label: str
    kind: str
    points: list[list[float]]


@dataclass
class ParsedDataset:
    format: str
    classes: list[str]
    # image path -> shapes on that image
    annotations: dict[str, list[Shape]] = field(default_factory=dict)

    @property
    def annotated(self):
        return sum(1 for shapes in self.annotations.values() if shapes)


class ImageIndex:
    """Looks images up the way annotation files refer to them: by file name or stem."""

    def __init__(self, sizes: dict[str, tuple[int, int]]):
        self.sizes = sizes
        self.by_name: dict[str, str] = {}
        self.by_stem: dict[str, str] = {}
        for path in sizes:  # first image wins when names collide across folders
            name = path.rsplit("/", 1)[-1].lower()
            self.by_name.setdefault(name, path)
            self.by_stem.setdefault(name.rsplit(".", 1)[0], path)

    def find_name(self, file_name: str) -> str | None:
        return self.by_name.get(str(file_name).replace("\\", "/").rsplit("/", 1)[-1].lower())

    def find_stem(self, stem: str) -> str | None:
        return self.by_stem.get(stem.lower())


def _clamp(points, size):
    w, h = size
    return [[min(max(float(x), 0.0), w), min(max(float(y), 0.0), h)] for x, y in points]


def _rect(x1, y1, x2, y2, size):
    return _clamp([[x1, y1], [x2, y2]], size)


def _add(result: ParsedDataset, path: str, shape: Shape):
    result.annotations.setdefault(path, []).append(shape)


def _load_json(entry: Entry):
    try:
        return json.loads(entry.text())
    except (ValueError, UnicodeDecodeError):
        return None


# --- COCO ---------------------------------------------------------------------

def parse_coco(jsons: list[Entry], index: ImageIndex) -> ParsedDataset | None:
    for entry in jsons:
        data = _load_json(entry)
        if not isinstance(data, dict) or not all(
            isinstance(data.get(k), list) for k in ("images", "annotations", "categories")
        ):
            continue
        categories = {c.get("id"): str(c.get("name")) for c in data["categories"] if isinstance(c, dict)}
        images = {}
        for im in data["images"]:
            if isinstance(im, dict) and (path := index.find_name(im.get("file_name", ""))):
                images[im.get("id")] = path

        result = ParsedDataset("COCO", list(dict.fromkeys(categories.values())))
        for ann in data["annotations"]:
            if not isinstance(ann, dict):
                continue
            path, label = images.get(ann.get("image_id")), categories.get(ann.get("category_id"))
            if not path or label is None:
                continue
            size = index.sizes[path]
            seg = ann.get("segmentation")
            polygons = [p for p in seg if isinstance(p, list) and len(p) >= 6] if isinstance(seg, list) else []
            if polygons:  # polygon segmentation; RLE masks fall back to the bbox
                for poly in polygons:
                    _add(result, path, Shape(label, POLYGON, _clamp(zip(poly[0::2], poly[1::2]), size)))
            elif isinstance(bbox := ann.get("bbox"), list) and len(bbox) == 4:
                x, y, w, h = bbox
                _add(result, path, Shape(label, RECT, _rect(x, y, x + w, y + h, size)))
        if result.annotated:
            return result
    return None


# --- Pascal VOC ---------------------------------------------------------------

def parse_voc(xmls: list[Entry], index: ImageIndex) -> ParsedDataset | None:
    result = ParsedDataset("Pascal VOC", [])
    classes = {}
    for entry in xmls:
        path = index.find_stem(entry.stem)
        if not path:
            continue
        try:
            root = ElementTree.fromstring(entry.read())
        except (ParseError, DefusedXmlException):
            continue
        if root.tag != "annotation":
            continue
        for obj in root.findall("object"):
            name, box = (obj.findtext("name") or "").strip(), obj.find("bndbox")
            if not name or box is None:
                continue
            try:
                coords = [float(box.findtext(k)) for k in ("xmin", "ymin", "xmax", "ymax")]
            except (TypeError, ValueError):
                continue
            classes.setdefault(name.lower(), name)
            _add(result, path, Shape(name, RECT, _rect(*coords, index.sizes[path])))
    result.classes = list(classes.values())
    return result if result.annotated else None


# --- YOLO ---------------------------------------------------------------------

YOLO_LINE = re.compile(r"^\d+(\s+-?\d*\.?\d+(e-?\d+)?){4,}$", re.IGNORECASE)


def _yaml_names(text: str) -> list[str]:
    try:
        names = (yaml.safe_load(text) or {}).get("names")
    except (yaml.YAMLError, AttributeError):
        return []
    if isinstance(names, dict):  # {0: car, 1: person}
        return [str(names[k]) for k in sorted(names)]
    return [str(n) for n in names] if isinstance(names, list) else []


def _yolo_classes(entries: list[Entry]) -> list[str]:
    for entry in entries:
        if entry.name.lower() in ("classes.txt", "obj.names") or entry.suffix == ".names":
            return [line.strip() for line in entry.text().splitlines() if line.strip()]
    for entry in entries:
        if entry.suffix in (".yaml", ".yml") and (names := _yaml_names(entry.text())):
            return names
    return []


def parse_yolo(txts: list[Entry], all_entries: list[Entry], index: ImageIndex) -> ParsedDataset | None:
    rows: dict[str, list[list[float]]] = {}
    for entry in txts:
        path = index.find_stem(entry.stem)
        if not path:
            continue
        lines = [line.strip() for line in entry.text().splitlines() if line.strip()]
        if lines and all(YOLO_LINE.match(line) for line in lines):
            rows[path] = [[float(v) for v in line.split()] for line in lines]
    if not rows:
        return None

    names = _yolo_classes(all_entries)
    ids = sorted({int(r[0]) for shapes in rows.values() for r in shapes})
    label = lambda i: names[i] if i < len(names) else f"class_{i}"  # noqa: E731
    result = ParsedDataset("YOLO", names or [label(i) for i in ids])
    for path, shapes in rows.items():
        w, h = size = index.sizes[path]
        for cls, *values in shapes:
            name = label(int(cls))
            if name not in result.classes:
                result.classes.append(name)
            if len(values) == 4:  # cx cy w h, all normalised
                cx, cy, bw, bh = values
                _add(result, path, Shape(name, RECT, _rect((cx - bw / 2) * w, (cy - bh / 2) * h,
                                                            (cx + bw / 2) * w, (cy + bh / 2) * h, size)))
            elif len(values) >= 6:  # segmentation: x1 y1 x2 y2 ...
                pts = [[x * w, y * h] for x, y in zip(values[0::2], values[1::2])]
                _add(result, path, Shape(name, POLYGON, _clamp(pts, size)))
    return result if result.annotated else None


# --- CreateML -----------------------------------------------------------------

def parse_createml(jsons: list[Entry], index: ImageIndex) -> ParsedDataset | None:
    for entry in jsons:
        data = _load_json(entry)
        if not isinstance(data, list) or not data or not isinstance(data[0], dict) \
                or not isinstance(data[0].get("image"), str):
            continue
        result = ParsedDataset("CreateML", [])
        for item in data:
            path = isinstance(item, dict) and index.find_name(item.get("image", ""))
            if not path or not isinstance(item.get("annotations"), list):
                continue
            for ann in item["annotations"]:
                c = ann.get("coordinates") if isinstance(ann, dict) else None
                if not isinstance(c, dict) or not ann.get("label"):
                    continue
                try:  # x/y are the box centre, in pixels
                    x, y, w, h = (float(c[k]) for k in ("x", "y", "width", "height"))
                except (KeyError, TypeError, ValueError):
                    continue
                name = str(ann["label"])
                if name not in result.classes:
                    result.classes.append(name)
                _add(result, path, Shape(name, RECT, _rect(x - w / 2, y - h / 2, x + w / 2, y + h / 2, index.sizes[path])))
        if result.annotated:
            return result
    return None


def parse_annotations(entries: list[Entry], sizes: dict[str, tuple[int, int]]) -> ParsedDataset | None:
    """Return the first format that yields annotations for these images, else None.

    ``sizes`` maps each image path in the archive to its (width, height).
    """
    index = ImageIndex(sizes)
    by = lambda *suffixes: [e for e in entries if e.suffix in suffixes]  # noqa: E731
    jsons = by(".json")
    return (
        parse_coco(jsons, index)
        or parse_voc(by(".xml"), index)
        or parse_yolo(by(".txt"), entries, index)
        or parse_createml(jsons, index)
    )
