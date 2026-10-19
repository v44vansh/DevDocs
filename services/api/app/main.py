"""FastAPI entry point for the DevDocs AI local-first backend."""

from __future__ import annotations

import secrets

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware

from .auth import issue_token, require_user
from .chat import answer_question
from .config import settings
from .ingestion import extract_text
from .models import (
    AuthLogin,
    ChatRequest,
    ChatResponse,
    CitationResponse,
    DocumentListResponse,
    DocumentResponse,
    DocumentTextCreate,
    KnowledgeBaseChatRequest,
    KnowledgeBaseCreate,
    KnowledgeBaseListResponse,
    KnowledgeBaseResponse,
    TokenResponse,
)
from .storage import KnowledgeBaseStore, StoredDocument, StoredKnowledgeBase


def _knowledge_base_response(knowledge_base: StoredKnowledgeBase) -> KnowledgeBaseResponse:
    return KnowledgeBaseResponse(
        id=knowledge_base.id,
        name=knowledge_base.name,
        description=knowledge_base.description,
        created_at=knowledge_base.created_at,
        document_count=len(knowledge_base.documents),
    )


def _document_response(document: StoredDocument) -> DocumentResponse:
    return DocumentResponse(
        id=document.id,
        title=document.title,
        filename=document.filename,
        content_type=document.content_type,
        created_at=document.created_at,
        chunk_count=len(document.chunks),
    )


def _get_knowledge_base(store: KnowledgeBaseStore, knowledge_base_id: str) -> StoredKnowledgeBase:
    knowledge_base = store.get_knowledge_base(knowledge_base_id)
    if knowledge_base is None:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    return knowledge_base


def _chat(
    store: KnowledgeBaseStore,
    knowledge_base_id: str,
    payload: KnowledgeBaseChatRequest,
) -> ChatResponse:
    _get_knowledge_base(store, knowledge_base_id)
    documents = store.list_documents(knowledge_base_id)
    document_names = {document.id: document.title for document in documents}
    grounded = answer_question(
        payload.prompt,
        store.all_chunks(knowledge_base_id),
        document_names=document_names,
        top_k=payload.top_k,
        ollama_url=settings.ollama_url,
        ollama_model=settings.ollama_model,
    )
    return ChatResponse(
        answer=grounded.answer,
        citations=[
            CitationResponse(
                chunk_id=citation.chunk_id,
                document_id=citation.document_id,
                document_name=citation.document_name,
                heading=citation.heading,
                score=citation.score,
                excerpt=citation.excerpt,
            )
            for citation in grounded.citations
        ],
    )


