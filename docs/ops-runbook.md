# JuryRigged staging deploy + ops runbook

## 1) Repeatable staging deployment (Docker-first)

Run from the project root directory:

1. Prepare env values:
   - `cp .env.example .env`
   - Set `OPENROUTER_API_KEY` (or leave empty for deterministic mock mode).
   - Optionally set `API_HOST_PORT` if `3001` is already taken.
2. Deploy:
   - `npm run docker:up`
3. Verify runtime health:
   - `curl -fsS http://localhost:${API_HOST_PORT:-3001}/api/health`
  - Expected response: `{"ok":true,"service":"juryrigged"}`
4. Optional migration-only verification:
   - `docker compose exec api npm run migrate:dist`

### 1.1 GitHub Actions staging workflow

Use workflow **`Staging Deploy`** (`.github/workflows/staging-deploy.yml`) to
run repeatable staging deploy + smoke verification with an environment matrix:

- `mock` profile (`LLM_MOCK=true`, no OpenRouter key required)
- `live` profile (`LLM_MOCK=false`, requires `openrouter_api_key` workflow input)

Workflow smoke checks:

1. `GET /api/health`
2. `POST /api/court/sessions`
3. `GET /api/court/sessions/:id`

Artifacts captured per run:

- `smoke-health.json`
- `smoke-results.json`
- `deploy-metadata.json`
- `docker-compose.log`

### 1.2 Rollback (staging)

1. Stop current stack: `npm run docker:down`
2. Checkout previous known-good commit/tag.
3. Start previous version: `npm run docker:up`
4. Re-run health check curl above.

Rollback trial checklist (verify once per release candidate):

- [ ] Deploy a known good revision via `Staging Deploy`.
- [ ] Deploy a deliberately broken revision (or force failed smoke input).
- [ ] Roll back to previous good revision.
- [ ] Confirm smoke checks pass and artifact logs show healthy recovery.
- [ ] Record run ID, operator, and timestamp in incident notes.

## 2) Core SLI dashboard definitions

Use these as dashboard panels (SQL via Postgres + synthetic HTTP check):

Source-of-truth dashboard artifact:

- `ops/dashboards/runtime-health.dashboard.json`

### SLI A — Session completion rate (15m)

```sql
SELECT
  -- 100.0 converts completion fraction to percentage.
  COALESCE(
    ROUND(
      100.0 * SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)::numeric
      / NULLIF(COUNT(*), 0),
      2
    ),
    100.00
  ) AS session_completion_rate_pct
FROM court_sessions
WHERE created_at >= NOW() - INTERVAL '15 minutes';
```

### SLI B — Vote API latency p95 (synthetic probe)

Measure p95 response time of `POST /api/court/sessions/:id/vote` from staging probes.
Example probe command format:

```bash
curl -s -o /dev/null -w "%{time_total}\n" \
  -H "Content-Type: application/json" \
  -d '{"type":"verdict","choice":"guilty"}' \
  "http://localhost:${API_HOST_PORT:-3001}/api/court/sessions/<session-id>/vote"
```

### SLI C — Moderation events per 15m

Moderation is persisted as redacted dialogue turns. Track count of redacted turns:
the placeholder must match `REDACTED_PLACEHOLDER` in `src/moderation/content-filter.ts`.

```sql
SELECT COUNT(*) AS moderation_events_15m
FROM court_turns
WHERE created_at >= NOW() - INTERVAL '15 minutes'
  AND dialogue = '[The witness statement has been redacted by the court for decorum violations.]';
```

## 3) Alert thresholds

- **Session completion rate low**: alert if SLI A `< 95` for 15 minutes.
- **Vote latency high**: alert if SLI B p95 `> 1.5s` for 10 minutes.
- **Moderation spike**: alert if SLI C `> 20` in 15 minutes.
- **Hard-down**: alert immediately if `/api/health` probe fails 3 consecutive checks.

Source-of-truth alert artifacts:

- `ops/alerts/thresholds.json`
- `ops/alerts/synthetic-scenarios.json`

### 3.1 Synthetic alert validation

Run the synthetic scenario test before each staging release candidate:

1. `npm run test:ops`
2. Confirm each scenario in `ops/alerts/synthetic-scenarios.json` matches expected triggered alerts.
3. If thresholds change, update both `ops/alerts/thresholds.json` and synthetic scenarios in the same PR.

## 4) Incident response + recovery drill

Run monthly in staging:

1. Start stack (`npm run docker:up`) and confirm `/api/health`.
2. Create one session via API.
3. Simulate API interruption: `docker compose stop api` (wait 30s) then `docker compose start api`.
4. Verify recovery:
   - `/api/health` returns success.
   - New sessions can be created.
   - Existing interrupted `running` sessions are resumed automatically when using Postgres-backed storage (`recoverInterruptedSessions` returns IDs for restart).
   - With in-memory storage, interrupted sessions are not recoverable across process restarts.
5. Simulate DB interruption: `docker compose stop db` (wait 30s) then `docker compose start db`.
6. Confirm API health returns after DB health check passes.
7. Record drill timestamp, operator, and outcome in team incident log.
