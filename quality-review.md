# Quality Review — Phase 7 Uncommitted Changes

## Summary

- **Verdict: Ready with fixes** (2 critical, 4 important)
- **Scope:** Working tree vs HEAD (`467d7d9`) — 20 modified files + ~12 new untracked files
- **Tests:** 158 pass / 0 fail / 2 skipped

## Triage

- Docs-only: **no**
- React/Next perf review: **no** (dashboard is Vite + React 18, no Next.js)
- UI guidelines audit: **yes** — `dashboard/src/App.tsx` and `public/app.js` / `public/index.html` have significant UI changes
- Reason:
    - `.tsx` files changed (`dashboard/src/App.tsx`)
    - Client JS overlay code heavily extended (`public/app.js`, `public/index.html`)
    - Core server, orchestrator, types, events, and new modules added (metrics, replay, twitch)

---

## Strengths

1. **Well-structured event system extension** — Phase 7 event types (`render_directive`, `witness_statement`, `case_file_generated`) follow existing conventions: typed payloads, runtime assertion in `assertEventPayload`, and matching test coverage.
2. **Comprehensive documentation** — `docs/event-taxonomy.md`, `docs/api.md`, `docs/broadcast-integration.md`, and `README.md` are all updated with the new endpoints, event types, and Twitch integration docs.
3. **Prometheus metrics module** — `src/metrics.ts` is clean, uses a dedicated registry, instruments all store operations via a proxy wrapper (`instrumentCourtSessionStore`), and exposes SSE/vote telemetry.
4. **Replay/recording system** — NDJSON record + replay is well-separated in `src/replay/session-replay.ts` with a clean manager class, test coverage, and both CLI flag and env-var entry points.
5. **Graceful degradation** — Twitch adapter, replay, and metrics all degrade to no-op when unconfigured; LLM client now falls back to mock on empty response instead of returning empty strings.
6. **Docker security hardened** — compose binds to `127.0.0.1` only and adds `TRUST_PROXY` support with proper parsing (bool / int / CIDR list).

---

## Issues

### Critical (Must Fix)

#### C1. `/press` and `/present` endpoints have no rate limiting

