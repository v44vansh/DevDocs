"""Local cosine retrieval over ingested chunks."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from .embeddings import cosine_similarity, embed_text
from .ingestion import Chunk


@dataclass(frozen=True)
class SearchResult:
    chunk: Chunk
    score: float


def retrieve(query: str, chunks: Iterable[Chunk], top_k: int = 5) -> list[SearchResult]:
    if top_k < 1:
        return []
    query_embedding = embed_text(query)
    scored = [
        SearchResult(chunk=chunk, score=cosine_similarity(query_embedding, embed_text(chunk.content)))
        for chunk in chunks
    ]
    return sorted(scored, key=lambda result: (-result.score, result.chunk.id))[:top_k]
