"""Project creation: validates the upload, then writes everything in one transaction."""
import io
import random
from contextlib import ExitStack

from django.core.files.base import ContentFile
from django.db import transaction
from PIL import Image as PILImage

from .datasets import IMAGE_SUFFIXES, DatasetError, Entry, ParsedDataset, open_archive, parse_annotations
from .models import Annotation, Image, Label, Project

# Same palette as the frontend's label picker, so imported labels look familiar.
LABEL_PALETTE = ["#FF5A5F", "#4CCBFF", "#3B6CFF", "#F59E0B", "#10B981",
                 "#A855F7", "#EC4899", "#84CC16", "#F97316", "#14B8A6"]


def next_free_color(used: set[str]) -> str:
    for color in LABEL_PALETTE:
        if color.upper() not in used:
            return color
    while True:
        color = f"#{random.randrange(0x1000000):06X}"
        if color not in used:
            return color


def image_size(data: bytes, name: str) -> tuple[int, int]:
    """Return (width, height), rejecting files that are not decodable images."""
    try:
        with PILImage.open(io.BytesIO(data)) as img:
            size = img.size
            img.verify()
        return size
    except Exception:  # Pillow raises many types for bad input, incl. decompression bombs
        raise DatasetError(f"'{name}' is not a valid image.")


def read_dataset(fileobj, stack: ExitStack) -> tuple[list[Entry], ParsedDataset]:
    """Open the ZIP and parse it. The archive stays open until ``stack`` closes."""
    archive, entries = open_archive(fileobj)
    stack.callback(archive.close)
    images = [e for e in entries if e.suffix in IMAGE_SUFFIXES]
    if not images:
        raise DatasetError("No images found. The dataset must contain images and their annotations.")
    sizes = {e.path: image_size(e.read(), e.path) for e in images}
    parsed = parse_annotations(entries, sizes)
    if parsed is None:
        raise DatasetError(
            "No annotations found for these images. Supported formats: YOLO, COCO, Pascal VOC, CreateML."
        )
    return images, parsed


def merge_labels(given: list[dict], classes: list[str]) -> list[dict]:
    """User-defined labels first, then dataset classes not already present (case-insensitive)."""
    labels, seen = [], set()
    used = {g["color"].upper() for g in given}
    for item in [*given, *({"name": c} for c in classes)]:
        name = item["name"].strip()
        if not name or name.lower() in seen:
            continue
        if len(name) > Label._meta.get_field("name").max_length:
            raise DatasetError(f"Label name '{name[:40]}…' is too long.")
        color = item.get("color") or next_free_color(used)
        used.add(color.upper())
        seen.add(name.lower())
        labels.append({"name": name, "color": color.upper()})
    return labels


def create_project(*, owner, name, description="", color="#1DB4FF", labels=(), dataset=None, media=()):
    """Create a project with its labels, images and imported annotations.

    Raises ``DatasetError`` if the dataset ZIP is unusable. Either everything is
    saved or nothing is: on failure, files already written to storage are removed.
    """
    stored = []
    with ExitStack() as stack:
        images, parsed = read_dataset(dataset, stack) if dataset else ([], None)
        try:
            with transaction.atomic():
                project = Project.objects.create(
                    owner=owner, name=name, description=description, color=color.upper(),
                    dataset_name=getattr(dataset, "name", "") or "",
                    dataset_format=parsed.format if parsed else "",
                )
                label_rows = Label.objects.bulk_create(
                    Label(project=project, **item)
                    for item in merge_labels(list(labels), parsed.classes if parsed else [])
                )
                by_label = {lbl.name.lower(): lbl for lbl in label_rows}

                def save_image(original_name, content):
                    img = Image(project=project, original_name=original_name[:255])
                    img.file.save(content.name, content, save=False)
                    stored.append(img.file.name)
                    img.save()
                    return img

                annotations = []
                for entry in images:
                    img = save_image(entry.path, ContentFile(entry.read(), name=entry.name))
                    annotations += [
                        Annotation(image=img, label=by_label[s.label.lower()], kind=s.kind,
                                   points=s.points, source=Annotation.Source.IMPORTED)
                        for s in parsed.annotations.get(entry.path, [])
                    ]
                for upload in media:
                    save_image(upload.name, upload)
                Annotation.objects.bulk_create(annotations, batch_size=1000)

                project.thumbnail = project.images.first()
                project.save(update_fields=["thumbnail"])
        except Exception:
            storage = Image._meta.get_field("file").storage
            for path in stored:
                storage.delete(path)
            raise
    return project
