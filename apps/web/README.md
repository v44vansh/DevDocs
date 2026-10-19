# DevDocs AI web app

The frontend is a Vite + React + TypeScript single-page app. It authenticates against the local API, creates/selects a default knowledge base, and does not require a paid service.

## Setup

```bash
npm install
cp .env.example .env
```

Set `VITE_API_BASE_URL` to the local backend origin if it differs from `http://localhost:8000`. Restart Vite after changing environment variables.

## Run

```bash
npm run dev
```

The app shows clearly labeled preview data when the local API cannot be reached. Chat and upload actions report the connection error instead of inventing a successful result. The real upload picker accepts PDF, Markdown, DOCX, TXT, and HTML.

## Checks

```bash
npm test
npm run typecheck
npm run build
```

## Deploy

Build the static bundle with `npm run build` and serve `dist/` from any static host. Configure `VITE_API_BASE_URL` at build time to point to the API accessible by the deployed browser, and add that origin to `DEVDOCS_ALLOWED_ORIGINS`.
