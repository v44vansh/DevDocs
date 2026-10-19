"""Pydantic request and response models for the public API."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, model_validator


class AuthLogin(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str


class KnowledgeBaseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=500)


class KnowledgeBaseResponse(BaseModel):
    id: str
    name: str
    description: str
    created_at: datetime
    document_count: int


class DocumentResponse(BaseModel):
    id: str
    title: str
    filename: str
    content_type: str
    created_at: datetime
    chunk_count: int


class DocumentTextCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    filename: str = Field(default="document.txt", max_length=200)
    content_type: str = "text/plain"
    content: str = Field(min_length=1)


class CitationResponse(BaseModel):
    chunk_id: str
    document_id: str
    document_name: str
    heading: str | None = None
    score: float
    excerpt: str


class KnowledgeBaseChatRequest(BaseModel):
    message: str | None = None
    question: str | None = None
    top_k: int = Field(default=5, ge=1, le=10)

    @model_validator(mode="after")
    def require_message(self) -> "KnowledgeBaseChatRequest":
        if not (self.message or self.question):
            raise ValueError("message or question is required")
        return self

    @property
    def prompt(self) -> str:
        return (self.message or self.question or "").strip()


class ChatRequest(KnowledgeBaseChatRequest):
    knowledge_base_id: str = Field(min_length=1)


class ChatResponse(BaseModel):
    model: str = "local-grounded"
    answer: str
    citations: list[CitationResponse]


class DocumentListResponse(BaseModel):
    items: list[DocumentResponse]


class KnowledgeBaseListResponse(BaseModel):
    items: list[KnowledgeBaseResponse]
