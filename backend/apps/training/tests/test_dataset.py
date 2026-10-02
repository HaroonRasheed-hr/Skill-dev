import json
from pathlib import Path

from django.test import SimpleTestCase, TestCase

from apps.projects.models import Annotation
from apps.training.dataset import dataset_summary, export_coco, shape_to_box, split_counts, split_ids

from .helpers import TempStorageMixin, add_image, annotate, make_project, make_user, project_with_images

K = Annotation.Kind


class ShapeToBoxTests(SimpleTestCase):
    def test_rect_in_any_corner_order(self):
        bbox, seg, area = shape_to_box(K.RECT, [[30, 25], [10, 5]])
        self.assertEqual(bbox, [10, 5, 20, 20])
        self.assertEqual(seg, [])
        self.assertEqual(area, 400)

    def test_ellipse_uses_its_bounding_corners(self):
        bbox, _, area = shape_to_box(K.ELLIPSE, [[0, 0], [8, 4]])
        self.assertEqual(bbox, [0, 0, 8, 4])
        self.assertEqual(area, 32)

    def test_polygon_gets_segmentation_and_shoelace_area(self):
        bbox, seg, area = shape_to_box(K.POLYGON, [[0, 0], [10, 0], [10, 10]])
        self.assertEqual(bbox, [0, 0, 10, 10])
        self.assertEqual(seg, [[0, 0, 10, 0, 10, 10]])
        self.assertEqual(area, 50)

    def test_degenerate_shapes_are_dropped(self):
        self.assertIsNone(shape_to_box(K.RECT, [[5, 5], [5, 20]]))  # zero width
        self.assertIsNone(shape_to_box(K.RECT, [[5, 5], [5.5, 5.5]]))  # under a pixel


class SplitTests(SimpleTestCase):
    def test_counts(self):
        self.assertEqual(split_counts(0, 70), (0, 0))
        self.assertEqual(split_counts(1, 70), (1, 0))
        self.assertEqual(split_counts(10, 70), (7, 3))
        self.assertEqual(split_counts(10, 95), (9, 1))  # validation keeps one image
        self.assertEqual(split_counts(3, 10), (1, 2))  # training keeps one image
        self.assertEqual(split_counts(5, 70), (4, 1))  # 3.5 rounds half up, like Math.round

    def test_split_is_deterministic_and_disjoint(self):
        ids = list(range(1, 21))
        a = split_ids(ids, 70, seed=1)
        self.assertEqual(a, split_ids(list(reversed(ids)), 70, seed=1))
        train, val = a
        self.assertEqual((len(train), len(val)), (14, 6))
        self.assertFalse(set(train) & set(val))
        self.assertEqual(sorted(train + val), ids)

    def test_different_seeds_give_different_splits(self):
        ids = list(range(100))
        self.assertNotEqual(split_ids(ids, 70, 1), split_ids(ids, 70, 2))


class DatasetSummaryTests(TempStorageMixin, TestCase):
    def test_counts_annotated_remaining_and_usable(self):
        project = project_with_images(make_user(), annotated=3, plain=2)
        car = project.labels.get(name="car")
        # Annotated, but only with points: counts as annotated, not usable for detection.
        annotate(add_image(project, "pts.png"), car, kind=K.POINTS, points=[(1, 1)])

        s = dataset_summary(project)
        self.assertEqual(s["total_images"], 6)
        self.assertEqual(s["annotated_images"], 4)
        self.assertEqual(s["remaining_images"], 2)
        self.assertEqual(s["annotated_percent"], 66.7)
        self.assertEqual(s["usable_images"], 3)
        by_name = {c["name"]: c for c in s["classes"]}
        self.assertEqual(by_name["car"]["annotation_count"], 2)
        self.assertEqual(by_name["car"]["image_count"], 2)
        self.assertEqual(by_name["person"]["annotation_count"], 1)

    def test_empty_project(self):
        s = dataset_summary(make_project(make_user()))
        self.assertEqual((s["total_images"], s["annotated_percent"], s["usable_images"]), (0, 0.0, 0))


class ExportCocoTests(TempStorageMixin, TestCase):
    def setUp(self):
        self.project = project_with_images(make_user(), annotated=4, plain=1)
        self.out = Path(self._tmp) / "export" / str(self.id())

    def test_writes_train_and_val_json(self):
        data = export_coco(self.project, self.out, train_split=75, seed=3)
        self.assertEqual((data.train_images, data.val_images), (3, 1))
        self.assertEqual(data.classes, ["car", "person"])

        train = json.loads(data.train_ann.read_text())
        val = json.loads(data.val_ann.read_text())
        self.assertEqual([c["name"] for c in train["categories"]], ["car", "person"])
        self.assertEqual([c["id"] for c in train["categories"]], [1, 2])
        self.assertEqual(len(train["images"]), 3)
        self.assertEqual(len(train["annotations"]), 3)
        # Unannotated images are left out entirely.
        all_ids = {i["id"] for i in train["images"]} | {i["id"] for i in val["images"]}
        self.assertEqual(len(all_ids), 4)
        image = train["images"][0]
        self.assertTrue(image["file_name"].startswith(f"projects/{self.project.id}/images/"))
        self.assertTrue((Path(self._tmp) / "media" / image["file_name"]).is_file())
        ann = train["annotations"][0]
        self.assertEqual(ann["bbox"], [10, 5, 20, 20])
        self.assertEqual(ann["iscrowd"], 0)

    def test_skips_points_polylines_and_degenerate_boxes(self):
        img = self.project.images.filter(annotations__isnull=False).first()
        car = self.project.labels.get(name="car")
        annotate(img, car, kind=K.POLYLINE, points=[(0, 0), (20, 20)])
        annotate(img, car, kind=K.POINTS, points=[(3, 3)])
        annotate(img, car, kind=K.RECT, points=[(3, 3), (3, 9)])
        data = export_coco(self.project, self.out, train_split=95, seed=0)
        anns = [a for f in (data.train_ann, data.val_ann)
                for a in json.loads(f.read_text())["annotations"] if a["image_id"] == img.id]
        self.assertEqual(len(anns), 1)

    def test_single_image_has_no_validation_set(self):
        project = make_project(make_user("bob"))
        annotate(add_image(project), project.labels.first())
        data = export_coco(project, self.out, train_split=70, seed=0)
        self.assertEqual((data.train_images, data.val_images, data.val_ann), (1, 0, None))

    def test_raises_without_usable_annotations(self):
        project = make_project(make_user("eve"))
        add_image(project)
        with self.assertRaisesMessage(ValueError, "No annotated images"):
            export_coco(project, self.out, train_split=70, seed=0)
