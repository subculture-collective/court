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

---

## 9 — Live operations control loop (startup → showtime → shutdown)

Use this section during real shows. Dashboard/alert configuration details are documented in `docs/ops-runbook.md`:

- Section 2 — Runtime health dashboard SQL panels
- Section 3 — Alert thresholds and routing

### 9.1 Startup checklist (T-30 minutes to T-5 minutes before show start)

1. **Environment sanity**
  - Confirm `OPENROUTER_API_KEY` present for live mode (or `LLM_MOCK=true` for rehearsal).
  - Confirm vote windows and token/recap knobs are set for this show.
2. **System readiness**
  - Confirm `GET /api/health` is green.
  - Confirm API health probe (hard-down threshold from `docs/ops-runbook.md` Section 3) is passing.
3. **Dry session smoke**
  - Create one session and verify SSE stream connects.
  - Confirm metric movement in:
    - SLI A — Session completion rate (`docs/ops-runbook.md` Section 2)
    - SLI B — Vote API latency p95 (`docs/ops-runbook.md` Section 2)
    - SLI C — Moderation events per 15m (`docs/ops-runbook.md` Section 2)
4. **Alert routing check**
  - Validate pager/notification channel receives one test alert payload.
  - Verify alert payload contains runbook link back to this document.

### 9.2 Live show checklist (continuous)

Every 2–3 minutes, check:

- API health probe remains passing (no consecutive failures).
- SLI B — Vote API latency p95 remains below 1.5s threshold.
- SLI C — Moderation events per 15m does not trend toward spike conditions.
- Active session progresses through phases (watch `phase_changed` events).

Operator controls available during live session:

- Manual phase advance: `POST /api/court/sessions/:id/phase`
- Jury voting endpoint verification: `POST /api/court/sessions/:id/vote`
- Session status/metadata checks: `GET /api/court/sessions/:id`

### 9.3 Shutdown checklist (post-show)

1. Confirm active sessions are `completed` or intentionally ended.
2. Export key logs and alert timeline for the session window.
3. Record any manual interventions in the incident/ops log.
4. Stop stack if required (`npm run docker:down`).

---

## 10 — Incident playbooks (common failure scenarios)

### Scenario A — API hard down

- **Detection:** Hard-down threshold: `/api/health` probe fails 3 consecutive checks (see `docs/ops-runbook.md` Section 3), plus loss of API responses.
- **Immediate action:** Restart API service, confirm `/api/health` recovery.
- **Recovery validation:** Create a new session; verify stream connect and vote endpoint response.
- **Escalation trigger:** If health remains failing > 5 minutes, declare incident and page engineering lead.

### Scenario B — Stream connectivity degraded

- **Detection:** Falling stream success ratio; SSE clients unable to connect or receive events.
- **Immediate action:** Verify SSE endpoint connectivity for a fresh session ID and active one.
- **Recovery validation:** Observe stream reconnection and resumed phase/tally updates.
- **Escalation trigger:** If degradation persists > 10 minutes, switch to fallback broadcast messaging.

### Scenario C — Moderation storm

- **Detection:** Moderation spike threshold: SLI C > 20 in 15 minutes (see `docs/ops-runbook.md` Section 3).
- **Immediate action:** Announce stricter decorum reminder; continue with moderated redaction behavior.
- **Recovery validation:** Confirm moderation count trends down and no safety regressions.
- **Escalation trigger:** If unsafe content persists across multiple rounds, pause session and move to mistrial fallback.

### Scenario D — Vote latency regression

- **Detection:** Vote latency high threshold: SLI B p95 > 1.5s for 10 minutes (see `docs/ops-runbook.md` Section 3).
- **Immediate action:** Pause launching new sessions; keep current poll open long enough for fairness.
- **Recovery validation:** p95 returns under threshold and vote submissions succeed within expected latency.
- **Escalation trigger:** If p95 remains high for > 15 minutes, reduce traffic and investigate infrastructure bottleneck.

