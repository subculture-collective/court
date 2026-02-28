# Clean Code Review — JuryRigged (Full Repo)

**Date**: 2025-01-28  
**Scope**: All source files (`src/`, `dashboard/`, `public/`, config)  
**Reviewer**: Automated (Clean Code dimensions)  
**Conventions ref**: `docs/coding-conventions.md`

---

## Summary

| Severity | Count |
|----------|-------|
| High     | 7     |
| Medium   | 14    |
| Low      | 6     |

The codebase is well-structured overall: domain types are centralized, event flows are clearly separated, error handling at API boundaries is solid, and the coding conventions are largely followed. The main areas for improvement are **duplicated utility helpers in the dashboard**, **magic numbers in the renderer layer**, and a handful of **long functions** that would benefit from extraction.

---

## High Severity

### [Duplication]: `asRecord` / `asString` / `asNumber` duplicated across dashboard files

- **Principle**: DRY
- **Location**: `dashboard/src/App.tsx:10-22`, `dashboard/src/session-snapshot.ts:23-43`
- **Severity**: High
- **Issue**: Identical payload-narrowing helpers (`asRecord`, `asString`, `asNumber`, `asStringArray`) are copy-pasted in two files. Any behavioral change must be applied in both places.
- **Suggestion**: Extract into `dashboard/src/utils/payload-guards.ts` and import from both files.

### [Function Size]: `createDialogueStateMachine()` — ~230 lines

- **Principle**: Small Functions + SRP
- **Location**: `public/renderer/dialogue.js:40-270`
- **Severity**: High
- **Issue**: Single closure function managing typewriter state, punctuation timing, blip sounds, skip logic, and line advancement. Hard to test or modify individual behaviors.
- **Suggestion**: Extract `advanceLine()`, `computePunctuationDelay()`, and `handleSkip()` as standalone functions that the state machine delegates to.

### [Function Size]: `initCharacters()` — ~270 lines

- **Principle**: Small Functions + SRP
- **Location**: `public/renderer/characters.js:15-285`
- **Severity**: High
- **Issue**: Monolithic function creating all character slots, placeholder sprites, tint logic, and pose/face overlay handlers in one closure. Difficult to reason about individual slot behavior.
- **Suggestion**: Extract `createCharacterSlot()` to build one slot, then loop in `initCharacters()`. Extract `setPoseSprite` / `setFaceOverlay` as named helpers.

### [Function Size]: `instrumentCourtSessionStore()` — 87 lines

- **Principle**: Small Functions + SRP
- **Location**: `src/metrics.ts:202-289`
- **Severity**: High
- **Issue**: Factory returning a wrapper object where every method follows the same try/catch → record-error → rethrow pattern. The repetition obscures the actual instrumentation intent.
- **Suggestion**: Extract a generic `wrapWithMetrics(methodName, fn)` helper and use it for each method, reducing the function to a mapping.

### [Magic Numbers]: Renderer hex colors and proportional coordinates

- **Principle**: Avoid Hardcoding
- **Location**: `public/renderer/layers/background.js`, `characters.js`, `ui.js`, `effects.js`, `evidence.js`
- **Severity**: High
- **Issue**: 80+ unlabeled hex color values (`0xa08040`, `0x3b2f1e`, `0xff4444`, etc.) and proportional position constants (`0.5`, `0.12`, `0.85`, etc.) scattered throughout all renderer layer files. No palette or layout constants file exists.
- **Suggestion**: Create `public/renderer/theme.js` exporting named color constants (e.g., `ROLE_COLOR_JUDGE`, `BG_COURTROOM_DARK`) and layout proportions (e.g., `JUDGE_BENCH_Y`, `WITNESS_SLOT_X`).

### [Missing Backoff]: `useSSE` reconnect uses fixed 3 s interval

- **Principle**: Structural Clarity / Runtime Safety
- **Location**: `dashboard/src/hooks/useSSE.ts:46-50`
- **Severity**: High
- **Issue**: On SSE disconnect, the hook retries every 3 000 ms forever with no exponential backoff and no retry cap. Under sustained server downtime this can flood the server with connection attempts.
- **Suggestion**: Implement exponential backoff (e.g., 3 s → 6 s → 12 s, capped at 30 s) and a max-retry limit after which `error` state is set permanently.

### [Potential Resource Leak]: `effects.js` shake timer

- **Principle**: Runtime Safety
- **Location**: `public/renderer/effects.js` — `shake()` function
- **Severity**: High
- **Issue**: Calling `shake()` while a previous shake animation is still running starts a new `setInterval` without clearing the old one, leaking interval handles.
- **Suggestion**: Guard `shake()` entry by checking/clearing any active `shakeTimer` before creating a new interval.

---

