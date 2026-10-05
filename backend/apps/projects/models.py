import uuid
from pathlib import PurePosixPath

from django.conf import settings
from django.core.validators import RegexValidator
from django.db import models
from django.db.models.functions import Lower

hex_color = RegexValidator(r"^#[0-9A-Fa-f]{6}$", "Use a hex color like #1DB4FF.")


class Project(models.Model):
    class DatasetFormat(models.TextChoices):
        NONE = "", "None"
        YOLO = "YOLO", "YOLO"
        COCO = "COCO", "COCO"
        VOC = "Pascal VOC", "Pascal VOC"
        CREATEML = "CreateML", "CreateML"

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="projects")
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    color = models.CharField(max_length=7, default="#1DB4FF", validators=[hex_color])
    dataset_name = models.CharField(max_length=255, blank=True)
    dataset_format = models.CharField(max_length=16, choices=DatasetFormat.choices, blank=True)
    thumbnail = models.ForeignKey("Image", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        indexes = [models.Index(fields=["owner", "-updated_at"])]

    def __str__(self):
        return self.name


class Label(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="labels")
    name = models.CharField(max_length=100)
    color = models.CharField(max_length=7, validators=[hex_color])

    class Meta:
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(Lower("name"), "project", name="unique_label_name_per_project"),
        ]

    def __str__(self):
        return self.name


def image_upload_to(instance, filename):
    # Random names: never trust (or collide on) names that came from the upload.
    return f"projects/{instance.project_id}/images/{uuid.uuid4().hex}{PurePosixPath(filename).suffix.lower()}"


class Image(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="images")
    file = models.ImageField(upload_to=image_upload_to, width_field="width", height_field="height")
    original_name = models.CharField(max_length=255)
    width = models.PositiveIntegerField()
    height = models.PositiveIntegerField()
    # Set when the image is a frame extracted from an uploaded video
    video = models.CharField(max_length=255, blank=True)
    frame_index = models.PositiveIntegerField(null=True, blank=True)
    frame_time = models.FloatField(null=True, blank=True)  # seconds from the video's start
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return self.original_name


class Annotation(models.Model):
    class Kind(models.TextChoices):
        RECT = "rect"
        POLYGON = "polygon"
        POLYLINE = "polyline"
        POINTS = "points"
        ELLIPSE = "ellipse"

    class Source(models.TextChoices):
        IMPORTED = "imported"
        MANUAL = "manual"

    # Minimum number of points each kind needs to be a valid shape.
    MIN_POINTS = {Kind.RECT: 2, Kind.ELLIPSE: 2, Kind.POLYGON: 3, Kind.POLYLINE: 2, Kind.POINTS: 1}

    image = models.ForeignKey(Image, on_delete=models.CASCADE, related_name="annotations")
    label = models.ForeignKey(Label, on_delete=models.CASCADE, related_name="annotations")
    kind = models.CharField(max_length=10, choices=Kind.choices)
    # [[x, y], ...] in pixel coordinates of the image
    points = models.JSONField()
    source = models.CharField(max_length=10, choices=Source.choices, default=Source.MANUAL)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return f"{self.kind} {self.label} on {self.image}"
