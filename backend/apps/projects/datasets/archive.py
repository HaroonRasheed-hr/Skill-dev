"""Read an uploaded ZIP dataset without trusting anything inside it.

Nothing is extracted to disk: entries are read into memory on demand, so
paths like ``../../etc/passwd`` can never escape. Limits guard against zip bombs.
"""
import zipfile
from dataclasses import dataclass
from pathlib import PurePosixPath

from django.conf import settings

from .errors import DatasetError


@dataclass(frozen=True)
class Entry:
    """One file inside the archive, addressed by its normalised POSIX path."""

    path: str
    size: int
    _zip: zipfile.ZipFile
    _info: zipfile.ZipInfo

    @property
    def name(self):
        return PurePosixPath(self.path).name

    @property
    def stem(self):
        return PurePosixPath(self.path).stem.lower()

    @property
    def suffix(self):
        return PurePosixPath(self.path).suffix.lower()

    def read(self) -> bytes:
        return self._zip.read(self._info)

    def text(self) -> str:
        return self.read().decode("utf-8-sig", errors="replace")


def _is_ignored(path: str) -> bool:
    parts = PurePosixPath(path).parts
    return not parts or parts[0] == "__MACOSX" or any(p.startswith(".") for p in parts)


def _normalise(name: str) -> str | None:
    """Return a safe relative path, or None for absolute / traversing paths."""
    path = PurePosixPath(name.replace("\\", "/"))
    if path.is_absolute() or ".." in path.parts:
        return None
    return str(path)


def open_archive(fileobj) -> tuple[zipfile.ZipFile, list[Entry]]:
    """Validate the archive and list its usable files.

    The caller owns the returned ZipFile and must close it.
    """
    limits = settings.DATASET_LIMITS
    size = getattr(fileobj, "size", None)
    if size is not None and size > limits["MAX_ARCHIVE_BYTES"]:
        raise DatasetError("The ZIP file is too large.")
    try:
        archive = zipfile.ZipFile(fileobj)
    except (zipfile.BadZipFile, OSError):
        raise DatasetError("The uploaded file is not a valid ZIP archive.")

    try:
        infos = [i for i in archive.infolist() if not i.is_dir()]
        if len(infos) > limits["MAX_FILES"]:
            raise DatasetError(f"The ZIP contains too many files (max {limits['MAX_FILES']}).")
        total = 0
        entries = []
        for info in infos:
            if info.flag_bits & 0x1:
                raise DatasetError("Encrypted ZIP files are not supported.")
            total += info.file_size
            if total > limits["MAX_UNCOMPRESSED_BYTES"]:
                raise DatasetError("The ZIP expands to more data than allowed.")
            if info.compress_size and info.file_size / info.compress_size > limits["MAX_COMPRESSION_RATIO"]:
                raise DatasetError("The ZIP looks malformed (suspicious compression ratio).")
            path = _normalise(info.filename)
            if path is None:
                raise DatasetError("The ZIP contains unsafe file paths.")
            if _is_ignored(path):
                continue
            entries.append(Entry(path, info.file_size, archive, info))
    except Exception:
        archive.close()
        raise
    return archive, entries
