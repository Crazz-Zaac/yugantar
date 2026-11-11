"""
Storage for receipt images.

Callers only use `receipt_storage.save / path_for / delete`, so the local-disk
implementation can later be swapped for S3/MinIO/R2 without touching them.
"""

import io
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from PIL import Image, ImageOps

from app.core.config import settings

# Long edge limits for the stored copy: plenty to read a receipt, ~100 KB each.
MAX_STORED_SIZE = (1200, 2600)
JPEG_QUALITY = 85


def normalize_receipt_image(contents: bytes) -> bytes:
    """Re-encode as a plain JPEG.

    Fixes rotation, drops all metadata (EXIF/GPS etc.) and any embedded
    payload, and downsizes to MAX_STORED_SIZE.
    """
    with Image.open(io.BytesIO(contents)) as img:
        img = ImageOps.exif_transpose(img)
        img = img.convert("RGB")
        img.thumbnail(MAX_STORED_SIZE)
        out = io.BytesIO()
        img.save(out, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    return out.getvalue()


class LocalReceiptStorage:
    def __init__(self, base_dir: str):
        self.base_dir = Path(base_dir).resolve()

    def save(self, data: bytes) -> str:
        """Store bytes and return the storage key (a relative path)."""
        now = datetime.now(timezone.utc)
        key = f"{now:%Y/%m}/{uuid.uuid4()}.jpg"
        path = self.base_dir / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return key

    def path_for(self, key: str) -> Optional[Path]:
        """Absolute path for a key, or None if missing / outside the store."""
        path = (self.base_dir / key).resolve()
        if self.base_dir not in path.parents or not path.is_file():
            return None
        return path

    def delete(self, key: str) -> None:
        path = self.path_for(key)
        if path:
            path.unlink(missing_ok=True)

    def keys_older_than(self, cutoff: datetime) -> list[str]:
        """Keys of stored files last modified before `cutoff`."""
        if not self.base_dir.exists():
            return []
        ts = cutoff.timestamp()
        return [
            str(p.relative_to(self.base_dir))
            for p in self.base_dir.rglob("*.jpg")
            if p.is_file() and p.stat().st_mtime < ts
        ]


receipt_storage = LocalReceiptStorage(settings.RECEIPT_STORAGE_DIR)
