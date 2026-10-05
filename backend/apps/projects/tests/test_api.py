import json
import shutil
import tempfile
from pathlib import Path
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.projects.models import Annotation, Image, Label, Project

from .helpers import coco_files, make_zip, png_bytes, video_bytes, yolo_files

User = get_user_model()
MEDIA_ROOT = tempfile.mkdtemp(prefix="skillwala-test-media-")


def stored_files():
    return {str(p) for p in Path(MEDIA_ROOT).rglob("*") if p.is_file()}


@override_settings(MEDIA_ROOT=MEDIA_ROOT)
class ProjectApiTestCase(APITestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(MEDIA_ROOT, ignore_errors=True)

    def setUp(self):
        self.user = User.objects.create_user("ada", "ada@example.com", "pw", first_name="A", last_name="L")
        self.client.force_authenticate(self.user)

    def create(self, **payload):
        payload.setdefault("name", "Street")
        if isinstance(payload.get("labels"), list):
            payload["labels"] = json.dumps(payload["labels"])
        return self.client.post(reverse("projects:project-list"), payload, format="multipart")

    def create_from_coco(self, **payload):
        res = self.create(dataset=make_zip(coco_files()), **payload)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        return res


class CreateProjectTests(ProjectApiTestCase):
    def test_zip_with_annotations_creates_labeled_project(self):
        res = self.create_from_coco(description="Cars", color="#ff5a5f")
        self.assertEqual(res.data["dataset_format"], "COCO")
        self.assertEqual(res.data["dataset_name"], "dataset.zip")
        self.assertTrue(res.data["is_labeled"])
        self.assertEqual(res.data["image_count"], 3)
        self.assertEqual(res.data["annotated_count"], 2)
        self.assertEqual(res.data["color"], "#FF5A5F")
        self.assertEqual([l["name"] for l in res.data["labels"]], ["car", "person"])
        self.assertTrue(res.data["thumbnail"].startswith("http://testserver/media/projects/"))

        project = Project.objects.get(pk=res.data["id"])
        self.assertEqual(project.owner, self.user)
        self.assertEqual(Annotation.objects.filter(image__project=project, source="imported").count(), 2)
        image = project.images.get(original_name="data/images/a.png")
        self.assertEqual((image.width, image.height), (100, 50))

    def test_dataset_classes_merge_with_user_labels_case_insensitively(self):
        res = self.create_from_coco(labels=[{"name": "CAR", "color": "#123456"}, {"name": "tree", "color": "#654321"}])
        labels = {l["name"]: l["color"] for l in res.data["labels"]}
        self.assertEqual(labels, {"CAR": "#123456", "tree": "#654321", "person": "#FF5A5F"})
        # Imported "car" boxes attach to the user's "CAR" label
        self.assertEqual(Annotation.objects.filter(label__name="CAR").count(), 1)

    def test_yolo_zip(self):
        res = self.create(dataset=make_zip(yolo_files()))
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(res.data["dataset_format"], "YOLO")
        self.assertEqual([l["name"] for l in res.data["labels"]], ["dog", "cat"])

    def test_plain_images_without_dataset(self):
        res = self.create(
            media=[SimpleUploadedFile("one.png", png_bytes()), SimpleUploadedFile("two.png", png_bytes())],
            labels=[{"name": "car", "color": "#FF5A5F"}],
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(res.data["image_count"], 2)
        self.assertEqual(res.data["dataset_format"], "")
        self.assertFalse(res.data["is_labeled"])

    def test_uploaded_video_is_split_into_frames(self):
        res = self.create(
            media=[SimpleUploadedFile("clip.avi", video_bytes(frames=20, fps=10))],
            labels=[{"name": "car", "color": "#FF5A5F"}], video_fps=5,
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        frames = list(Image.objects.order_by("id"))
        self.assertEqual(len(frames), 10)  # 2 s at 5 fps
        self.assertEqual({f.video for f in frames}, {"clip.avi"})
        self.assertEqual([f.frame_index for f in frames], list(range(10)))
        self.assertAlmostEqual(frames[1].frame_time, 0.2)
        self.assertEqual((frames[0].width, frames[0].height), (64, 48))

    def test_zip_with_only_videos_is_accepted(self):
        res = self.create(dataset=make_zip({"videos/a.avi": video_bytes(frames=6)}),
                          labels=[{"name": "car", "color": "#FF5A5F"}], video_fps=0)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(res.data["image_count"], 6)
        self.assertEqual(res.data["dataset_format"], "")

    def test_unreadable_video_is_rejected(self):
        res = self.create(media=[SimpleUploadedFile("clip.mp4", b"not a video")],
                          labels=[{"name": "car", "color": "#FF5A5F"}])
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("could not be read as a video", res.data["dataset"][0])
        self.assertFalse(Project.objects.exists())

    def test_zip_without_annotations_is_rejected_and_nothing_is_saved(self):
        res = self.create(dataset=make_zip({"a.png": png_bytes()}))
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("No annotations found", res.data["dataset"][0])
        self.assertFalse(Project.objects.exists())

    def test_zip_without_images_is_rejected(self):
        res = self.create(dataset=make_zip({"labels.txt": "0 .5 .5 .1 .1"}))
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("No images found", res.data["dataset"][0])

    def test_corrupt_image_in_zip_is_rejected(self):
        files = coco_files()
        files["data/images/a.png"] = b"not an image"
        res = self.create(dataset=make_zip(files))
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("is not a valid image", res.data["dataset"][0])

    def test_non_zip_dataset_is_rejected(self):
        res = self.create(dataset=SimpleUploadedFile("data.rar", b"x"))
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("dataset", res.data)

    def test_validation_errors(self):
        cases = [
            ({"name": "  ", "dataset": make_zip(coco_files())}, "name"),
            ({}, "dataset"),
            ({"media": [SimpleUploadedFile("a.png", png_bytes())]}, "labels"),
            ({"dataset": make_zip(coco_files()), "color": "blue"}, "color"),
            ({"dataset": make_zip(coco_files()), "labels": "not json"}, "labels"),
            ({"dataset": make_zip(coco_files()),
              "labels": [{"name": "a", "color": "#111111"}, {"name": "A", "color": "#222222"}]}, "labels"),
            ({"dataset": make_zip(coco_files()),
              "labels": [{"name": "a", "color": "#111111"}, {"name": "b", "color": "#111111"}]}, "labels"),
        ]
        for payload, field in cases:
            with self.subTest(field=field, payload=payload):
                res = self.create(**payload)
                self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn(field, res.data)
        self.assertFalse(Project.objects.exists())

    def test_failure_mid_import_rolls_back_rows_and_files(self):
        before = stored_files()
        with mock.patch.object(Annotation.objects, "bulk_create", side_effect=RuntimeError("db down")):
            with self.assertRaises(RuntimeError):
                self.create(dataset=make_zip(coco_files()))
        self.assertFalse(Project.objects.exists())
        self.assertFalse(Image.objects.exists())
        self.assertEqual(stored_files(), before)

    def test_requires_authentication(self):
        self.client.force_authenticate(None)
        res = self.create(dataset=make_zip(coco_files()))
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


class ProjectReadTests(ProjectApiTestCase):
    def test_list_only_shows_own_projects(self):
        self.create_from_coco()
        other = User.objects.create_user("bob", "bob@example.com", "pw")
        Project.objects.create(owner=other, name="Secret")
        res = self.client.get(reverse("projects:project-list"))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual([p["name"] for p in res.data], ["Street"])
        self.assertTrue(res.data[0]["is_labeled"])

    def test_other_users_project_is_not_found(self):
        other = User.objects.create_user("bob", "bob@example.com", "pw")
        secret = Project.objects.create(owner=other, name="Secret")
        for url in (reverse("projects:project-detail", args=[secret.pk]),
                    reverse("projects:project-images", args=[secret.pk])):
            self.assertEqual(self.client.get(url).status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(self.client.delete(reverse("projects:project-detail", args=[secret.pk])).status_code, 404)

    def test_images_endpoint_returns_annotations_for_annotation_page(self):
        pk = self.create_from_coco().data["id"]
        res = self.client.get(reverse("projects:project-images", args=[pk]))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["count"], 3)
        first = res.data["results"][0]
        self.assertEqual(first["original_name"], "data/images/a.png")
        self.assertEqual((first["width"], first["height"]), (100, 50))
        car = Label.objects.get(project_id=pk, name="car")
        self.assertEqual(first["annotations"], [
            {"id": first["annotations"][0]["id"], "label": car.pk, "kind": "rect",
             "points": [[10, 5], [30, 15]], "source": "imported"},
        ])
        self.assertEqual(res.data["results"][2]["annotations"], [])

    def test_images_are_paginated(self):
        pk = self.create_from_coco().data["id"]
        res = self.client.get(reverse("projects:project-images", args=[pk]), {"page_size": 2})
        self.assertEqual(len(res.data["results"]), 2)
        self.assertIsNotNone(res.data["next"])

    def test_update_and_delete(self):
        pk = self.create_from_coco().data["id"]
        url = reverse("projects:project-detail", args=[pk])
        res = self.client.patch(url, {"name": "Renamed", "color": "#abcdef"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual((res.data["name"], res.data["color"]), ("Renamed", "#ABCDEF"))
        # Import metadata can't be changed by clients
        self.client.patch(url, {"dataset_format": "YOLO"}, format="json")
        self.assertEqual(Project.objects.get(pk=pk).dataset_format, "COCO")

        storage = Image._meta.get_field("file").storage
        files = list(Image.objects.values_list("file", flat=True))
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.client.delete(url).status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Project.objects.exists())
        self.assertFalse(any(storage.exists(f) for f in files))


class AnnotationApiTests(ProjectApiTestCase):
    def setUp(self):
        super().setUp()
        self.project = Project.objects.get(pk=self.create_from_coco().data["id"])
        self.image = self.project.images.get(original_name="data/images/a.png")
        self.car = self.project.labels.get(name="car")
        self.person = self.project.labels.get(name="person")
        self.url = reverse("projects:image-annotations", args=[self.project.pk, self.image.pk])

    def put(self, annotations):
        return self.client.put(self.url, {"annotations": annotations}, format="json")

    def test_get_annotations(self):
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data), 1)

    def test_put_updates_keeps_and_creates(self):
        imported = self.image.annotations.get()
        res = self.put([
            {"id": imported.pk, "label": self.person.pk, "kind": "rect", "points": [[0, 0], [5, 5]]},
            {"label": self.car.pk, "kind": "polygon", "points": [[1, 1], [9, 1], [9, 9]]},
        ])
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual([(a["label"], a["kind"], a["source"]) for a in res.data], [
            (self.person.pk, "rect", "imported"),
            (self.car.pk, "polygon", "manual"),
        ])
        self.assertEqual(res.data[0]["id"], imported.pk)

    def test_put_with_empty_list_clears_annotations(self):
        self.assertEqual(self.put([]).data, [])
        self.assertFalse(self.image.annotations.exists())

    def test_put_rejects_invalid_shapes(self):
        other_label = Label.objects.create(
            project=Project.objects.create(owner=self.user, name="Other"), name="x", color="#000000")
        cases = [
            {"label": self.car.pk, "kind": "rect", "points": [[0, 0]]},
            {"label": self.car.pk, "kind": "rect", "points": [[0, 0], [1, 1], [2, 2]]},
            {"label": self.car.pk, "kind": "polygon", "points": [[0, 0], [1, 1]]},
            {"label": self.car.pk, "kind": "rect", "points": [[0, 0], [101, 10]]},
            {"label": self.car.pk, "kind": "circle", "points": [[0, 0], [1, 1]]},
            {"label": self.car.pk, "kind": "points", "points": [[0, 0, 0]]},
            {"label": other_label.pk, "kind": "rect", "points": [[0, 0], [1, 1]]},
        ]
        for item in cases:
            with self.subTest(item=item):
                self.assertEqual(self.put([item]).status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.image.annotations.count(), 1)

    def test_put_requires_list(self):
        res = self.client.put(self.url, {"annotations": "nope"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_image_of_another_users_project_is_not_found(self):
        self.client.force_authenticate(User.objects.create_user("bob", "bob@example.com", "pw"))
        self.assertEqual(self.client.get(self.url).status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(self.put([]).status_code, status.HTTP_404_NOT_FOUND)

    def test_image_must_belong_to_project_in_url(self):
        other = Project.objects.create(owner=self.user, name="Other")
        url = reverse("projects:image-annotations", args=[other.pk, self.image.pk])
        self.assertEqual(self.client.get(url).status_code, status.HTTP_404_NOT_FOUND)
