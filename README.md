# Improv Court POC (standalone)

[![CI](https://github.com/subculture-collective/court/actions/workflows/ci.yml/badge.svg)](https://github.com/subculture-collective/court/actions/workflows/ci.yml)

This is a **standalone root-level implementation** of the Improv Court proof of concept.
It does **not** depend on `subcult-corp` at runtime.

## Documentation

| Document                                                                               | Description                                                                            |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [docs/ADR-001-improv-court-architecture.md](docs/ADR-001-improv-court-architecture.md) | Architecture Decision Record: runtime boundaries, data contracts, and phase invariants |
| [docs/architecture.md](docs/architecture.md)                                           | System architecture, agent roles, and phase flow                                       |
| [docs/api.md](docs/api.md)                                                             | REST API endpoints, schemas, and SSE event contracts                                   |
| [docs/operator-runbook.md](docs/operator-runbook.md)                                   | Setup, live controls, incident response, mistrial fallback, and operational monitoring |
| [docs/moderation-playbook.md](docs/moderation-playbook.md)                             | Content moderation system and incident procedures                                      |
| [docs/event-taxonomy.md](docs/event-taxonomy.md)                                       | Canonical event taxonomy, payload schemas, and logging guidelines                      |
| [docs/phase5-6-implementation-plan.md](docs/phase5-6-implementation-plan.md)           | Dependency-ordered implementation plan for roadmap phases 5 and 6                      |

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
    - Overlay shell with phase timer, active speaker, and live captions
    - Viewer layout showing current phase context and jury voting status
    - Verdict/sentence poll bars with live percentages and phase-gated voting
    - SSE analytics events for poll start/close and vote completion
- **Operator Dashboard** (`/operator`)
    - Real-time session monitoring with live event feed
    - Vote tallies and witness cap tracking
    - Moderation queue for content review
    - Manual controls for session management
    - Analytics dashboard with event timelines
- **Structured Logging Service**
    - JSON-formatted logs with session/phase/event correlation
    - Configurable log levels (debug/info/warn/error)
    - Child loggers with inherited context
    - Production-ready logging architecture

## Environment

Copy `.env.example` to `.env` and set values as needed.

Key variables:

- `OPENROUTER_API_KEY` (optional for local mock mode; required for real LLM calls)
- `LLM_MODEL`
- `LLM_MOCK` (set to `true` to force deterministic mock responses)
- `PORT`
- `DATABASE_URL` (Postgres connection string for durable persistence)
- `TTS_PROVIDER` (`noop` or `mock`; defaults to `noop`)
- `VERDICT_VOTE_WINDOW_MS`
- `SENTENCE_VOTE_WINDOW_MS`
- `WITNESS_MAX_TOKENS`
- `WITNESS_MAX_SECONDS`
- `WITNESS_TOKENS_PER_SECOND`
- `WITNESS_TRUNCATION_MARKER`
- `JUDGE_RECAP_CADENCE`
- `LOG_LEVEL` (debug, info, warn, error; defaults to `info`)

If `OPENROUTER_API_KEY` is empty, the app falls back to deterministic mock dialogue.

If `DATABASE_URL` is set, the app uses Postgres-backed persistence and runs migrations at startup.
If `DATABASE_URL` is missing, the app falls back to in-memory storage (non-durable).

`TTS_PROVIDER=noop` keeps TTS silent (default). `TTS_PROVIDER=mock` records adapter calls for local/testing workflows without requiring an external speech provider.

Witness response caps are controlled by `WITNESS_MAX_TOKENS` and `WITNESS_MAX_SECONDS`. The recap cadence uses `JUDGE_RECAP_CADENCE` (every N witness cycles). `WITNESS_TRUNCATION_MARKER` customizes the appended cutoff text.

## Run

1. Install dependencies:
    - `npm install`
2. (Optional but recommended) run DB migrations explicitly:
    - `npm run migrate`
3. Start dev server:
    - `npm run dev`
4. Build operator dashboard:
    - `npm run build:dashboard` (production build)
    - `npm run dev:dashboard` (development mode on port 3001)
5. Open:
    - Main app: `http://localhost:3000`
    - Operator dashboard: `http://localhost:3000/operator`

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

- Main app: `http://localhost:${API_HOST_PORT:-3000}`
- Operator dashboard: `http://localhost:${API_HOST_PORT:-3000}/operator`
- API: `http://localhost:${API_HOST_PORT:-3000}/api`
- Postgres: internal-only by default (`db:5432` inside compose network)

If port `3000` is already in use on your machine, set `API_HOST_PORT` in `.env` (for example `API_HOST_PORT=3002`) and restart compose.

If you need host access to Postgres, add a `ports` mapping to the `db` service in `docker-compose.yml` (for example `"5433:5432"` to avoid conflicts with local Postgres).

## Operations runbook (staging)

See `docs/ops-runbook.md` for the repeatable staging deploy path, GitHub Actions
workflow (`Staging Deploy`), core SLI dashboard definitions, alert thresholds,
and incident drill/recovery steps. Ops-related configuration is validated as part of the standard test suite (see `npm test` under "Local CI parity" below).

## API

- `GET /api/health`
- `GET /api/court/sessions`
- `GET /api/court/sessions/:id`
- `POST /api/court/sessions`
- `POST /api/court/sessions/:id/vote`
- `POST /api/court/sessions/:id/phase`
- `GET /api/court/sessions/:id/stream` (SSE)

## Local CI parity

Run the same checks as CI locally before pushing:

```sh
npm run lint   # type-check (tsc --noEmit)
npm run build  # compile TypeScript to dist/
npm test       # run all tests
```

## Notes

- The existing `subcult-corp` directory is used only as a **reference source** and is not imported.
- Core reusable ideas were copied into `src/` as standalone modules.
- Schema migration SQL is under `db/migrations/`.
