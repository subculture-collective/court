# Clean Code Review (Refreshed)

Scope reviewed:

- `src/**/*.ts`
- `dashboard/src/**/*.{ts,tsx}`
- `public/app.js`

Generated: 2026-02-27

## Resolved since previous pass

- `public/app.js` stream handling now uses an event dispatch map (previous branch-heavy `if` chain removed).
- `src/court/prompt-bank.ts` selection duplication consolidated via shared helpers; legacy `selectNextPrompt` is now deprecated.
- `src/moderation/vote-spam.ts` stale-entry cleanup duplication removed.
- `src/court/phases/session-flow.ts` now uses shared phase entry helper (`beginPhase`) and named timing constants.
- `src/server.ts` uses shared mutation error mapping and extracted route registration helpers.
- `src/store/session-store.ts` removed `tx:any`; transaction query casting is centralized in one helper (`withTxQuery`).
- `dashboard/` naming and timing-literal quick wins completed.
- `docs/coding-conventions.md` added and linked from `README.md`.

## Remaining issues (priority ordered)

### 1) `createServerApp` still coordinates many responsibilities

- **Principle**: Small Functions + SRP
- **Location**: `src/server.ts`
- **Severity**: Medium
- **Issue**: Startup wiring still owns env parsing, vote-spam lifecycle, route composition, static/SPA serving, and restart recovery orchestration.
- **Suggestion**: Extract `createRuntimeConfig(...)` and `resumeInterruptedSessions(...)` to reduce orchestration density in `createServerApp`.

### 2) `runWitnessExamPhase` still mixes orchestration and recap behavior

- **Principle**: Small Functions + SRP
- **Location**: `src/court/phases/session-flow.ts`
- **Severity**: Medium
- **Issue**: Witness loop flow, pacing, recap generation, recap persistence, and recap TTS are all in one function.
- **Suggestion**: Extract `runWitnessCycle(...)` and `emitRecapIfDue(...)` helpers.

### 3) Catch-up character limit remains duplicated across backend/public

- **Principle**: Avoid Hardcoding Drift
- **Location**: `src/court/catchup.ts`, `public/app.js`
- **Severity**: Medium
- **Issue**: The max-chars cap exists in two runtimes; both now use named constants but remain independently defined.
- **Suggestion**: Expose a shared runtime config endpoint or shared constant package consumed by both surfaces.

### 4) Deprecated API still present in prompt bank

- **Principle**: YAGNI / Surface Area Control
- **Location**: `src/court/prompt-bank.ts`
- **Severity**: Low
- **Issue**: `selectNextPrompt` is unused in current workspace and retained only for compatibility.
- **Suggestion**: Remove in a planned cleanup version after confirming no external consumers.

### 5) Transaction helper still requires one compatibility cast

- **Principle**: Type Safety Consistency
- **Location**: `src/store/session-store.ts`
- **Severity**: Low
- **Issue**: Postgres transaction callback typing still requires one internal cast in `withTxQuery`.
- **Suggestion**: Keep centralized as-is unless upstream typings or wrapper abstraction allow a fully call-signature-safe approach.
