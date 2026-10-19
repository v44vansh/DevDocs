"""Small environment-backed configuration for the local-first API."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    app_name: str = "DevDocs AI API"
    auth_secret: str = "devdocs-local-secret-change-me"
    demo_username: str = "demo"
    demo_password: str = "demo"
    data_dir: Path | None = None
    max_upload_bytes: int = 5 * 1024 * 1024
    allowed_origins: tuple[str, ...] = ("http://localhost:5173", "http://127.0.0.1:5173")
    ollama_url: str = ""
    ollama_model: str = "qwen2.5:3b"

    @classmethod
    def from_env(cls) -> "Settings":
        raw_data_dir = os.getenv("DEVDOCS_DATA_DIR", "").strip()
        raw_limit = os.getenv("DEVDOCS_MAX_UPLOAD_BYTES", "5242880")
        try:
            max_upload_bytes = max(1, int(raw_limit))
        except ValueError:
            max_upload_bytes = cls.max_upload_bytes

        return cls(
            auth_secret=os.getenv("DEVDOCS_AUTH_SECRET", cls.auth_secret),
            demo_username=os.getenv("DEVDOCS_DEMO_USERNAME", cls.demo_username),
            demo_password=os.getenv("DEVDOCS_DEMO_PASSWORD", cls.demo_password),
            data_dir=Path(raw_data_dir) if raw_data_dir else None,
            max_upload_bytes=max_upload_bytes,
            allowed_origins=tuple(
                origin.strip()
                for origin in os.getenv(
                    "DEVDOCS_ALLOWED_ORIGINS",
                    "http://localhost:5173,http://127.0.0.1:5173",
                ).split(",")
                if origin.strip()
            ),
            ollama_url=os.getenv("DEVDOCS_OLLAMA_URL", "").strip().rstrip("/"),
            ollama_model=os.getenv("DEVDOCS_OLLAMA_MODEL", "qwen2.5:3b").strip() or "qwen2.5:3b",
        )


settings = Settings.from_env()
