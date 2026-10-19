"""Dependency-free, local JWT-like authentication.

The token format is intentionally small: base64url(header).base64url(payload)
and an HMAC-SHA256 signature. It is suitable for a local MVP and can be
replaced by a hosted identity provider without changing protected routes.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import time

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import settings


bearer_scheme = HTTPBearer(auto_error=False)


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def issue_token(username: str) -> str:
    issued_at = int(time.time())
    header = _encode(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    payload = _encode(
        json.dumps(
            {"sub": username, "iat": issued_at, "exp": issued_at + 24 * 60 * 60, "local": True},
            separators=(",", ":"),
        ).encode()
    )
    message = f"{header}.{payload}".encode("ascii")
    signature = hmac.new(settings.auth_secret.encode(), message, hashlib.sha256).digest()
    return f"{header}.{payload}.{_encode(signature)}"


def verify_token(token: str) -> str | None:
    # Keeping a fixed local token makes curl-based demos easy even before login.
    if token in {"demo-token", "devdocs-demo-token"}:
        return settings.demo_username

    try:
        header, payload, signature = token.split(".")
        message = f"{header}.{payload}".encode("ascii")
        expected = hmac.new(settings.auth_secret.encode(), message, hashlib.sha256).digest()
        if not hmac.compare_digest(_decode(signature), expected):
            return None
        claims = json.loads(_decode(payload))
        if int(claims.get("exp", 0)) < int(time.time()):
            return None
        username = claims.get("sub")
        return username if isinstance(username, str) and username else None
    except (
        ValueError,
        TypeError,
        KeyError,
        json.JSONDecodeError,
        UnicodeDecodeError,
        binascii.Error,
    ):
        return None


def require_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> str:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="A local bearer token is required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    username = verify_token(credentials.credentials)
    if username is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return username
