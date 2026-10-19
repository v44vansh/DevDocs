"""Thread-safe in-memory store with optional JSON persistence."""

from __future__ import annotations

import json
import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from .ingestion import Chunk, chunk_document


def _now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class StoredDocument:
    id: str
    title: str
    filename: str
    content_type: str
    text: str
    created_at: datetime
    chunks: list[Chunk] = field(default_factory=list)


@dataclass
class StoredKnowledgeBase:
    id: str
    name: str
    description: str
    created_at: datetime
    documents: dict[str, StoredDocument] = field(default_factory=dict)


class KnowledgeBaseStore:
    """Use memory by default; set ``DEVDOCS_DATA_DIR`` for local JSON storage."""

    def __init__(self, data_dir: Path | None = None) -> None:
        self._lock = threading.RLock()
        self._data_dir = Path(data_dir) if data_dir else None
        self._knowledge_bases: dict[str, StoredKnowledgeBase] = {}
        self._load()

    @property
    def storage_mode(self) -> str:
        return "local-json" if self._data_dir else "memory"

    def _data_file(self) -> Path | None:
        return self._data_dir / "knowledge-base.json" if self._data_dir else None

    def _load(self) -> None:
        path = self._data_file()
        if path is None or not path.exists():
            return
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            for item in raw.get("knowledge_bases", []):
                knowledge_base = StoredKnowledgeBase(
                    id=str(item["id"]),
                    name=str(item["name"]),
                    description=str(item.get("description", "")),
                    created_at=datetime.fromisoformat(item["created_at"]),
                )
                for document_item in item.get("documents", []):
                    document = self._document_from_dict(document_item)
                    knowledge_base.documents[document.id] = document
                self._knowledge_bases[knowledge_base.id] = knowledge_base
        except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError):
            # A corrupt optional cache should not prevent the API from booting.
            self._knowledge_bases = {}

    @staticmethod
    def _document_from_dict(item: dict) -> StoredDocument:
        document_id = str(item["id"])
        text = str(item.get("text", ""))
        chunks = chunk_document(text, document_id=document_id)
        return StoredDocument(
            id=document_id,
            title=str(item.get("title", item.get("filename", "Document"))),
            filename=str(item.get("filename", "document.txt")),
            content_type=str(item.get("content_type", "text/plain")),
            text=text,
            created_at=datetime.fromisoformat(item["created_at"]),
            chunks=chunks,
        )

    def _save(self) -> None:
        path = self._data_file()
        if path is None:
            return
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "knowledge_bases": [
                {
                    "id": knowledge_base.id,
                    "name": knowledge_base.name,
                    "description": knowledge_base.description,
                    "created_at": knowledge_base.created_at.isoformat(),
                    "documents": [
                        {
                            "id": document.id,
                            "title": document.title,
                            "filename": document.filename,
                            "content_type": document.content_type,
                            "text": document.text,
                            "created_at": document.created_at.isoformat(),
                        }
                        for document in knowledge_base.documents.values()
                    ],
                }
                for knowledge_base in self._knowledge_bases.values()
            ]
        }
        temporary_path = path.with_suffix(".tmp")
        temporary_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        temporary_path.replace(path)

    def create_knowledge_base(self, name: str, description: str = "") -> StoredKnowledgeBase:
        with self._lock:
            knowledge_base = StoredKnowledgeBase(
                id=uuid4().hex[:12],
                name=name.strip(),
                description=description.strip(),
                created_at=_now(),
            )
            self._knowledge_bases[knowledge_base.id] = knowledge_base
            self._save()
            return knowledge_base

    def list_knowledge_bases(self) -> list[StoredKnowledgeBase]:
        with self._lock:
            return list(self._knowledge_bases.values())

    def get_knowledge_base(self, knowledge_base_id: str) -> StoredKnowledgeBase | None:
        with self._lock:
            return self._knowledge_bases.get(knowledge_base_id)

    def add_document(
        self,
        knowledge_base_id: str,
        *,
        title: str,
        filename: str,
        content_type: str,
        text: str,
    ) -> StoredDocument:
        with self._lock:
            knowledge_base = self._knowledge_bases[knowledge_base_id]
            document_id = uuid4().hex[:12]
            document = StoredDocument(
                id=document_id,
                title=title.strip() or filename,
                filename=filename,
                content_type=content_type,
                text=text,
                created_at=_now(),
                chunks=chunk_document(text, document_id=document_id),
            )
            knowledge_base.documents[document.id] = document
            self._save()
            return document

    def list_documents(self, knowledge_base_id: str) -> list[StoredDocument]:
        with self._lock:
            knowledge_base = self._knowledge_bases[knowledge_base_id]
            return list(knowledge_base.documents.values())

    def get_document(self, knowledge_base_id: str, document_id: str) -> StoredDocument | None:
        with self._lock:
            knowledge_base = self._knowledge_bases.get(knowledge_base_id)
            return knowledge_base.documents.get(document_id) if knowledge_base else None

    def all_chunks(self, knowledge_base_id: str) -> list[Chunk]:
        with self._lock:
            knowledge_base = self._knowledge_bases[knowledge_base_id]
            return [chunk for document in knowledge_base.documents.values() for chunk in document.chunks]
