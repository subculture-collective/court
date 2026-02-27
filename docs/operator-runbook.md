# Operator Runbook

This document covers everything needed to deploy, configure, and operate Improv Court.

---

## Prerequisites

- **Node.js** 20+ (LTS)
- **npm** 10+
- **Docker + Docker Compose** (optional, for the containerised stack)
- An **OpenRouter API key** (optional; the app runs in mock mode without one)
- **Postgres 14+** (optional; the app falls back to in-memory storage without a `DATABASE_URL`)

---

## 1 — Local Development Setup

### 1.1 Clone and install

```bash
git clone https://github.com/subculture-collective/court.git
cd court
npm install
```

### 1.2 Configure environment

```bash
cp .env.example .env
# Edit .env — minimum required changes are documented below
```

Key variables:

| Variable                 | Default                              | Description |
|--------------------------|--------------------------------------|-------------|
| `OPENROUTER_API_KEY`     | *(empty)*                            | Set to enable real LLM calls. Leave empty for deterministic mock mode. |
| `LLM_MODEL`              | `deepseek/deepseek-chat-v3-0324:free`| OpenRouter model identifier. |
| `PORT`                   | `3001`                               | Port the HTTP server listens on. |
| `DATABASE_URL`           | *(empty)*                            | Postgres connection string. Omit for in-memory mode. |
| `VERDICT_VOTE_WINDOW_MS` | `20000`                              | Duration of the verdict poll in milliseconds. |
| `SENTENCE_VOTE_WINDOW_MS`| `20000`                              | Duration of the sentence poll in milliseconds. |

### 1.3 (Optional) Run database migrations

Migrations run automatically on startup when `DATABASE_URL` is set.
To run them explicitly:

```bash
npm run migrate
```

### 1.4 Start the development server

```bash
npm run dev
```

Open `http://localhost:3001` in a browser.

---

## 2 — Docker Compose Stack (API + Postgres)

The compose file starts two services:
- `api` — the Improv Court server (builds from `Dockerfile`)
- `db` — Postgres 16

```bash
# Start the full stack (builds images if needed)
npm run docker:up

# Stop the stack
npm run docker:down
```

On first start the `api` container runs `npm run migrate:dist` before launching the server.

### Port conflicts

If port `3001` is already in use:

1. Set `API_HOST_PORT=3002` (or any free port) in `.env`.
2. Restart: `npm run docker:down && npm run docker:up`.

To expose Postgres to the host (e.g., for `psql` inspection), add a `ports` entry to the `db` service in `docker-compose.yml`:

```yaml
ports:
  - "5433:5432"
```

---

## 3 — Production Deployment

> The app has no built-in TLS termination. Place it behind a reverse proxy (nginx, Caddy, etc.) in production.

### Build

```bash
npm run build
```

This emits compiled JavaScript to `dist/`.

### Start

```bash
npm start
```

The compiled entry point is `dist/server.js`.
Ensure `DATABASE_URL` and other environment variables are set in the process environment before starting.

### Migrations in production

Run migrations before starting a new release:

```bash
npm run migrate:dist
```

### Health checks

`GET /api/health` returns `{ "ok": true }` when the server is up.
Use this endpoint for load-balancer and container health checks.

---

## 4 — Session Lifecycle Operations

### Start a session (curl example)

```bash
curl -s -X POST http://localhost:3001/api/court/sessions \
  -H 'Content-Type: application/json' \
  -d '{"topic":"The defendant is accused of stealing the office thermostat","caseType":"criminal"}' \
  | jq .
```

### Watch the live stream

```bash
curl -N http://localhost:3001/api/court/sessions/<SESSION_ID>/stream
```

### Cast a verdict vote

```bash
curl -s -X POST http://localhost:3001/api/court/sessions/<SESSION_ID>/vote \
  -H 'Content-Type: application/json' \
  -d '{"type":"verdict","choice":"guilty"}'
```

### Cast a sentence vote

```bash
curl -s -X POST http://localhost:3001/api/court/sessions/<SESSION_ID>/vote \
  -H 'Content-Type: application/json' \
  -d '{"type":"sentence","choice":"Banished to the shadow realm"}'
```

### Manually advance a phase (operator override)

```bash
curl -s -X POST http://localhost:3001/api/court/sessions/<SESSION_ID>/phase \
  -H 'Content-Type: application/json' \
  -d '{"phase":"closings"}'
```

Only forward phase transitions are accepted.

---

## 5 — Session Recovery

If the server restarts while sessions are in the `running` state, orchestration is automatically re-started for each interrupted session on the next boot.
Turns already written to the database are preserved; the orchestrator replays from the beginning of the phase sequence but only appends new turns.

With in-memory storage, interrupted sessions are **not** recovered after a restart.

---

## 6 — Tuning Vote Windows

Vote window lengths are set globally via environment variables.
A shorter window speeds up sessions; a longer window gives the audience more time to participate.

```env
VERDICT_VOTE_WINDOW_MS=20000    # 20 seconds (default)
SENTENCE_VOTE_WINDOW_MS=20000   # 20 seconds (default)
```

Per-session overrides are not currently supported.
To test with very short windows (e.g., smoke tests): set `VERDICT_VOTE_WINDOW_MS=1000 SENTENCE_VOTE_WINDOW_MS=1000` before starting the server.

---

## 7 — Monitoring and Logging

The server logs to `stdout`/`stderr`. Key log prefixes:

| Prefix              | Meaning |
|---------------------|---------|
| `[moderation]`      | A turn was flagged and redacted. Includes session ID, speaker, and reason codes. |
| `[vote-spam]`       | A vote was blocked by the rate limiter. Includes IP and session ID. |

All session events are also emitted to the SSE stream (see [api.md](./api.md#sse-event-contracts)).

There is no built-in metrics endpoint. For production observability, pipe logs to a structured logging system or attach to the SSE stream.

---

## 8 — Database Maintenance

### Schema

The schema is defined in `db/migrations/001_improv_court_core.sql`.
The migration system tracks applied migrations in `court_schema_migrations`.

### Cleaning up old sessions

Completed or failed sessions are retained indefinitely.
To prune old records:

```sql
-- Delete sessions and their turns older than 30 days
DELETE FROM court_sessions
WHERE status IN ('completed', 'failed')
  AND created_at < NOW() - INTERVAL '30 days';
```

Turns are cascade-deleted when their parent session is deleted.
