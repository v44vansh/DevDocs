# DevDocs AI

DevDocs AI is a local-first documentation assistant. Upload Markdown, plain text, or HTML documentation, ask a question, and receive a grounded answer with citations to the indexed source section.

The current flagship MVP is deliberately free to run: the API uses deterministic local embeddings and a source-grounded answer composer, so it works without API keys, model downloads, or a cloud account. If Ollama is installed locally, the same grounded context can optionally be sent to a local chat model for more natural answers.

## What works now

- Local demo authentication (`demo` / `demo`)
- Persistent local knowledge base storage through a JSON data volume
- Markdown, `.mdown`, TXT, `.text`, HTML, HTM, PDF, and DOCX ingestion
- Heading-aware chunking with overlap
- Deterministic offline retrieval
- Source-grounded answers with document, section, score, and excerpt citations
- React dashboard with upload queue, document search, chat, and source previews
- API health status and explicit offline/error states
- Backend and frontend tests that run without paid services

## Run with Docker Compose

Prerequisites:

- Docker Desktop or Docker Engine with Compose

From the repository root:

```bash
cp .env.example .env
docker compose up --build
```

On PowerShell, use `Copy-Item .env.example .env` instead of `cp`.

Open:

- Web app: http://localhost:5173
- API health: http://localhost:8000/health
- API docs: http://localhost:8000/docs

The first browser load logs into the local demo account, creates a default knowledge base if needed, and loads its documents. Uploaded files are stored in the named `devdocs-data` Docker volume.

Stop the stack with:

```bash
docker compose down
```

The named volume is intentionally retained. To remove local application data, run `docker compose down --volumes`.

## Deploy the frontend to GitHub Pages

GitHub Pages can host the built React frontend only. It cannot run the FastAPI API, store uploads, or run Ollama. You must make the API reachable at a public HTTPS URL first, using a server you control or a separate hosting provider. Do not use `http://localhost:8000` for the Pages deployment.

### 1. Host the backend separately

Build and run the API with Docker on a reachable machine:

```bash
docker build -t devdocs-api .
docker run --rm -p 8000:8000 \
  -e DEVDOCS_AUTH_SECRET="replace-with-a-long-random-value" \
  -e DEVDOCS_ALLOWED_ORIGINS="https://YOUR_USERNAME.github.io" \
  -e DEVDOCS_DATA_DIR=/data \
  -v devdocs-data:/data \
  devdocs-api
```

The browser URL for a project site includes the repository path:

```text
https://YOUR_USERNAME.github.io/YOUR_REPOSITORY
```

For CORS, use only the origin (without the repository path):

```text
https://YOUR_USERNAME.github.io
```

The API must allow that origin through `DEVDOCS_ALLOWED_ORIGINS`. A local API is useful for development but will not be reachable from GitHub Pages visitors.

### 2. Configure GitHub Pages

The repository includes `.github/workflows/deploy-pages.yml`. In GitHub:

1. Open **Settings → Pages**.
2. Set **Source** to **GitHub Actions**.
3. Open **Settings → Secrets and variables → Actions → Variables**.
4. Add this repository variable:

   ```text
   VITE_API_BASE_URL=https://your-public-api.example.com
   ```

5. Optionally add:

   ```text
   VITE_BASE_PATH=/YOUR_REPOSITORY/
   ```

   This is normally inferred automatically from `GITHUB_REPOSITORY`.

6. Push to `main`, or run the **Deploy DevDocs AI frontend to GitHub Pages** workflow manually from the **Actions** tab.

Your frontend URL will be:

```text
https://YOUR_USERNAME.github.io/YOUR_REPOSITORY/
```

The workflow runs `npm ci`, builds `apps/web`, uploads the `dist` artifact, and deploys it through the official Pages actions. If `VITE_API_BASE_URL` is missing, it still publishes the UI with the local API fallback and shows the app's explicit API-unavailable state until a public backend URL is configured.

### Free hosting warning

GitHub Pages itself is free. A public FastAPI backend and persistent document storage are separate services, and their free tiers can sleep, expire, or have storage limits. For a genuinely free-forever setup, run the Docker Compose stack on your own computer or home server and use GitHub Pages only when the API is publicly reachable. Never commit passwords, tokens, or `.env` files.

