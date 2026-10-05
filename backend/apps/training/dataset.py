"""Turns a project's annotations into a detection dataset (COCO format) for MMDetection.

Only shapes that describe an object's extent become boxes: rectangles, ellipses
(stored as their two bounding corners) and polygons. Points and polylines are kept
on the annotation page but are not usable for training a detector.
"""
import json
import random
from dataclasses import dataclass
from pathlib import Path

from django.db.models import Count, Exists, OuterRef, Q

from apps.projects.models import Annotation, Image, Label

BOX_KINDS = (Annotation.Kind.RECT, Annotation.Kind.ELLIPSE, Annotation.Kind.POLYGON)
MIN_BOX_SIDE = 1.0  # pixels; smaller boxes are dropped as degenerate


def dataset_summary(project) -> dict:
    """Counts shown on the Train page: how much of the project is annotated and usable."""
    images = Image.objects.filter(project=project)
    any_ann = Annotation.objects.filter(image=OuterRef("pk"))
    total = images.count()
    annotated = images.filter(Exists(any_ann)).count()
    usable = images.filter(Exists(any_ann.filter(kind__in=BOX_KINDS))).count()

    classes = (
        Label.objects.filter(project=project)
        .annotate(
            annotation_count=Count("annotations", filter=Q(annotations__kind__in=BOX_KINDS), distinct=True),
            image_count=Count("annotations__image", filter=Q(annotations__kind__in=BOX_KINDS), distinct=True),
        )
        .order_by("id")
    )
    return {
        "total_images": total,
        "annotated_images": annotated,
        "remaining_images": total - annotated,
        "annotated_percent": round(annotated * 100 / total, 1) if total else 0.0,
        "usable_images": usable,
        "classes": [
            {"id": c.id, "name": c.name, "color": c.color,
             "annotation_count": c.annotation_count, "image_count": c.image_count}
            for c in classes
        ],
    }


def split_counts(n: int, train_split: int) -> tuple[int, int]:
    """How many of ``n`` images go to (train, val).

    Training always gets at least one image; validation gets at least one whenever
    there are two or more, so a run can report metrics.
    """
    if n <= 0:
        return 0, 0
    if n == 1:
        return 1, 0
    # Round half up (not Python's banker's rounding) to match the frontend's Math.round.
    train = min(max(int(n * train_split / 100 + 0.5), 1), n - 1)
    return train, n - train


def split_ids(ids: list[int], train_split: int, seed: int) -> tuple[list[int], list[int]]:
    """Deterministic shuffle-and-split: the same seed always gives the same split."""
    ordered = sorted(ids)
    random.Random(seed).shuffle(ordered)
    n_train, _ = split_counts(len(ordered), train_split)
    return sorted(ordered[:n_train]), sorted(ordered[n_train:])


def shape_to_box(kind: str, points: list[list[float]]):
    """Return (bbox [x, y, w, h], segmentation, area) or None for a degenerate shape."""
    xs, ys = [p[0] for p in points], [p[1] for p in points]
    x0, y0, x1, y1 = min(xs), min(ys), max(xs), max(ys)
    w, h = x1 - x0, y1 - y0
    if w < MIN_BOX_SIDE or h < MIN_BOX_SIDE:
        return None
    if kind == Annotation.Kind.POLYGON:
        segmentation = [[c for p in points for c in p]]
        # Shoelace formula; fall back to the box for self-intersecting zero-area polygons.
        area = abs(sum(xs[i] * ys[i - 1] - xs[i - 1] * ys[i] for i in range(len(points)))) / 2 or w * h
    else:
        segmentation, area = [], w * h
    return [x0, y0, w, h], segmentation, area


@dataclass
class ExportedDataset:
    classes: list[str]
    train_ann: Path
    val_ann: Path | None
    train_images: int
    val_images: int


def build_coco(images, categories: dict[int, int], class_names: list[str]) -> dict:
    """COCO dict for ``images`` (with prefetched annotations). ``file_name`` is the storage name."""
    coco = {
        "images": [],
        "annotations": [],
        "categories": [{"id": i + 1, "name": name} for i, name in enumerate(class_names)],
    }
    for img in images:
        coco["images"].append({"id": img.id, "file_name": img.file.name, "width": img.width, "height": img.height})
        for ann in img.annotations.all():
            if ann.kind not in BOX_KINDS:
                continue
            shape = shape_to_box(ann.kind, ann.points)
            if shape is None:
                continue
            bbox, segmentation, area = shape
            coco["annotations"].append({
                "id": len(coco["annotations"]) + 1,
                "image_id": img.id,
                "category_id": categories[ann.label_id],
                "bbox": bbox,
                "segmentation": segmentation,
                "area": area,
                "iscrowd": 0,
            })
    return coco


def export_coco(project, out_dir: Path, train_split: int, seed: int) -> ExportedDataset:
    """Write train.json (and val.json when there is a validation set) to ``out_dir``.

    Raises ``ValueError`` when the project has no image with a usable annotation.
    """
    labels = list(Label.objects.filter(project=project).order_by("id"))
    categories = {lbl.id: i + 1 for i, lbl in enumerate(labels)}
    class_names = [lbl.name for lbl in labels]

    usable = (
        Image.objects.filter(project=project)
        .filter(Exists(Annotation.objects.filter(image=OuterRef("pk"), kind__in=BOX_KINDS)))
        .values_list("id", flat=True)
    )
    train_ids, val_ids = split_ids(list(usable), train_split, seed)
    if not train_ids:
        raise ValueError("No annotated images to train on. Draw boxes or polygons on some images first.")

    out_dir.mkdir(parents=True, exist_ok=True)

    def write(ids, filename):
        images = Image.objects.filter(id__in=ids).prefetch_related("annotations").order_by("id")
        path = out_dir / filename
        path.write_text(json.dumps(build_coco(images, categories, class_names)), encoding="utf-8")
        return path

    return ExportedDataset(
        classes=class_names,
        train_ann=write(train_ids, "train.json"),
        val_ann=write(val_ids, "val.json") if val_ids else None,
        train_images=len(train_ids),
        val_images=len(val_ids),
    )
