from django.core.exceptions import SuspiciousFileOperation
from django.db import transaction
from django.db.models import Count, Prefetch, Q
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils.text import get_valid_filename
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .datasets import DatasetError
from .exports import FORMATS as EXPORT_FORMATS
from .exports import export_dataset
from .models import Annotation, Image, Project
from .serializers import (
    AnnotationSerializer,
    ImageSerializer,
    ProjectCreateSerializer,
    ProjectSerializer,
)
from .services import create_project, import_into_project


def owned_projects(user):
    return Project.objects.filter(owner=user)


def safe_filename(value: str) -> str:
    try:
        return get_valid_filename(value)[:150]
    except SuspiciousFileOperation:  # nothing usable left, e.g. an empty name
        return ""


class ImagePagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 200


class ProjectViewSet(viewsets.ModelViewSet):
    """CRUD for the current user's projects. Other users' projects return 404."""

    serializer_class = ProjectSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        return (
            owned_projects(self.request.user)
            .select_related("owner", "thumbnail")
            .prefetch_related("labels")
            .annotate(
                image_count=Count("images", distinct=True),
                annotated_count=Count("images", filter=Q(images__annotations__isnull=False), distinct=True),
            )
        )

    def create(self, request, *args, **kwargs):
        payload = ProjectCreateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        try:
            project = create_project(owner=request.user, **payload.validated_data)
        except DatasetError as exc:
            raise serializers.ValidationError({"dataset": [str(exc)]})
        data = self.get_serializer(self.get_queryset().get(pk=project.pk)).data
        return Response(data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"])
    def images(self, request, pk=None):
        """Paginated images of the project, each with its annotations."""
        project = self.get_object()
        images = project.images.prefetch_related(
            Prefetch("annotations", queryset=Annotation.objects.order_by("id"))
        )
        paginator = ImagePagination()
        page = paginator.paginate_queryset(images, request, view=self)
        return paginator.get_paginated_response(
            ImageSerializer(page, many=True, context=self.get_serializer_context()).data
        )

    @action(detail=True, methods=["get"], url_path="export")
    def export_dataset(self, request, pk=None):
        """Download the project as a dataset ZIP.

        Query: ``dataset_format`` (coco | yolo | voc), ``images`` (1 to include image files),
        ``name`` (optional file name). Not ``format``: DRF reserves it for renderers.
        """
        project = self.get_object()
        fmt = request.query_params.get("dataset_format", "")
        if fmt not in EXPORT_FORMATS:
            raise serializers.ValidationError({"dataset_format": [f"Use one of: {', '.join(EXPORT_FORMATS)}."]})
        with_images = request.query_params.get("images") in ("1", "true")
        name = safe_filename(request.query_params.get("name", "").strip().removesuffix(".zip")) \
            or safe_filename(f"{project.name}_{fmt}") or f"project_{project.pk}_{fmt}"
        return FileResponse(export_dataset(project, fmt, with_images), as_attachment=True,
                            filename=f"{name}.zip", content_type="application/zip")

    @action(detail=True, methods=["post"], url_path="import")
    def import_dataset(self, request, pk=None):
        """Add the images and annotations of an uploaded dataset ZIP (field ``dataset``) to the project."""
        project = self.get_object()
        dataset = request.FILES.get("dataset")
        if dataset is None:
            raise serializers.ValidationError({"dataset": ["Upload a .zip dataset file."]})
        try:
            import_into_project(project=project, dataset=dataset)
        except DatasetError as exc:
            raise serializers.ValidationError({"dataset": [str(exc)]})
        return Response(self.get_serializer(self.get_queryset().get(pk=project.pk)).data)


class ImageAnnotationsView(APIView):
    """GET an image's annotations; PUT replaces them all (what the annotation page saves).

    Items sent back with their ``id`` are updated in place and keep their source;
    items without an ``id`` are created; existing ones left out are deleted.
    """

    def get_image(self):
        return get_object_or_404(
            Image.objects.select_related("project"),
            pk=self.kwargs["image_id"],
            project__in=owned_projects(self.request.user),
            project_id=self.kwargs["project_id"],
        )

    def get(self, request, project_id, image_id):
        image = self.get_image()
        return Response(AnnotationSerializer(image.annotations.all(), many=True).data)

    def put(self, request, project_id, image_id):
        image = self.get_image()
        items = request.data.get("annotations") if isinstance(request.data, dict) else None
        if not isinstance(items, list):
            raise serializers.ValidationError({"annotations": ["Expected a list."]})
        incoming = AnnotationSerializer(data=items, many=True, context={"image": image})
        incoming.is_valid(raise_exception=True)

        with transaction.atomic():
            existing = {a.id: a for a in image.annotations.select_for_update()}
            keep, create = [], []
            for item in incoming.validated_data:
                current = existing.get(item.pop("id", None))
                if current:
                    for field, value in item.items():
                        setattr(current, field, value)
                    keep.append(current)
                else:
                    create.append(Annotation(image=image, source=Annotation.Source.MANUAL, **item))
            kept_ids = {a.id for a in keep}
            image.annotations.exclude(id__in=kept_ids).delete()
            Annotation.objects.bulk_update(keep, ["label", "kind", "points"])
            Annotation.objects.bulk_create(create)
            image.project.save(update_fields=["updated_at"])

        return Response(AnnotationSerializer(image.annotations.all(), many=True).data)
