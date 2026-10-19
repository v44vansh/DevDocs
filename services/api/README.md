# DevDocs AI API

This is the local-first FastAPI backend for DevDocs AI. It stores knowledge bases in memory by default, with an optional JSON file store when `DEVDOCS_DATA_DIR` is set. Embeddings, retrieval, and grounded answer composition run locally without a model download or paid API.

## Setup

From `services/api`:

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements-dev.txt
```

`requirements.lock` records the resolved runtime and test set when a fully pinned install is preferred.

On macOS/Linux, use `.venv/bin/python` in place of `.venv\Scripts\python`.

## Run

```powershell
.venv\Scripts\python -m uvicorn app.main:app --reload
```

The API is available at `http://127.0.0.1:8000`; Swagger UI is at `/docs`.

The demo login is `demo` / `demo`. Set `DEVDOCS_AUTH_SECRET`, `DEVDOCS_DEMO_USERNAME`, and `DEVDOCS_DEMO_PASSWORD` before using it outside a local demo. Set `DEVDOCS_DATA_DIR=./data` to persist data locally.

## Main flow

1. `POST /api/v1/auth/login` with `{ "username": "demo", "password": "demo" }`.
2. Use the returned bearer token to `POST /api/v1/knowledge-bases`.
3. Upload Markdown, TXT, HTML, PDF, or DOCX with `POST /api/v1/knowledge-bases/{id}/documents` as multipart field `file`.
4. Ask `POST /api/v1/knowledge-bases/{id}/chat` with `{ "message": "..." }`.

Answers include numbered citation markers such as `[1]` and citation objects containing the source document, heading path, score, and excerpt. Questions with no matching source return an explicit no-answer response and no citations.

## Test

```powershell
.venv\Scripts\python -m pytest
```

Or, with `make` available:

```text
make test
```

## Container

The repository root Docker Compose file builds the API image and the web image together:

```bash
docker compose up --build
```
