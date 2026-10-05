"""Project creation: validates the upload, then writes everything in one transaction."""
import io
import random
from contextlib import ExitStack
from pathlib import PurePosixPath

from django.core.files.base import ContentFile
from django.db import transaction
from PIL import Image as PILImage

from .datasets import IMAGE_SUFFIXES, DatasetError, Entry, ParsedDataset, open_archive, parse_annotations
from .models import Annotation, Image, Label, Project
from .videos import DEFAULT_FPS, extract_frames, is_video

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


def read_dataset(fileobj, stack: ExitStack) -> tuple[list[Entry], list[Entry], ParsedDataset | None]:
    """Open the ZIP and parse it. The archive stays open until ``stack`` closes.

    Images must come with annotations; videos are optional and are split into frames later.
    """
    archive, entries = open_archive(fileobj)
    stack.callback(archive.close)
    images = [e for e in entries if e.suffix in IMAGE_SUFFIXES]
    videos = [e for e in entries if is_video(e.path)]
    if not images and not videos:
        raise DatasetError("No images found. The dataset must contain images and their annotations, or videos.")
    if not images:
        return images, videos, None
    sizes = {e.path: image_size(e.read(), e.path) for e in images}
    parsed = parse_annotations(entries, sizes)
    if parsed is None:
        raise DatasetError(
            "No annotations found for these images. Supported formats: YOLO, COCO, Pascal VOC, CreateML."
        )
    return images, videos, parsed


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


def create_project(*, owner, name, description="", color="#1DB4FF", labels=(), dataset=None, media=(),
                   video_fps=DEFAULT_FPS):
    """Create a project with its labels, images, video frames and imported annotations.

    Raises ``DatasetError`` if the dataset ZIP is unusable. Either everything is
    saved or nothing is: on failure, files already written to storage are removed.
    """
    stored = []
    with ExitStack() as stack:
        images, videos, parsed = read_dataset(dataset, stack) if dataset else ([], [], None)
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

                def save_image(original_name, content, **frame):
                    img = Image(project=project, original_name=original_name[:255], **frame)
                    img.file.save(content.name, content, save=False)
                    stored.append(img.file.name)
                    img.save()
                    return img

                # Each frame is saved as an image, tagged with its video so the page can play them back
                video_names = set()
                def save_video(video_name, source):
                    key, n = video_name[:240], 2
                    while key in video_names:  # two videos with the same name stay apart
                        key, n = f"{video_name[:240]} ({n})", n + 1
                    video_names.add(key)
                    stem = PurePosixPath(video_name).stem
                    for frame in extract_frames(source, video_name, video_fps):
                        save_image(f"{stem}_frame_{frame.index:06d}.jpg", ContentFile(frame.data, name="frame.jpg"),
                                   video=key, frame_index=frame.index, frame_time=frame.time)

                annotations = []
                for entry in images:
                    img = save_image(entry.path, ContentFile(entry.read(), name=entry.name))
                    annotations += [
                        Annotation(image=img, label=by_label[s.label.lower()], kind=s.kind,
                                   points=s.points, source=Annotation.Source.IMPORTED)
                        for s in parsed.annotations.get(entry.path, [])
                    ]
                for entry in videos:
                    save_video(entry.path, entry.read())
                for upload in media:
                    if is_video(upload.name):
                        save_video(upload.name, upload)
                    else:
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