## Medium Severity

### [Duplication]: `selectNextPrompt` / `selectNextSafePrompt` — 80 % identical

- **Principle**: DRY
- **Location**: `src/court/prompt-bank.ts:187-240`
- **Severity**: Medium
- **Issue**: Both functions differ only in a `.filter(p => p.active)` predicate. The rotation, hashing, and fallback logic is duplicated.
- **Suggestion**: Merge into a single function accepting an optional `filter` predicate; `selectNextSafePrompt` becomes `selectNextPrompt(history, { filter: p => p.active })`.

### [Duplication]: Typewriter logic duplicated between `public/app.js` and `dialogue.js`

- **Principle**: DRY
- **Location**: `public/app.js` (`startDialogueTypewriter`) and `public/renderer/dialogue.js`
- **Severity**: Medium
- **Issue**: Both files implement character-by-character text reveal with punctuation pauses and skip support. The `app.js` version is the legacy overlay; `dialogue.js` is the PixiJS version. Maintaining two diverges over time.
- **Suggestion**: Extract shared typewriter config (chars-per-second, punctuation delays) into `public/renderer/typewriter-config.js`. Long-term: remove `app.js` typewriter once PixiJS renderer is primary.

### [Magic Numbers]: `speaker-selection.ts` weighting constants

- **Principle**: Avoid Hardcoding
- **Location**: `src/court/speaker-selection.ts:26,41`
- **Severity**: Medium
- **Issue**: `Math.random() * 0.4 - 0.2` (jitter range) and `0.5` (recency penalty multiplier) are unlabeled.
- **Suggestion**: Extract as `const JITTER_RANGE = 0.4` / `const RECENCY_PENALTY = 0.5` with brief comment on tuning rationale.

### [Magic Numbers]: Token budget defaults

- **Principle**: Avoid Hardcoding
- **Location**: `src/court/token-budget.ts:22-29`
- **Severity**: Medium
- **Issue**: Role-specific token limits `260, 220, 160, 120` and `costPer1kTokensUsd: 0.002` are inline in the defaults object with no explanation of how values were chosen.
- **Suggestion**: Add a brief comment block above `DEFAULT_ROLE_TOKEN_BUDGETS` explaining the sizing rationale.

### [Magic Numbers]: `catchup.ts` — `DEFAULT_CASE_SO_FAR_MAX_CHARS = 220`, `turns.slice(-3)`

- **Principle**: Avoid Hardcoding
- **Location**: `src/court/catchup.ts:8,35`
- **Severity**: Medium
- **Issue**: `220` character limit and `-3` recent turns count are unlabeled. The `220` should document why this threshold.
- **Suggestion**: Rename `DEFAULT_CASE_SO_FAR_MAX_CHARS` → keep, add comment. Add `const RECENT_TURNS_COUNT = 3` for the slice.

### [Magic Numbers]: `dialogue.js` punctuation pause map

- **Principle**: Avoid Hardcoding
- **Location**: `public/renderer/dialogue.js:~10-20`
- **Severity**: Medium
- **Issue**: `180, 200, 200, 90, 110, 100, 260, 140` ms pause values for punctuation characters are inline with no comment.
- **Suggestion**: Group into a named `PUNCTUATION_PAUSES` constant object with a brief comment.

### [Naming]: `bestOf()` — non-intent-revealing

- **Principle**: Meaningful Names
- **Location**: `src/court/phases/session-flow.ts:79`
- **Severity**: Medium
- **Issue**: `bestOf` doesn't convey "most voted option". Reads like a comparison utility.
- **Suggestion**: Rename to `mostVotedChoice()` or `winningVoteOption()`.

### [Naming]: `input` parameter used generically in multiple functions

- **Principle**: Meaningful Names
- **Location**: `src/court/personas.ts:42`, `src/court/prompt-bank.ts:170,194,218`
- **Severity**: Medium
- **Issue**: Multiple functions use `input` as the sole parameter name for different shaped objects. In files with multiple such functions it reduces scanability.
- **Suggestion**: Use `promptConfig`, `rotationInput`, `selectionInput` respectively.

### [Naming]: `stitched` in `catchup.ts`

- **Principle**: Meaningful Names
- **Location**: `src/court/catchup.ts:36`
- **Severity**: Medium
- **Issue**: Variable name doesn't reveal intent.
- **Suggestion**: Rename to `recentTurnsSummary` or `turnExcerpt`.

### [Function Size]: `initCamera()` — ~120-line closure

- **Principle**: Small Functions + SRP
- **Location**: `public/renderer/camera.js`
- **Severity**: Medium
- **Issue**: Manages transition state, easing math, and animation frame loop in one closure.
- **Suggestion**: Extract `easeLerp()` and `animateTransition()` as standalone functions.