### Scenario E — Session appears stuck in phase

- **Detection:** No meaningful `phase_changed` progression and no new turns for > 2 minutes during active run.
- **Immediate action:** Inspect `GET /api/court/sessions/:id`, then apply forward-only manual phase advance to unstick.
- **Recovery validation:** New `phase_changed` event appears and turn generation resumes.
- **Escalation trigger:** Repeated stalls in same round indicate deeper orchestrator/LLM dependency issue.

---

## 11 — Mistrial fallback and emergency procedures

### 11.1 Mistrial fallback

Use when fairness, safety, or service stability cannot be restored quickly.

1. Announce mistrial to viewers in the broadcast layer.
2. Move session to closure quickly using **forward-only** phase steps via `POST /api/court/sessions/:id/phase`.
  - If in `witness_exam`, move to `closings`.
  - Then advance through `verdict_vote` → `sentence_vote` → `final_ruling` with short durations if needed.
3. Record incident details and open retrospective action items.

### 11.2 Emergency recap procedure

Use when viewers are lost after disruption or reconnect storm.

1. Pull latest state via `GET /api/court/sessions/:id`.
2. Operator publishes a concise two-sentence recap in the broadcast layer (manual overlay/commentary).
3. Confirm resumed phase and current jury step are visible to viewers.
4. Record the recap trigger and reason in post-show notes.

> Note: There is currently no dedicated API endpoint for forced recap insertion; recap emission is automatic during witness cycles.

### 11.3 Witness-swap procedure (current platform constraints)

There is no hot-swap witness API for an in-progress session.

Workaround:

1. During `witness_exam`, if a witness must be replaced, manually advance to `closings`.
2. Finish current session with minimal disruption.
3. Start next session with adjusted participant list at creation time.
4. Document the swap reason for retrospective analysis.

---

## 12 — Dashboard and alert reference map

| Operational concern | Dashboard panel ID | Alert ID |
| --- | --- | --- |
| Session completion health | `session_completion_rate_15m` | `session_completion_rate_low` |
| Vote API responsiveness | `vote_latency_p95_10m` | `vote_latency_high` |
| Moderation intensity | `moderation_events_15m` | `moderation_spike` |
| API + stream liveliness | `stream_and_api_health` | `api_hard_down`, `stream_connectivity_degraded` |

---

## 13 — Tabletop drill notes (captured)

Date: 2026-02-27

Observed gaps during tabletop simulation:

1. Needed explicit live control loop steps by show phase.
2. Needed named incident playbooks linked to panel/alert IDs.
3. Needed formal mistrial and emergency recap fallback documentation.
4. Needed witness-swap guidance under current API constraints.

Patches applied in this runbook revision:

- Added Sections 9–12 with operational checklists and cross-referenced IDs.
- Added five incident scenarios with detection, response, validation, and escalation.
- Added mistrial fallback, emergency recap, and witness-swap procedures.

---

## Appendix A — Planned features (not yet implemented)

### A.1 — Viewer onboarding/catch-up panel operations

> **NOTE:** This feature is **planned but not yet implemented**. It is tracked in
> `docs/phase5-6-implementation-plan.md` as issue **#34: Onboarding/catch-up
> panel for new viewers**. The following operational notes are **forward-looking**
> and should not be used for current production runs.

The viewer UI is expected to include a compact **Case so far** panel with:

- Current phase + jury step status
- Recap-aware summary (latest recap preferred, otherwise recent turns)
- Toggle (`Hide`/`Show`) for compact viewing

Operator expectations (once implemented):

1. On phase changes, confirm panel meta updates to the new phase/jury step.
2. During reconnect events, confirm the panel rebuilds from snapshot state.
3. If viewers report confusion, keep panel visible and issue a manual emergency recap if needed.

Telemetry note (planned):

- Catch-up toggle telemetry is aggregate-only and logged as
  `[telemetry] catchup_panel_visibility ...` (no user/session identifiers).