## Run without Docker

### Backend

Requires Python 3.12.8 or a compatible Python 3.11+ installation.

PowerShell:

```powershell
cd services/api
py -3.12 -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
$env:DEVDOCS_DATA_DIR = "../../data"
.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

macOS/Linux:

```bash
cd services/api
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.txt
DEVDOCS_DATA_DIR=../../data .venv/bin/python -m uvicorn app.main:app --reload --port 8000
```

### Frontend

In a second terminal:

```bash
cd apps/web
npm ci
cp .env.example .env
npm run dev
```

On PowerShell, use `Copy-Item .env.example .env`.

Open http://localhost:5173. The frontend defaults to `http://localhost:8000`, or you can set `VITE_API_BASE_URL` in `apps/web/.env`.

## Test and build

The single repository check command is:

```bash
make test
```

It runs:

```bash
cd services/api && python -m pytest
cd apps/web && npm test -- --run
cd apps/web && npm run typecheck
cd apps/web && npm run build
```

The backend tests are offline and use an isolated in-memory store. The frontend tests mock the HTTP boundary and verify the user-visible upload, chat, and citation states.

On Windows without `make`, run the equivalent checked workflow with:

```powershell
.\scripts\test.ps1
```

## API flow

1. Login:

```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"demo","password":"demo"}'
```

2. Use the returned `access_token` to create a knowledge base:

```bash
curl -X POST http://localhost:8000/api/v1/knowledge-bases \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Product docs","description":"Local documentation"}'
```

3. Upload a source:

```bash
curl -X POST http://localhost:8000/api/v1/knowledge-bases/<knowledge-base-id>/documents \
  -H "Authorization: Bearer <token>" \
  -F "file=@README.md"
```

4. Ask a grounded question:

```bash
curl -X POST http://localhost:8000/api/v1/knowledge-bases/<knowledge-base-id>/chat \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"message":"How do I run this project?","top_k":5}'
```

If no indexed source is relevant, the API returns an explicit no-answer response with an empty citation list.

## Architecture

```text
React + Vite
       |
       | REST / JSON
       v
FastAPI API
       |
       +-- local JSON persistence
       +-- structure-aware ingestion
       +-- deterministic local embeddings
       +-- cosine retrieval
       +-- grounded answer composer
```

The MVP keeps persistence and retrieval dependency-light so it can run on a laptop forever. PostgreSQL/pgvector, background workers, local LLMs, richer parsers, evaluation telemetry, and workflow automation can be added behind the same API boundaries as the product grows.

## Configuration

Copy `.env.example` to `.env` for Compose. Important values:

| Variable | Purpose |
|---|---|
| `DEVDOCS_AUTH_SECRET` | HMAC signing secret for local bearer tokens |
| `DEVDOCS_DEMO_USERNAME` | Local demo username |
| `DEVDOCS_DEMO_PASSWORD` | Local demo password |
| `DEVDOCS_DATA_DIR` | Writable persistence directory |
| `DEVDOCS_MAX_UPLOAD_BYTES` | Upload limit, default 5 MiB |
| `DEVDOCS_ALLOWED_ORIGINS` | Browser origins allowed by FastAPI |
| `VITE_API_BASE_URL` | API origin compiled into the frontend |
| `DEVDOCS_OLLAMA_URL` | Optional local Ollama origin, for example `http://localhost:11434` |
| `DEVDOCS_OLLAMA_MODEL` | Optional local model name, default `qwen2.5:3b` |

Do not commit `.env`, credentials, tokens, or local data.

## Current limitations

- The default authentication is a local demo account, not multi-user production identity.
- The default store is JSON-backed and intended for one local instance.
- Embeddings are deterministic lexical vectors rather than a downloaded neural embedding model.
- Without Ollama configured, answer generation is deterministic grounded composition. With Ollama configured, the API validates that generated citations refer only to retrieved sources.
- Background queues, conversation persistence, admin analytics, workflow actions, OCR for scanned PDFs, and neural embedding models are not part of this first runnable slice.

These limitations are explicit so the demo never pretends to have indexed or generated something it did not.
