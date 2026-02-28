# JuryRigged

[![CI](https://github.com/subculture-collective/court/actions/workflows/ci.yml/badge.svg)](https://github.com/subculture-collective/court/actions/workflows/ci.yml)

JuryRigged is a real-time, multi-agent courtroom simulation.
An Express API orchestrates agent dialogue across deterministic phases, streams live events via Server-Sent Events (SSE), and supports jury voting for verdict and sentence outcomes.

This repository is standalone and does not require `subcult-corp` at runtime.

## Highlights

- Multi-agent role orchestration (judge, prosecutor, defense, witnesses, bailiff)
- Strict, forward-only phase progression:
  - `case_prompt` → `openings` → `witness_exam` → `evidence_reveal` → `closings` → `verdict_vote` → `sentence_vote` → `final_ruling`
  - Optional skip: `witness_exam` → `closings`
- Live per-session SSE stream (`/api/court/sessions/:id/stream`)
- Jury voting APIs with phase gating + anti-spam/rate-limiting
- Main viewer UI (`public/`) and React operator dashboard (`/operator`)
- In-memory or Postgres-backed persistence (auto-selected by `DATABASE_URL`)
- Optional broadcast hook integration (`noop` or `obs`) for production workflows

## Tech Stack

- Node.js + TypeScript
- Express (API + static serving)
- React + Vite (operator dashboard)
- Postgres (optional durable store)

## Quick Start (Local)

### 1) Install dependencies

```bash
npm install
```

### 2) Configure environment

```bash
cp .env.example .env
```

For a zero-dependency local run:

- leave `OPENROUTER_API_KEY` empty (mock dialogue fallback)
- leave `DATABASE_URL` empty (in-memory session store)

### 3) Start the API server

```bash
npm run dev
```

Default local URL: `http://localhost:3000` (from `.env.example`).

### 4) Build operator dashboard assets

```bash
npm run build:dashboard
```

Then open:

- Main app: `http://localhost:3000`
- Operator dashboard: `http://localhost:3000/operator`

> The API serves `/operator` from `dist/dashboard`. If you haven’t built it yet, `/operator` will return a helpful 404 message.

## Dashboard Dev Mode (Hot Reload)

Run the dashboard separately while API dev server is running:

```bash
npm run dev:dashboard
```

- Dashboard dev URL: `http://localhost:3001/operator/`
- API proxy target in Vite is `http://localhost:3000`

If your API is not on port `3000`, update `vite.config.ts` proxy settings.

## Docker Compose (API + Postgres)

The compose stack includes:

- `api` (JuryRigged server)
- `db` (Postgres 16)

Start:

```bash
npm run docker:up
```

Stop:

```bash
npm run docker:down
```

Container behavior:

- API runs on container port `3001`
- Host mapping defaults to `${API_HOST_PORT:-3001}`
- Migrations run automatically on container startup (`npm run migrate:dist`)

Default compose endpoints:

- App + API: `http://localhost:${API_HOST_PORT:-3001}`
- Operator dashboard: `http://localhost:${API_HOST_PORT:-3001}/operator`

## Configuration

Copy `.env.example` and tune as needed.

### Core runtime

| Variable | Purpose |
| --- | --- |
| `PORT` | API port for local non-Docker runs (default in `.env.example`: `3000`) |
| `OPENROUTER_API_KEY` | Required for live LLM calls; empty enables deterministic mock fallback |
| `LLM_MODEL` | OpenRouter model identifier |
| `LLM_MOCK` | Force mock mode (`true`/`false`) |
| `DATABASE_URL` | Enables Postgres-backed durable store; omit for in-memory |
| `LOG_LEVEL` | `debug`, `info`, `warn`, `error` |

### Voting + moderation safety

| Variable | Purpose |
| --- | --- |
| `VERDICT_VOTE_WINDOW_MS` | Verdict poll window duration |
| `SENTENCE_VOTE_WINDOW_MS` | Sentence poll window duration |
| `VOTE_SPAM_MAX_VOTES_PER_WINDOW` | Vote rate cap per window |
| `VOTE_SPAM_WINDOW_MS` | Rate-limit window size |
| `VOTE_SPAM_DUPLICATE_WINDOW_MS` | Duplicate-vote suppression window |

### Witness / token controls

| Variable | Purpose |
| --- | --- |
| `WITNESS_MAX_TOKENS` | Max witness response tokens before truncation |
| `WITNESS_MAX_SECONDS` | Max witness response duration |
| `WITNESS_TOKENS_PER_SECOND` | Duration↔token heuristic |
| `WITNESS_TRUNCATION_MARKER` | Marker appended after truncation |
| `JUDGE_RECAP_CADENCE` | Emit recap every N witness cycles |
| `ROLE_MAX_TOKENS_*` | Per-role token budget overrides |
| `TOKEN_COST_PER_1K_USD` | Cost estimation coefficient |

### Broadcast integration

| Variable | Purpose |
| --- | --- |
| `BROADCAST_PROVIDER` | `noop` or `obs` |
| `OBS_WEBSOCKET_URL` | OBS WebSocket endpoint |
| `OBS_WEBSOCKET_PASSWORD` | OBS auth password (optional but recommended) |

See `docs/broadcast-integration.md` for setup details.

## API at a Glance

- `GET /api/health`
- `GET /api/court/sessions`
- `GET /api/court/sessions/:id`
- `POST /api/court/sessions`
- `POST /api/court/sessions/:id/vote`
- `POST /api/court/sessions/:id/phase`
- `GET /api/court/sessions/:id/stream` (SSE)

Full schemas, error codes, and event contracts: `docs/api.md`.

## Development Commands

### npm scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start API in watch mode (`src/server.ts`) |
| `npm run dev:dashboard` | Start Vite dashboard dev server |
| `npm run build` | Compile TS to `dist/` + build dashboard |
| `npm run build:dashboard` | Build dashboard only |
| `npm run start` | Run compiled server (`dist/server.js`) |
| `npm run migrate` | Run migrations from source (`tsx`) |
| `npm run migrate:dist` | Run migrations from compiled output |
| `npm test` | Run Node test suite |
| `npm run test:ops` | Run ops config tests |
| `npm run smoke:staging` | Run staging smoke script |

### Make targets

`Makefile` mirrors common workflows (`make dev`, `make test`, `make ci`, `make docker-up`, etc.).

## Local CI Parity

Run before opening a PR:

```bash
npm run lint
npm run build
npm test
```

## Repository Layout

- `src/` — server, orchestrator, store, moderation, broadcast, tests
- `public/` — viewer UI
- `dashboard/` — operator dashboard (React + Vite)
- `db/migrations/` — SQL schema migrations
- `docs/` — architecture, API, moderation, ops runbooks
- `ops/` — alert thresholds + runtime health dashboard artifacts

## Documentation Map

| Document | Description |
| --- | --- |
| `docs/ADR-001-juryrigged-architecture.md` | Core architectural decisions and invariants |
| `docs/architecture.md` | System components and phase sequencing |
| `docs/api.md` | REST + SSE contracts and schemas |
| `docs/coding-conventions.md` | Team coding style and maintainability conventions |
| `docs/operator-runbook.md` | Operator procedures and incident response |
| `docs/ops-runbook.md` | Staging deploy path, SLI/alert definitions |
| `docs/moderation-playbook.md` | Moderation policy and handling |
| `docs/event-taxonomy.md` | Event taxonomy and payload expectations |
| `docs/broadcast-integration.md` | OBS/broadcast automation configuration |
| `docs/phase5-6-implementation-plan.md` | Roadmap implementation plan |

## Notes

- Migrations run automatically when using Postgres-backed storage.
- When `DATABASE_URL` is not set, sessions are non-durable and not recoverable after restart.
- On restart with Postgres, interrupted `running` sessions are recovered and resumed.
