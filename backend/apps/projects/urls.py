from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import ImageAnnotationsView, ProjectViewSet

app_name = "projects"

router = DefaultRouter()
router.register("", ProjectViewSet, basename="project")

urlpatterns = [
    path(
        "<int:project_id>/images/<int:image_id>/annotations/",
        ImageAnnotationsView.as_view(),
        name="image-annotations",
    ),
    *router.urls,
]
