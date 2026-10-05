"""Turn an uploaded video into JPEG frames, so each frame is annotated like an image."""
import os
import tempfile
from dataclasses import dataclass
from pathlib import PurePosixPath

from .datasets import DatasetError

VIDEO_SUFFIXES = {".mp4", ".webm", ".mov", ".avi", ".mkv", ".m4v", ".ogv", ".ogg", ".mpeg", ".mpg"}
# Guards against a long video flooding the project with frames.
MAX_FRAMES_PER_VIDEO = 3000
DEFAULT_FPS = 5.0


def is_video(name: str) -> bool:
    return PurePosixPath(name).suffix.lower() in VIDEO_SUFFIXES


@dataclass(frozen=True)
class Frame:
    index: int  # position among the extracted frames, from 0
    time: float  # seconds from the start of the video
    data: bytes  # JPEG


def extract_frames(source, name: str, fps: float = DEFAULT_FPS):
    """Yield frames of a video sampled at ``fps`` (0 = every frame).

    ``source`` is raw bytes or an uploaded file. OpenCV needs a real file, so the
    video is written to a temporary file that is removed when the generator ends.
    """
    import cv2  # imported here: only needed when a video is uploaded

    path = getattr(source, "temporary_file_path", lambda: None)()
    temp = None
    if path is None:
        fd, temp = tempfile.mkstemp(suffix=PurePosixPath(name).suffix.lower())
        with os.fdopen(fd, "wb") as out:
            if isinstance(source, bytes):
                out.write(source)
            else:
                source.seek(0)
                for chunk in source.chunks():
                    out.write(chunk)
        path = temp

    capture = cv2.VideoCapture(path)
    try:
        if not capture.isOpened():
            raise DatasetError(f"'{name}' could not be read as a video.")
        native = capture.get(cv2.CAP_PROP_FPS)
        if not native or native != native or native > 240:  # missing / NaN / bogus
            native = 30.0
        step = 1.0 if not fps or fps >= native else native / fps
        index = position = 0
        next_pick = 0.0
        while index < MAX_FRAMES_PER_VIDEO and capture.grab():
            if position + 1e-6 >= next_pick:
                ok, image = capture.retrieve()
                if ok:
                    ok, jpeg = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 90])
                if ok:
                    yield Frame(index, round(position / native, 3), jpeg.tobytes())
                    index += 1
                next_pick += step
            position += 1
        if index == 0:
            raise DatasetError(f"'{name}' could not be read as a video.")
    finally:
        capture.release()
        if temp:
            os.remove(temp)
