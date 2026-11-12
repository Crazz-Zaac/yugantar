"""
Private, permanent storage for generated documents (e.g. loan agreement PDFs).

Unlike receipt images, these are records and are never purged. Files are only
served through authenticated endpoints, never as static files.
"""

import hashlib
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from app.core.config import settings


class LocalDocumentStorage:
    def __init__(self, base_dir: str):
        self.base_dir = Path(base_dir).resolve()

    def save(self, data: bytes, prefix: str, suffix: str = ".pdf") -> tuple[str, str]:
        """Store bytes; returns (key, sha256)."""
        now = datetime.now(timezone.utc)
        key = f"{prefix}/{now:%Y/%m}/{uuid.uuid4()}{suffix}"
        path = self.base_dir / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return key, hashlib.sha256(data).hexdigest()

    def path_for(self, key: str) -> Optional[Path]:
        path = (self.base_dir / key).resolve()
        if self.base_dir not in path.parents or not path.is_file():
            return None
        return path


document_storage = LocalDocumentStorage(settings.DOCUMENT_STORAGE_DIR)
