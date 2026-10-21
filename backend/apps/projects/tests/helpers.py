import io
import json
import zipfile

from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image as PILImage


def png_bytes(width=100, height=50, color="red"):
    buf = io.BytesIO()
    PILImage.new("RGB", (width, height), color).save(buf, "PNG")
    return buf.getvalue()


def make_zip(files: dict[str, bytes | str], name="dataset.zip") -> SimpleUploadedFile:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for path, data in files.items():
            zf.writestr(path, data)
    return SimpleUploadedFile(name, buf.getvalue(), content_type="application/zip")


def coco_files():
    """Two images (100x50), one annotated with a box and one with a polygon."""
    coco = {
        "images": [
            {"id": 1, "file_name": "a.png", "width": 100, "height": 50},
            {"id": 2, "file_name": "b.png", "width": 100, "height": 50},
            {"id": 3, "file_name": "c.png", "width": 100, "height": 50},
        ],
        "categories": [{"id": 7, "name": "car"}, {"id": 8, "name": "person"}],
        "annotations": [
            {"id": 1, "image_id": 1, "category_id": 7, "bbox": [10, 5, 20, 10]},
            {"id": 2, "image_id": 2, "category_id": 8, "bbox": [0, 0, 1, 1],
             "segmentation": [[1, 1, 30, 1, 30, 20]]},
        ],
    }
    return {
        "data/images/a.png": png_bytes(),
        "data/images/b.png": png_bytes(),
        "data/images/c.png": png_bytes(),  # not annotated
        "data/annotations.json": json.dumps(coco),
    }


def yolo_files():
    return {
        "images/x.png": png_bytes(200, 100),
        "labels/x.txt": "0 0.5 0.5 0.5 0.5\n1 0.1 0.1 0.2 0.1 0.2 0.2\n",
        "data.yaml": "names: ['dog', 'cat']\n",
    }


def voc_files():
    xml = """<annotation><filename>v.png</filename>
      <object><name>truck</name><bndbox><xmin>1</xmin><ymin>2</ymin><xmax>40</xmax><ymax>30</ymax></bndbox></object>
    </annotation>"""
    return {"v.png": png_bytes(), "v.xml": xml}


def createml_files():
    data = [{"image": "m.png", "annotations": [
        {"label": "bird", "coordinates": {"x": 50, "y": 25, "width": 20, "height": 10}},
    ]}]
    return {"m.png": png_bytes(), "annotations.json": json.dumps(data)}


def video_bytes(frames=20, fps=10, width=64, height=48):
    """A small MJPEG .avi, which OpenCV can always write and read back."""
    import os
    import tempfile

    import cv2
    import numpy as np

    fd, path = tempfile.mkstemp(suffix=".avi")
    os.close(fd)
    try:
        writer = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*"MJPG"), fps, (width, height))
        for i in range(frames):
            writer.write(np.full((height, width, 3), i * 10 % 255, dtype=np.uint8))
        writer.release()
        with open(path, "rb") as f:
            return f.read()
    finally:
        os.remove(path)