### [Function Size]: ModerationQueue `useEffect` — ~40 lines with nested loops

- **Principle**: Small Functions + SRP
- **Location**: `dashboard/src/components/ModerationQueue.tsx`
- **Severity**: Medium
- **Issue**: Event processing, deduplication, and queue mutation combined in a single effect callback.
- **Suggestion**: Extract `buildFlaggedItemsFromEvents(newEvents, existingIds): FlaggedItem[]` as a pure function.

### [Structural Clarity]: SessionMonitor inconsistent sessionId truncation

- **Principle**: Consistency
- **Location**: `dashboard/src/components/SessionMonitor.tsx` (`.slice(0, 16)`) vs `dashboard/src/App.tsx` (`.slice(0, 8)`)
- **Severity**: Medium
- **Issue**: Session ID display length differs between components without explanation.
- **Suggestion**: Extract `const SESSION_ID_DISPLAY_LENGTH` and use consistently.

### [Duplication]: `parsePositiveInt` / `parsePositiveFloat` in `token-budget.ts`

- **Principle**: DRY
- **Location**: `src/court/token-budget.ts:39-55`
- **Severity**: Medium
- **Issue**: 90 % identical functions differing only in `parseInt` vs `parseFloat`. Both also duplicate `parsePositiveInt` in `server.ts`.
- **Suggestion**: Merge into a shared utility or deduplicate via a generic `parsePositiveNumber`.

---

## Low Severity

### [Naming]: Renderer abbreviations (`camX`, `camY`, `camZoom`)

- **Principle**: Meaningful Names
- **Location**: `public/renderer/camera.js`
- **Severity**: Low
- **Issue**: Abbreviated coordinates. Acceptable in animation code but less self-documenting.
- **Suggestion**: Keep — standard convention in renderer/game code.

### [YAGNI]: `OBSWebSocketAdapter` is entirely TODO stubs

- **Principle**: YAGNI
- **Location**: `src/broadcast/obs-adapter.ts`
- **Severity**: Low
- **Issue**: Every method logs a stub message and does nothing. Kept as a placeholder.
- **Suggestion**: Acceptable if planned for near-term implementation. Consider marking with a `// TODO(phase-N)` header.

### [Naming]: `MockTTSAdapter` exported from production code

- **Principle**: Consistency
- **Location**: `src/tts/adapter.ts`
- **Severity**: Low
- **Issue**: Test-only adapter lives alongside production code without clear separation.
- **Suggestion**: Either prefix with `_` or move to `src/tts/__mocks__/adapter.ts`.

### [Structural Clarity]: `logger.ts` uses `Object.create()` for child loggers

- **Principle**: Readability First
- **Location**: `src/logger.ts:73-88`
- **Severity**: Low
- **Issue**: Prototype-based composition is unusual in TypeScript; class composition would be clearer.
- **Suggestion**: Acceptable if intentional. Add a brief comment explaining the design choice.

### [Convention]: `console.log` / `console.error` used in dashboard instead of structured logging

- **Principle**: Project Conventions
- **Location**: `dashboard/src/hooks/useSSE.ts:32,35`, dashboard components
- **Severity**: Low
- **Issue**: Dashboard uses raw `console.*` while backend uses structured logger. Acceptable for browser code.
- **Suggestion**: No action needed unless a browser-side logging wrapper is desired.

### [Convention]: `eslint-disable-next-line no-console` appears 10+ times in backend

- **Principle**: Project Conventions
- **Location**: `src/server.ts`, `src/court/orchestrator.ts`, `src/broadcast/adapter.ts`
- **Severity**: Low
- **Issue**: The structured `logger` exists but many places still use `console.*` with inline lint suppressions.
- **Suggestion**: Migrate remaining `console.warn` / `console.error` calls to the structured logger.

---

## What's Working Well

- **Types**: Centralized in `src/types.ts` with narrow union types for phases, roles, events. Dashboard mirrors via its own `types.ts`.
- **Event taxonomy**: Every court event has a typed payload interface in `src/events.ts`.
- **Error handling at API boundaries**: `sendError()`, `mapSessionMutationError()`, and custom error classes (`CourtValidationError`, `CourtNotFoundError`) provide clear error responses.
- **Moderation pipeline**: Input validation → content filter → spam guard → structured event emission.
- **Phase orchestration**: Clean separation into `phases/session-flow.ts` with named constants for durations and pauses.
- **Metrics instrumentation**: Prometheus counters/histograms properly wrap store operations.
- **Test coverage**: Behavior-focused tests for all major modules.
- **Configuration**: Environment-driven with sensible defaults and `parsePositiveInt` safety.
- **Coding conventions**: Documented and largely followed across the project.
