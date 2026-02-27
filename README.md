# Improv Court POC (standalone)

This is a **standalone root-level implementation** of the Improv Court proof of concept.
It does **not** depend on `subcult-corp` at runtime.

## What is implemented

- Multi-agent courtroom roles (judge, prosecutor, defense, witnesses, bailiff)
- Phase-based court flow:
  - `case_prompt`
  - `openings`
  - `witness_exam`
  - `closings`
  - `verdict_vote`
  - `sentence_vote`
  - `final_ruling`
- Live SSE stream per session
- Jury verdict and sentence voting endpoints
- Deterministic phase-order and vote-window enforcement
- Minimal stripped web UI (`public/index.html`)

## Environment

Copy `.env.example` to `.env` and set values as needed.

Key variables:

- `OPENROUTER_API_KEY` (optional for local mock mode; required for real LLM calls)
- `LLM_MODEL`
- `PORT`
- `DATABASE_URL` (Postgres connection string for durable persistence)
- `VERDICT_VOTE_WINDOW_MS`
- `SENTENCE_VOTE_WINDOW_MS`

If `OPENROUTER_API_KEY` is empty, the app falls back to deterministic mock dialogue.

If `DATABASE_URL` is set, the app uses Postgres-backed persistence and runs migrations at startup.
If `DATABASE_URL` is missing, the app falls back to in-memory storage (non-durable).

## Run

1. Install dependencies:
    - `npm install`
2. (Optional but recommended) run DB migrations explicitly:
    - `npm run migrate`
3. Start dev server:
    - `npm run dev`
4. Open:
    - `http://localhost:3001`

## Run with Docker (API + Postgres)

This repo includes a `docker-compose.yml` that starts both:

- `api` (the Improv Court server)
- `db` (Postgres 16)

Start the full stack:

- `npm run docker:up`

Or directly:

- `docker compose up --build`

Stop the stack:

- `npm run docker:down`

The API container runs migrations on startup (`npm run migrate:dist`) before starting the server.

Endpoints when running with compose:

- API: `http://localhost:${API_HOST_PORT:-3001}`
- Postgres: internal-only by default (`db:5432` inside compose network)

If port `3001` is already in use on your machine, set `API_HOST_PORT` in `.env` (for example `API_HOST_PORT=3002`) and restart compose.

If you need host access to Postgres, add a `ports` mapping to the `db` service in `docker-compose.yml` (for example `"5433:5432"` to avoid conflicts with local Postgres).

## API

- `GET /api/health`
- `GET /api/court/sessions`
- `GET /api/court/sessions/:id`
- `POST /api/court/sessions`
- `POST /api/court/sessions/:id/vote`
- `POST /api/court/sessions/:id/phase`
- `GET /api/court/sessions/:id/stream` (SSE)

## Notes

- The existing `subcult-corp` directory is used only as a **reference source** and is not imported.
- Core reusable ideas were copied into `src/` as standalone modules.
- Schema migration SQL is under `db/migrations/`.
