"""Export a project's annotations as a dataset ZIP (COCO, YOLO or Pascal VOC).

Archives use the same layouts the importer reads, so an export can be imported again.
Rectangles and ellipses become boxes and polygons keep their outline where the format
allows it; polylines and points have no extent and are left out (as in training).
"""
import json
import tempfile
import zipfile
from pathlib import PurePosixPath
from xml.etree.ElementTree import Element, SubElement, tostring

import yaml
from django.db.models import Prefetch

from .models import Annotation

FORMATS = {"coco": "COCO", "yolo": "YOLO", "voc": "Pascal VOC"}
EXPORT_KINDS = (Annotation.Kind.RECT, Annotation.Kind.ELLIPSE, Annotation.Kind.POLYGON)


def _box(points):
    xs, ys = [p[0] for p in points], [p[1] for p in points]
    return min(xs), min(ys), max(xs), max(ys)


def _file_names(images):
    """Unique archive file names, keeping the original stem (the importer matches on it)."""
    names, used = {}, set()
    for img in images:
        stem = PurePosixPath(img.original_name.replace("\\", "/")).stem or f"image_{img.id}"
        suffix = PurePosixPath(img.file.name).suffix.lower()
        if stem.lower() in used:
            stem = f"{stem}_{img.id}"
        used.add(stem.lower())
        names[img.id] = f"{stem}{suffix}"
    return names


def _coco(images, labels, names):
    cat_ids = {lbl.id: n for n, lbl in enumerate(labels, 1)}
    data = {
        "images": [{"id": img.id, "file_name": names[img.id], "width": img.width, "height": img.height}
                   for img in images],
        "categories": [{"id": cat_ids[lbl.id], "name": lbl.name, "supercategory": ""} for lbl in labels],
        "annotations": [],
    }
    for img in images:
        for ann in img.annotations.all():
            x1, y1, x2, y2 = _box(ann.points)
            item = {
                "id": len(data["annotations"]) + 1, "image_id": img.id, "category_id": cat_ids[ann.label_id],
                "bbox": [x1, y1, x2 - x1, y2 - y1], "area": (x2 - x1) * (y2 - y1), "iscrowd": 0,
                "segmentation": [],
            }
            if ann.kind == Annotation.Kind.POLYGON:
                item["segmentation"] = [[v for p in ann.points for v in p]]
            data["annotations"].append(item)
    return {"annotations/instances_default.json": json.dumps(data)}


def _yolo(images, labels, names):
    class_ids = {lbl.id: n for n, lbl in enumerate(labels)}
    files = {"data.yaml": yaml.safe_dump({"nc": len(labels), "names": [lbl.name for lbl in labels]},
                                         allow_unicode=True, sort_keys=False)}
    for img in images:
        w, h = img.width, img.height
        lines = []
        for ann in img.annotations.all():
            cls = class_ids[ann.label_id]
            if ann.kind == Annotation.Kind.POLYGON:
                lines.append(" ".join([str(cls), *(f"{x / w:.6f} {y / h:.6f}" for x, y in ann.points)]))
            else:
                x1, y1, x2, y2 = _box(ann.points)
                lines.append(f"{cls} {(x1 + x2) / 2 / w:.6f} {(y1 + y2) / 2 / h:.6f} "
                             f"{(x2 - x1) / w:.6f} {(y2 - y1) / h:.6f}")
        files[f"labels/{PurePosixPath(names[img.id]).stem}.txt"] = "\n".join(lines) + ("\n" if lines else "")
    return files


def _voc(images, labels, names):
    by_id = {lbl.id: lbl.name for lbl in labels}
    files = {}
    for img in images:
        root = Element("annotation")
        SubElement(root, "folder").text = "JPEGImages"
        SubElement(root, "filename").text = names[img.id]
        size = SubElement(root, "size")
        for tag, value in (("width", img.width), ("height", img.height), ("depth", 3)):
            SubElement(size, tag).text = str(value)
        for ann in img.annotations.all():
            obj = SubElement(root, "object")
            SubElement(obj, "name").text = by_id[ann.label_id]
            SubElement(obj, "difficult").text = "0"
            box = SubElement(obj, "bndbox")
            for tag, value in zip(("xmin", "ymin", "xmax", "ymax"), _box(ann.points)):
                SubElement(box, tag).text = f"{value:g}"
        files[f"Annotations/{PurePosixPath(names[img.id]).stem}.xml"] = tostring(root, encoding="unicode")
    return files


IMAGE_DIRS = {"coco": "images", "yolo": "images", "voc": "JPEGImages"}
WRITERS = {"coco": _coco, "yolo": _yolo, "voc": _voc}


def export_dataset(project, fmt: str, with_images: bool):
    """Write the dataset ZIP to a temporary file and return it, rewound. The caller closes it."""
    images = list(project.images.prefetch_related(
        Prefetch("annotations", queryset=Annotation.objects.filter(kind__in=EXPORT_KINDS).order_by("id"))
    ))
    labels = list(project.labels.all())
    names = _file_names(images)

    out = tempfile.TemporaryFile()
    try:
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
            for path, text in WRITERS[fmt](images, labels, names).items():
                zf.writestr(path, text)
            if with_images:
                for img in images:
                    with img.file.open("rb") as f:
                        # Images are already compressed; storing them is much faster
                        zf.writestr(f"{IMAGE_DIRS[fmt]}/{names[img.id]}", f.read(), zipfile.ZIP_STORED)
        out.seek(0)
    except Exception:
        out.close()
        raise
    return out
