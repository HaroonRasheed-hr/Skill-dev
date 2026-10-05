"""Unit tests for the ZIP reader and the annotation format parsers (no database)."""
import io
import zipfile

from django.test import SimpleTestCase, override_settings

from apps.projects.datasets import DatasetError, open_archive, parse_annotations

from .helpers import coco_files, createml_files, make_zip, png_bytes, voc_files, yolo_files

LIMITS = {
    "MAX_ARCHIVE_BYTES": 10 * 1024 * 1024,
    "MAX_UNCOMPRESSED_BYTES": 10 * 1024 * 1024,
    "MAX_FILES": 50,
    "MAX_COMPRESSION_RATIO": 200,
}


@override_settings(DATASET_LIMITS=LIMITS)
class ArchiveTests(SimpleTestCase):
    def entries(self, files):
        archive, entries = open_archive(make_zip(files))
        self.addCleanup(archive.close)
        return entries

    def test_lists_files_and_skips_hidden_and_macos_metadata(self):
        entries = self.entries({
            "a/one.png": b"1", "__MACOSX/a/._one.png": b"x", "a/.DS_Store": b"x", ".git/config": b"x",
        })
        self.assertEqual([e.path for e in entries], ["a/one.png"])
        self.assertEqual(entries[0].read(), b"1")
        self.assertEqual(entries[0].stem, "one")

    def test_rejects_non_zip(self):
        with self.assertRaisesMessage(DatasetError, "not a valid ZIP"):
            open_archive(io.BytesIO(b"definitely not a zip"))

    def test_rejects_path_traversal(self):
        with self.assertRaisesMessage(DatasetError, "unsafe file paths"):
            self.entries({"../evil.png": b"x"})

    def test_rejects_absolute_paths(self):
        with self.assertRaisesMessage(DatasetError, "unsafe file paths"):
            self.entries({"/etc/passwd": b"x"})

    @override_settings(DATASET_LIMITS={**LIMITS, "MAX_FILES": 2})
    def test_rejects_too_many_files(self):
        with self.assertRaisesMessage(DatasetError, "too many files"):
            self.entries({f"{i}.png": b"x" for i in range(3)})

    @override_settings(DATASET_LIMITS={**LIMITS, "MAX_UNCOMPRESSED_BYTES": 10})
    def test_rejects_archives_that_expand_too_much(self):
        with self.assertRaisesMessage(DatasetError, "expands to more data"):
            self.entries({"big.txt": b"x" * 11})

    def test_rejects_zip_bomb_compression_ratio(self):
        with self.assertRaisesMessage(DatasetError, "suspicious compression ratio"):
            self.entries({"bomb.txt": b"\0" * (5 * 1024 * 1024)})

    @override_settings(DATASET_LIMITS={**LIMITS, "MAX_ARCHIVE_BYTES": 10})
    def test_rejects_oversized_upload(self):
        with self.assertRaisesMessage(DatasetError, "too large"):
            open_archive(make_zip({"a.png": b"1234567890"}))

    def test_rejects_encrypted_entries(self):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("a.png", b"x")
        raw = bytearray(buf.getvalue())
        # Set the "encrypted" flag bit in the central directory header.
        central = raw.rfind(b"PK\x01\x02")
        raw[central + 8] |= 0x1
        with self.assertRaisesMessage(DatasetError, "Encrypted"):
            open_archive(io.BytesIO(bytes(raw)))


@override_settings(DATASET_LIMITS=LIMITS)
class ParserTests(SimpleTestCase):
    def parse(self, files, sizes=None):
        archive, entries = open_archive(make_zip(files))
        self.addCleanup(archive.close)
        images = [e.path for e in entries if e.suffix == ".png"]
        return parse_annotations(entries, sizes or {p: (100, 50) for p in images})

    def test_coco_boxes_and_polygons(self):
        parsed = self.parse(coco_files())
        self.assertEqual(parsed.format, "COCO")
        self.assertEqual(parsed.classes, ["car", "person"])
        self.assertEqual(parsed.annotated, 2)
        [box] = parsed.annotations["data/images/a.png"]
        self.assertEqual((box.label, box.kind, box.points), ("car", "rect", [[10, 5], [30, 15]]))
        [poly] = parsed.annotations["data/images/b.png"]
        self.assertEqual((poly.label, poly.kind), ("person", "polygon"))
        self.assertEqual(poly.points, [[1, 1], [30, 1], [30, 20]])
        self.assertNotIn("data/images/c.png", parsed.annotations)

    def test_yolo_boxes_polygons_and_yaml_names(self):
        parsed = self.parse(yolo_files(), {"images/x.png": (200, 100)})
        self.assertEqual(parsed.format, "YOLO")
        self.assertEqual(parsed.classes, ["dog", "cat"])
        box, poly = parsed.annotations["images/x.png"]
        self.assertEqual((box.label, box.kind, box.points), ("dog", "rect", [[50, 25], [150, 75]]))
        self.assertEqual((poly.label, poly.kind), ("cat", "polygon"))
        self.assertEqual(poly.points, [[20, 10], [40, 10], [40, 20]])

    def test_yolo_names_file_wins_and_unknown_ids_get_placeholder(self):
        files = {"x.png": png_bytes(), "x.txt": "0 .5 .5 .1 .1\n3 .5 .5 .1 .1", "classes.txt": "apple\n"}
        parsed = self.parse(files)
        self.assertEqual(parsed.classes, ["apple", "class_3"])

    def test_yolo_ignores_txt_files_that_are_not_labels(self):
        self.assertIsNone(self.parse({"x.png": png_bytes(), "x.txt": "hello world"}))

    def test_pascal_voc(self):
        parsed = self.parse(voc_files())
        self.assertEqual(parsed.format, "Pascal VOC")
        self.assertEqual(parsed.classes, ["truck"])
        [box] = parsed.annotations["v.png"]
        self.assertEqual(box.points, [[1, 2], [40, 30]])

    def test_voc_rejects_entity_expansion_attacks(self):
        bomb = '<?xml version="1.0"?><!DOCTYPE a [<!ENTITY e "x">]><annotation>&e;</annotation>'
        self.assertIsNone(self.parse({"v.png": png_bytes(), "v.xml": bomb}))

    def test_createml(self):
        parsed = self.parse(createml_files())
        self.assertEqual(parsed.format, "CreateML")
        [box] = parsed.annotations["m.png"]
        self.assertEqual((box.label, box.points), ("bird", [[40, 20], [60, 30]]))

    def test_points_are_clamped_to_the_image(self):
        files = coco_files()
        files["data/annotations.json"] = files["data/annotations.json"].replace("[10, 5, 20, 10]", "[-5, 40, 500, 500]")
        [box] = self.parse(files).annotations["data/images/a.png"]
        self.assertEqual(box.points, [[0, 40], [100, 50]])

    def test_annotations_for_missing_images_are_ignored(self):
        files = coco_files()
        del files["data/images/a.png"], files["data/images/b.png"]
        self.assertIsNone(self.parse(files))

    def test_returns_none_without_annotations(self):
        self.assertIsNone(self.parse({"a.png": png_bytes(), "notes.json": "{}", "readme.txt": "hi"}))