def create_app(store: KnowledgeBaseStore | None = None) -> FastAPI:
    app = FastAPI(title=settings.app_name, version="0.1.0")
    app.state.store = store or KnowledgeBaseStore(settings.data_dir)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.allowed_origins),
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @app.get("/health")
    @app.get("/api/v1/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "service": "devdocs-api", "storage": app.state.store.storage_mode}

    @app.post("/api/v1/auth/login", response_model=TokenResponse)
    def login(payload: AuthLogin) -> TokenResponse:
        valid_username = secrets.compare_digest(payload.username, settings.demo_username)
        valid_password = secrets.compare_digest(payload.password, settings.demo_password)
        if not (valid_username and valid_password):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid demo credentials")
        return TokenResponse(access_token=issue_token(payload.username), username=payload.username)

    @app.post("/api/v1/knowledge-bases", response_model=KnowledgeBaseResponse, status_code=201)
    def create_knowledge_base(
        payload: KnowledgeBaseCreate,
        _: str = Depends(require_user),
    ) -> KnowledgeBaseResponse:
        if not payload.name.strip():
            raise HTTPException(status_code=422, detail="Knowledge base name cannot be empty")
        knowledge_base = app.state.store.create_knowledge_base(payload.name, payload.description)
        return _knowledge_base_response(knowledge_base)

    @app.get("/api/v1/knowledge-bases", response_model=KnowledgeBaseListResponse)
    def list_knowledge_bases(_: str = Depends(require_user)) -> KnowledgeBaseListResponse:
        return KnowledgeBaseListResponse(
            items=[_knowledge_base_response(item) for item in app.state.store.list_knowledge_bases()]
        )

    @app.get("/api/v1/knowledge-bases/{knowledge_base_id}", response_model=KnowledgeBaseResponse)
    def get_knowledge_base(knowledge_base_id: str, _: str = Depends(require_user)) -> KnowledgeBaseResponse:
        return _knowledge_base_response(_get_knowledge_base(app.state.store, knowledge_base_id))

    @app.get(
        "/api/v1/knowledge-bases/{knowledge_base_id}/documents",
        response_model=DocumentListResponse,
    )
    def list_documents(knowledge_base_id: str, _: str = Depends(require_user)) -> DocumentListResponse:
        _get_knowledge_base(app.state.store, knowledge_base_id)
        return DocumentListResponse(
            items=[_document_response(item) for item in app.state.store.list_documents(knowledge_base_id)]
        )

    @app.get(
        "/api/v1/knowledge-bases/{knowledge_base_id}/documents/{document_id}",
        response_model=DocumentResponse,
    )
    def get_document(
        knowledge_base_id: str,
        document_id: str,
        _: str = Depends(require_user),
    ) -> DocumentResponse:
        _get_knowledge_base(app.state.store, knowledge_base_id)
        document = app.state.store.get_document(knowledge_base_id, document_id)
        if document is None:
            raise HTTPException(status_code=404, detail="Document not found")
        return _document_response(document)

    @app.post(
        "/api/v1/knowledge-bases/{knowledge_base_id}/documents/text",
        response_model=DocumentResponse,
        status_code=201,
    )
    def add_text_document(
        knowledge_base_id: str,
        payload: DocumentTextCreate,
        _: str = Depends(require_user),
    ) -> DocumentResponse:
        _get_knowledge_base(app.state.store, knowledge_base_id)
        try:
            text = extract_text(payload.content, payload.filename, payload.content_type)
        except ValueError as exc:
            raise HTTPException(status_code=415, detail=str(exc)) from exc
        if not text:
            raise HTTPException(status_code=400, detail="Document content cannot be empty")
        document = app.state.store.add_document(
            knowledge_base_id,
            title=payload.title,
            filename=payload.filename,
            content_type=payload.content_type,
            text=text,
        )
        return _document_response(document)

    @app.post(
        "/api/v1/knowledge-bases/{knowledge_base_id}/documents",
        response_model=DocumentResponse,
        status_code=201,
    )
    async def upload_document(
        knowledge_base_id: str,
        file: UploadFile = File(...),
        title: str | None = Form(default=None),
        _: str = Depends(require_user),
    ) -> DocumentResponse:
        _get_knowledge_base(app.state.store, knowledge_base_id)
        filename = file.filename or "document.txt"
        try:
            content = await file.read()
        finally:
            await file.close()
        if len(content) > settings.max_upload_bytes:
            raise HTTPException(status_code=413, detail="Document exceeds the local upload limit")
        try:
            text = extract_text(content, filename, file.content_type)
        except ValueError as exc:
            raise HTTPException(status_code=415, detail=str(exc)) from exc
        if not text:
            raise HTTPException(status_code=400, detail="Document content cannot be empty")
        document = app.state.store.add_document(
            knowledge_base_id,
            title=(title or filename),
            filename=filename,
            content_type=file.content_type or "application/octet-stream",
            text=text,
        )
        return _document_response(document)

    @app.post("/api/v1/knowledge-bases/{knowledge_base_id}/chat", response_model=ChatResponse)
    def chat_in_knowledge_base(
        knowledge_base_id: str,
        payload: KnowledgeBaseChatRequest,
        _: str = Depends(require_user),
    ) -> ChatResponse:
        return _chat(app.state.store, knowledge_base_id, payload)

    @app.post("/api/v1/chat", response_model=ChatResponse)
    def chat(payload: ChatRequest, _: str = Depends(require_user)) -> ChatResponse:
        return _chat(app.state.store, payload.knowledge_base_id, payload)

    return app


app = create_app()
