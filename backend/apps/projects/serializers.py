from pathlib import PurePosixPath

from django.conf import settings
from rest_framework import serializers

from .models import Annotation, Image, Label, Project, hex_color
from .videos import DEFAULT_FPS, is_video


class LabelSerializer(serializers.ModelSerializer):
    class Meta:
        model = Label
        fields = ("id", "name", "color")
        read_only_fields = ("id",)


class LabelInputSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100)
    color = serializers.CharField(validators=[hex_color])


class ProjectSerializer(serializers.ModelSerializer):
    owner = serializers.CharField(source="owner.username", read_only=True)
    labels = LabelSerializer(many=True, read_only=True)
    thumbnail = serializers.SerializerMethodField()
    # Annotated onto the queryset by ProjectViewSet.get_queryset
    image_count = serializers.IntegerField(read_only=True)
    annotated_count = serializers.IntegerField(read_only=True)
    is_labeled = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = (
            "id", "name", "description", "color", "owner", "labels", "thumbnail",
            "dataset_name", "dataset_format", "image_count", "annotated_count", "is_labeled",
            "created_at", "updated_at",
        )
        read_only_fields = ("dataset_name", "dataset_format", "created_at", "updated_at")

    def get_thumbnail(self, project):
        return _file_url(self.context.get("request"), project.thumbnail.file) if project.thumbnail else None

    def get_is_labeled(self, project):
        """True when the uploaded dataset brought its own annotations."""
        return bool(project.dataset_format) and getattr(project, "annotated_count", 0) > 0

    def validate_color(self, value):
        return value.upper()


class ProjectCreateSerializer(serializers.Serializer):
    """Multipart payload: plain fields, ``labels`` as a JSON string, a dataset ZIP and/or images and videos."""

    name = serializers.CharField(max_length=120)
    description = serializers.CharField(required=False, allow_blank=True, default="")
    color = serializers.CharField(required=False, default="#1DB4FF", validators=[hex_color])
    labels = serializers.JSONField(required=False, binary=True, default=list)
    dataset = serializers.FileField(required=False)
    media = serializers.ListField(child=serializers.FileField(), required=False, default=list)
    # Frames taken per second from each video; 0 keeps every frame
    video_fps = serializers.FloatField(required=False, default=DEFAULT_FPS, min_value=0, max_value=60)

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Project name is required.")
        return value

    def validate_labels(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("Expected a list of {name, color} objects.")
        items = LabelInputSerializer(data=value, many=True)
        items.is_valid(raise_exception=True)
        names = [item["name"].strip().lower() for item in items.validated_data]
        colors = [item["color"].upper() for item in items.validated_data]
        if len(set(names)) != len(names):
            raise serializers.ValidationError("Label names must be unique.")
        if len(set(colors)) != len(colors):
            raise serializers.ValidationError("Each label needs its own color.")
        return items.validated_data

    def validate_media(self, files):
        """Videos are checked when their frames are extracted; everything else must be an image."""
        image, errors = serializers.ImageField(), {}
        for i, upload in enumerate(files):
            if is_video(upload.name):
                continue
            try:
                image.run_validation(upload)
            except serializers.ValidationError as exc:
                errors[i] = exc.detail
        if errors:
            raise serializers.ValidationError(errors)
        return files

    def validate_dataset(self, value):
        if PurePosixPath(value.name).suffix.lower() != ".zip":
            raise serializers.ValidationError("Upload the dataset as a .zip file.")
        if value.size > settings.DATASET_LIMITS["MAX_ARCHIVE_BYTES"]:
            raise serializers.ValidationError("The ZIP file is too large.")
        return value

    def validate(self, attrs):
        if not attrs.get("dataset") and not attrs["media"]:
            raise serializers.ValidationError({"dataset": "Upload at least one image or a dataset."})
        # A dataset brings its own classes as labels; plain images need at least one.
        if not attrs.get("dataset") and not attrs["labels"]:
            raise serializers.ValidationError({"labels": "Add at least one label."})
        return attrs


class AnnotationSerializer(serializers.ModelSerializer):
    # Writable so a replace (PUT) can keep existing annotations, e.g. imported ones.
    id = serializers.IntegerField(required=False)
    label = serializers.PrimaryKeyRelatedField(queryset=Label.objects.none())
    points = serializers.ListField(
        child=serializers.ListField(child=serializers.FloatField(), min_length=2, max_length=2),
        min_length=1,
    )

    class Meta:
        model = Annotation
        fields = ("id", "label", "kind", "points", "source")
        read_only_fields = ("source",)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        image = self.context.get("image")
        if image is not None:  # only labels of this image's project may be used
            self.fields["label"].queryset = Label.objects.filter(project_id=image.project_id)

    def validate(self, attrs):
        kind, points = attrs["kind"], attrs["points"]
        need = Annotation.MIN_POINTS[kind]
        if kind in (Annotation.Kind.RECT, Annotation.Kind.ELLIPSE) and len(points) != 2:
            raise serializers.ValidationError({"points": f"A {kind} needs exactly 2 points."})
        if len(points) < need:
            raise serializers.ValidationError({"points": f"A {kind} needs at least {need} points."})
        image = self.context["image"]
        if any(not (0 <= x <= image.width and 0 <= y <= image.height) for x, y in points):
            raise serializers.ValidationError({"points": "Points must lie inside the image."})
        return attrs


class ImageSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()
    annotations = AnnotationSerializer(many=True, read_only=True)

    class Meta:
        model = Image
        fields = ("id", "url", "original_name", "width", "height", "video", "frame_index", "frame_time", "annotations")

    def get_url(self, image):
        return _file_url(self.context.get("request"), image.file)


def _file_url(request, file):
    return request.build_absolute_uri(file.url) if request else file.url
