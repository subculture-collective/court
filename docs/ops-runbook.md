# Improv Court staging deploy + ops runbook

## 1) Repeatable staging deployment (Docker-first)

Run from `/home/runner/work/court/court`:

1. Prepare env values:
   - `cp .env.example .env`
   - Set `OPENROUTER_API_KEY` (or leave empty for deterministic mock mode).
   - Optionally set `API_HOST_PORT` if `3001` is already taken.
2. Deploy:
   - `npm run docker:up`
3. Verify runtime health:
   - `curl -fsS http://localhost:${API_HOST_PORT:-3001}/api/health`
   - Expected response: `{"ok":true,"service":"improv-court-poc"}`
4. Optional migration-only verification:
   - `docker compose exec api npm run migrate:dist`

Rollback (staging):

1. Stop current stack: `npm run docker:down`
2. Checkout previous known-good commit/tag.
3. Start previous version: `npm run docker:up`
4. Re-run health check curl above.

## 2) Core SLI dashboard definitions

Use these as dashboard panels (SQL via Postgres + synthetic HTTP check):

### SLI A — Session completion rate (15m)

```sql
SELECT
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

## 4) Incident response + recovery drill

Run monthly in staging:

1. Start stack (`npm run docker:up`) and confirm `/api/health`.
2. Create one session via API.
3. Simulate API interruption: `docker compose stop api` (wait 30s) then `docker compose start api`.
4. Verify recovery:
   - `/api/health` returns success.
   - New sessions can be created.
   - Existing interrupted running sessions are marked failed with a restart reason (expected behavior from recovery logic).
5. Simulate DB interruption: `docker compose stop db` (wait 30s) then `docker compose start db`.
6. Confirm API health returns after DB health check passes.
7. Record drill timestamp, operator, and outcome in team incident log.
