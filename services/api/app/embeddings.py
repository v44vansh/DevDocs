"""Deterministic local embeddings based on signed feature hashing."""

from __future__ import annotations

import hashlib
import math
import re


EMBEDDING_DIMENSION = 128
TOKEN_RE = re.compile(r"[a-z0-9][a-z0-9_-]*", re.IGNORECASE)


def _features(text: str) -> list[str]:
    tokens = [token.lower() for token in TOKEN_RE.findall(text)]
    features = list(tokens)
    features.extend(f"{left}:{right}" for left, right in zip(tokens, tokens[1:]))
    return features


def embed_text(text: str) -> tuple[float, ...]:
    """Return a normalized vector without model downloads or network calls."""

    vector = [0.0] * EMBEDDING_DIMENSION
    for feature in _features(text):
        digest = hashlib.sha256(feature.encode("utf-8")).digest()
        index = int.from_bytes(digest[:4], "big") % EMBEDDING_DIMENSION
        sign = 1.0 if digest[4] & 1 else -1.0
        vector[index] += sign

    magnitude = math.sqrt(sum(value * value for value in vector))
    if magnitude == 0:
        return tuple(vector)
    return tuple(value / magnitude for value in vector)


def cosine_similarity(left: tuple[float, ...], right: tuple[float, ...]) -> float:
    """Calculate cosine similarity for the fixed-size local vectors."""

    if len(left) != len(right):
        raise ValueError("Embedding vectors must have the same dimension")
    left_norm = math.sqrt(sum(value * value for value in left))
    right_norm = math.sqrt(sum(value * value for value in right))
    if left_norm == 0 or right_norm == 0:
        return 0.0
    return sum(a * b for a, b in zip(left, right)) / (left_norm * right_norm)