- **Location:** [src/server.ts](src/server.ts#L703-L731)
- **What:** The new `POST /api/court/sessions/:id/press` and `POST /api/court/sessions/:id/present` handlers are registered without any rate limiter. The existing vote endpoint has `VoteSpamGuard`; these audience-interaction endpoints have none.
- **Why it matters:** These are public-facing, unauthenticated endpoints. An attacker can flood `render_directive` events via rapid `/press` calls, overwhelming SSE clients and the overlay renderer. The docs themselves note "Per-loop audience action rate limits are enforced at the API layer" (broadcast-integration.md) — but this is not actually implemented.
- **Minimal fix:** Apply `express-rate-limit` (or extend `VoteSpamGuard`) to both endpoints. A sensible default: 10 req/IP/10s.

#### C2. Twitch `!objection` emits `count: -1` sentinel, but nothing increments it

- **Location:** [src/twitch/adapter.ts](src/twitch/adapter.ts#L149-L153)
- **What:** `wireTwitchToSession` emits `objection_count_changed` with `count: -1` and a comment "sentinel — orchestrator should increment". But the orchestrator only increments `objectionCount` inside `handleModerationRedirect` (moderation path). No code reads the `-1` sentinel from an SSE event and increments the counter.
- **Why it matters:** Every Twitch `!objection` command will broadcast `count: -1` to all SSE listeners. The overlay and dashboard will display `-1` as the objection count, corrupting the UI state. This is a data integrity issue.
- **Minimal fix:** Either (a) read the current `objectionCount` from the session inside `wireTwitchToSession` and emit `currentCount + 1`, or (b) have the store handle the increment internally when it receives this event.

---

### Important (Should Fix)

#### I1. `/api/metrics` endpoint not documented; operator runbook says it doesn't exist

- **Location:** [docs/operator-runbook.md](docs/operator-runbook.md#L213), README "API at a Glance" section
- **What:** `docs/operator-runbook.md` line 213 states: "There is no built-in metrics endpoint." But the uncommitted code adds `GET /api/metrics` serving Prometheus-format metrics. The README's API listing also omits `/api/metrics`.
- **Why it matters:** Operators won't discover the metrics endpoint; the runbook actively misleads.
- **Minimal fix:** Update `docs/operator-runbook.md` to reference `/api/metrics` and add it to the README's API listing and `docs/api.md`.

#### I2. `TWITCH_EVENTSUB_SECRET` in `.env.example` is unused

- **Location:** `.env.example` line 42
- **What:** `.env.example` declares `TWITCH_EVENTSUB_SECRET=` but no code reads this variable. The Twitch adapter only uses `TWITCH_CHANNEL`, `TWITCH_BOT_TOKEN`, and `TWITCH_CLIENT_ID`.
- **Why it matters:** Misleads operators into thinking EventSub is configured. If a secret is generated and placed here, it creates a false sense of security for a feature that doesn't exist yet.
- **Minimal fix:** Remove the line or comment it with `# (future — not yet used)`.

#### I3. `docs/event-taxonomy.md` payload schema mismatch for `render_directive`

- **Location:** [docs/event-taxonomy.md](docs/event-taxonomy.md) (render_directive payload section)
- **What:** The doc schema shows `directive.pose` (singular string) and `directive.face` (singular string), but the TypeScript type `RenderDirective` in `src/types.ts` uses `poses?: Partial<Record<CourtRole, CharacterPose>>` (plural, map) and `faces?: Partial<Record<CourtRole, CharacterFace>>` (plural, map). The orchestrator's `inferRenderDirective` emits `poses: { [role]: 'point' }`, not a flat `pose: 'point'`.
- **Why it matters:** Frontend consumers implementing against the docs will expect a flat string but receive an object map, causing rendering bugs.
- **Minimal fix:** Update the event taxonomy doc to show the actual `poses`/`faces` map shape.

#### I4. Dashboard `applyEventToSnapshot` duplicates session-snapshot logic

- **Location:** [dashboard/src/App.tsx](dashboard/src/App.tsx#L10-L160) (the entire `applyEventToSnapshot` function)
- **What:** The 160-line `applyEventToSnapshot` function in `App.tsx` re-implements event-to-snapshot mapping that already exists in `dashboard/src/session-snapshot.ts` (`mapSessionToSnapshot`). The two implementations handle overlapping event types (`phase_changed`, `turn`, `judge_recap_emitted`, `vote_updated`) with slightly different parsing logic.
- **Why it matters:** Two sources of truth for the same transformation. If one is updated, the other goes stale. The `App.tsx` version uses its own `asRecord`/`asString`/`asNumber` helpers rather than sharing the snapshot mapper.
- **Minimal fix:** Extend `mapSessionToSnapshot` (or add an `applyEventDelta` function in `session-snapshot.ts`) and import it into `App.tsx`.

---

### Minor (Nice to Have)

#### M1. `inferRenderDirective` keyword matching is case-sensitive after `.toUpperCase()`

- **Location:** [src/court/orchestrator.ts](src/court/orchestrator.ts#L100-L115)
- **What:** The function calls `dialogue.toUpperCase()` then checks for `'OBJECTION!'`, `'HOLD IT!'`, `'TAKE THAT!'`. This works, but only matches exact substrings with the exclamation mark. Dialogue like `"Objection, your honor"` (no `!`) won't trigger the effect.
- **Why it matters:** Low severity — the effect miss is cosmetic, but users may expect the Ace Attorney effect on any `objection` keyword.
- **Minimal fix:** Consider also matching without the trailing `!`.

#### M2. `public/app.js` growing large

- **Location:** [public/app.js](public/app.js) (~970 lines after diff)
- **What:** The file is accumulating responsibilities: SSE connection, fixture replay, dialogue typewriter, renderer bootstrap, keyboard shortcuts, vote UI, caption controls. No module splitting beyond the renderer.
- **Why it matters:** Harder to maintain as more overlay features land. Not blocking, but worth noting.

#### M3. `record:sse` script not documented in `docs/api.md`

- **Location:** README mentions it; `docs/api.md` does not.
- **What:** The `npm run record:sse` command and its flags (`--session`, `--base`, `--out`, `--max-events`, `--duration-ms`) are documented in README but absent from the API reference doc.
- **Why it matters:** Minor discovery issue for developers who check `docs/api.md` first.

---

## UI Guidelines (terse audit of changed UI files)

- [dashboard/src/App.tsx](dashboard/src/App.tsx#L262): `setInterval` with 5s polling — no `AbortController` or visibility-based pause; wastes battery on background tabs.
- [public/app.js](public/app.js): `document.addEventListener('keydown', ...)` does preventDefault on Enter/Escape globally — may conflict with form fields in future overlays. Current `isEditableElementFocused` guard is adequate for now.
- [public/index.html](public/index.html): New `#pixiStage` container introduced — no `aria-hidden="true"` attribute on the decorative canvas; screen readers may try to parse it.

---

## Verification Evidence

| Check                     | Result                                                  |
| ------------------------- | ------------------------------------------------------- |
| `npm test`                | 158 pass, 0 fail, 2 skipped                             |
| TypeScript compilation    | Implicit via test run (tsx)                             |
| New event payloads tested | Yes — 6 new tests for Phase 7 events                    |
| Replay module tested      | Yes — `session-replay.test.ts`, `server-replay.test.ts` |
| Metrics module            | Not tested (no `src/metrics.test.ts`)                   |
| Twitch adapter            | Not tested (no `src/twitch/adapter.test.ts`)            |
