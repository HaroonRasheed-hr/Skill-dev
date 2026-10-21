import shutil
import tempfile

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings

from apps.projects.models import Annotation, Image, Label, Project
from apps.projects.tests.helpers import png_bytes

User = get_user_model()

RECT = Annotation.Kind.RECT


class TempStorageMixin:
    """Gives each test class its own MEDIA_ROOT and TRAINING root, removed afterwards."""

    @classmethod
    def setUpClass(cls):
        cls._tmp = tempfile.mkdtemp(prefix="skillwala-training-test-")
        cls._override = override_settings(
            MEDIA_ROOT=f"{cls._tmp}/media",
            TRAINING={"ROOT": f"{cls._tmp}/runs", "DEFAULT_EPOCHS": 12, "MAX_EPOCHS": 100,
                      "CPU_THREADS": 1, "POLL_SECONDS": 0.01, "PROGRESS_SECONDS": 0},
        )
        cls._override.enable()
        super().setUpClass()

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        cls._override.disable()
        shutil.rmtree(cls._tmp, ignore_errors=True)


def make_user(name="ada"):
    return User.objects.create_user(name, f"{name}@example.com", "pw")


def make_project(owner, labels=("car", "person")):
    project = Project.objects.create(owner=owner, name="Street")
    colors = ["#FF5A5F", "#4CCBFF", "#3B6CFF"]
    for name, color in zip(labels, colors):
        Label.objects.create(project=project, name=name, color=color)
    return project


def add_image(project, name="a.png", size=(100, 50)):
    img = Image(project=project, original_name=name)
    img.file.save(name, SimpleUploadedFile(name, png_bytes(*size)), save=False)
    img.save()
    return img


def annotate(image, label, kind=RECT, points=((10, 5), (30, 25))):
    return Annotation.objects.create(image=image, label=label, kind=kind, points=[list(p) for p in points])


def project_with_images(owner, annotated=3, plain=2):
    """``annotated`` images with one box each (alternating labels), plus ``plain`` empty ones."""
    project = make_project(owner)
    labels = list(project.labels.all())
    for i in range(annotated):
        annotate(add_image(project, f"ann{i}.png"), labels[i % len(labels)])
    for i in range(plain):
        add_image(project, f"plain{i}.png")
    return project
