# ADR-001 — Improv Court Runtime Architecture

**Status:** Accepted  
**Date:** 2026-02-27  
**Author:** @copilot  

---

## Context

Improv Court is a real-time multi-agent courtroom simulation.
The runtime now includes an HTTP/SSE API layer, a phase-sequencing orchestrator, an LLM client, a content-moderation filter, a vote-spam guard, and a dual-backend session store.
Boundary ownership between these modules needs a durable reference so that future contributors can understand which module is responsible for which concern and what contracts must be honoured across module boundaries.

---

## Decision

We define five first-class runtime modules, each with a single owner concern.
Cross-module communication is governed by the contracts specified below.
No module may directly read another module's internal state; all data flows through the contracts.

---

## Module Boundaries and Ownership

```
┌────────────────────────────────────────────────────────────────┐
│                   Express HTTP Server  (src/server.ts)         │
│  — owns HTTP request routing and response serialisation        │
│  — owns SSE connection lifecycle and per-client fan-out        │
│  — owns vote-spam enforcement at the HTTP boundary             │
└───────┬──────────────────────────────────────┬─────────────────┘
        │ REST calls / phase-advance            │ SSE fan-out
        ▼                                       ▼
┌───────────────────────┐          ┌────────────────────────────┐
│  Court Orchestrator   │          │   Session Store            │
│  (src/court/          │          │   (src/store/              │
│   orchestrator.ts)    │          │    session-store.ts)       │
│                       │          │                            │
│  — owns phase         │          │  — owns durable session    │
│    sequencing logic   │◄────────►│    and turn state          │
│  — owns speaker       │ store    │  — owns the event bus      │
│    selection order    │ API      │    (EventEmitter)          │
│  — owns vote-window   │          │  — owns backend selection  │
│    sleep/close cycle  │          │    (Postgres / in-memory)  │
└───────┬───────────────┘          └────────────────────────────┘
        │ generateTurn
        ▼
┌───────────────────────┐
│   LLM Client          │
│   (src/llm/client.ts) │
│                       │
│  — owns LLM API calls │
│    (OpenRouter or mock)│
│  — owns raw output    │
│    sanitisation       │
└───────┬───────────────┘
        │ sanitized dialogue
        ▼
┌───────────────────────┐
│  Content Moderation   │
│  (src/moderation/     │
│   content-filter.ts)  │
│                       │
│  — owns pattern-based │
│    flagging and       │
│    redaction          │
└───────────────────────┘
```

### Module summary table

| Module | Source path | Owns | Must NOT do |
|---|---|---|---|
| **HTTP Server** | `src/server.ts` | Routing, SSE fan-out, vote-spam guard | Phase sequencing, LLM calls, direct DB access |
| **Court Orchestrator** | `src/court/orchestrator.ts` | Phase flow, speaker order, vote windows | HTTP concerns, direct DB access (uses store API) |
| **Session Store** | `src/store/session-store.ts` | Persistence, event bus, backend selection | Business logic, LLM calls, HTTP concerns |
| **LLM Client** | `src/llm/client.ts` | LLM API calls, output sanitisation | Moderation decisions, session state, HTTP concerns |
| **Content Moderation** | `src/moderation/content-filter.ts` | Pattern flagging, redaction | Session state, LLM calls, HTTP concerns |
| **Vote Spam Guard** | `src/moderation/vote-spam.ts` | Per-IP vote rate limiting | Session state, LLM calls |

---

## Phase-State Contract and Transition Invariants

### Phase sequence

```
case_prompt → openings → witness_exam → [evidence_reveal →] closings
    → verdict_vote → sentence_vote → final_ruling
```

The only permitted skip is `witness_exam → closings` (bypassing `evidence_reveal`).
All other transitions must advance forward through the sequence.
Backward transitions are **rejected** at the store layer.

### Phase state invariants

| Phase | Entry invariant | Exit invariant |
|---|---|---|
| `case_prompt` | Session `status = running`; `roleAssignments` fully populated | At least one `bailiff` turn stored |
| `openings` | `case_prompt` complete | One `prosecutor` turn + one `defense` turn stored |
| `witness_exam` | `openings` complete | At least one witness exchange (judge question + witness reply + cross-exam) stored |
| `evidence_reveal` | `witness_exam` complete *(optional phase — may be skipped)* | N/A |
| `closings` | `witness_exam` (or `evidence_reveal`) complete | One `prosecutor` closing + one `defense` closing stored |
| `verdict_vote` | `closings` complete; `verdictVoteWindowMs` > 0 | Poll closed; `verdictVotes` finalised |
| `sentence_vote` | `verdict_vote` complete; `sentenceVoteWindowMs` > 0 | Poll closed; `sentenceVotes` finalised |
| `final_ruling` | `sentence_vote` complete; `finalRuling` recorded | One `judge` final-ruling turn stored; session `status = completed` |

### Session status state machine

```
pending ──startSession()──► running ──completeSession()──► completed
                              │
                              └──failSession()──► failed
```

- `pending → running`: triggered by `startSession`.
- `running → completed`: triggered by `completeSession` after `final_ruling`.
- `running → failed`: triggered by `failSession` on any unrecoverable orchestration error.
- Completed and failed sessions are **immutable** — no phase or turn writes are accepted.

---

## API / SSE / Persistence Contract Table

### REST API contract

| Endpoint | Method | Phase gate | Mutates store | Emits SSE event |
|---|---|---|---|---|
| `/api/health` | GET | None | No | No |
| `/api/court/sessions` | GET | None | No | No |
| `/api/court/sessions/:id` | GET | None | No | No |
| `/api/court/sessions` | POST | None | Creates session + starts orchestration | `session_created`, `session_started` |
| `/api/court/sessions/:id/vote` | POST | `verdict_vote` or `sentence_vote` only | Updates vote tallies | `vote_updated` (or `vote_spam_blocked`) |
| `/api/court/sessions/:id/phase` | POST | Forward-only | Advances phase | `phase_changed` |
| `/api/court/sessions/:id/stream` | GET | None | No | Sends `snapshot` on connect; relays all subsequent session events |

### SSE event contract

Every SSE message carries a `CourtEvent` envelope:

```ts
{
  id: string;         // UUID
  sessionId: string;
  type: CourtEventType;
  at: string;         // ISO 8601
  payload: Record<string, unknown>;
}
```

| Event type | Trigger | Required payload fields |
|---|---|---|
| `snapshot` | SSE client connects | `session`, `turns`, `verdictVotes`, `sentenceVotes` |
| `session_created` | Session inserted | `sessionId` |
| `session_started` | Orchestration begins | `sessionId` |
| `phase_changed` | Phase advances | `phase: CourtPhase`, `durationMs: number` |
| `turn` | Turn stored after moderation | `turn: CourtTurn` |
| `vote_updated` | Valid vote cast | `voteType`, `choice`, `verdictVotes`, `sentenceVotes` |
| `analytics_event` | Poll open / poll close | `event: "poll_open" \| "poll_close"`, `phase: CourtPhase` |
| `moderation_action` | Turn redacted | `speaker: AgentId`, `reasons: ModerationReasonCode[]` |
| `vote_spam_blocked` | Vote rate-limited | `ip: string`, `voteType: string` |
| `session_completed` | Session reaches `completed` | `sessionId`, `finalRuling` |
| `session_failed` | Orchestration error | `sessionId`, `reason: string` |

### Persistence contract

The session store exposes a single typed interface (`CourtSessionStore`) that both backends implement identically.

| Operation | Postgres path | In-memory path | Emits event |
|---|---|---|---|
| `createSession` | INSERT into `court_sessions` | Map write | `session_created` |
| `startSession` | UPDATE `status = running` | Map update | `session_started` |
| `setPhase` | UPDATE `phase` + `phase_started_at` | Map update | `phase_changed` + `analytics_event` (poll_open for vote phases) |
| `addTurn` | INSERT into `court_turns` | Array push | `turn` (+ `moderation_action` if flagged) |
| `recordVote` | UPDATE `verdict_votes` / `sentence_votes` JSON | Map update | `vote_updated` |
| `recordFinalRuling` | UPDATE `final_ruling` JSON | Map update | — |
| `completeSession` | UPDATE `status = completed` | Map update | `session_completed` + `analytics_event` (poll_close for vote phases) |
| `failSession` | UPDATE `status = failed` + `failure_reason` | Map update | `session_failed` |
| `recoverInterruptedSessions` | SELECT `id` WHERE `status = running` | Returns empty list | — |

---

## Context Diagrams

### Orchestrator flow

```
POST /api/court/sessions
        │
        ▼
  createSession()  ──► session_created (SSE)
        │
        ▼
  runCourtSession()
        │
        ├─ startSession()  ──► session_started (SSE)
        │
        ├─ setPhase('case_prompt')  ──► phase_changed (SSE)
        │   └─ addTurn(bailiff)  ──► turn (SSE)
        │
        ├─ setPhase('openings')  ──► phase_changed (SSE)
        │   ├─ generateTurn(prosecutor)
        │   └─ generateTurn(defense)
        │
        ├─ setPhase('witness_exam')  ──► phase_changed (SSE)
        │   └─ for each witness:
        │       ├─ generateTurn(judge)
        │       ├─ generateTurn(witness)
        │       ├─ generateTurn(prosecutor cross)
        │       └─ generateTurn(defense rebuttal)
        │           [judge summary every 2 exchanges]
        │
        ├─ setPhase('closings')  ──► phase_changed (SSE)
        │   ├─ generateTurn(prosecutor)
        │   └─ generateTurn(defense)
        │
        ├─ setPhase('verdict_vote')  ──► phase_changed + analytics_event:poll_open (SSE)
        │   └─ sleep(verdictVoteWindowMs)
        │
        ├─ setPhase('sentence_vote')  ──► phase_changed + analytics_event:poll_open (SSE)
        │   └─ sleep(sentenceVoteWindowMs)
        │
        ├─ setPhase('final_ruling')  ──► phase_changed (SSE)
        │   ├─ recordFinalRuling()
        │   └─ generateTurn(judge)
        │
        └─ completeSession()  ──► session_completed (SSE)
```

### Session store and SSE fan-out

```
 Orchestrator                Session Store              SSE Clients
      │                           │                        │
      │── setPhase() ────────────►│                        │
      │                           │── emit('phase_changed')►─── data: {...}\n\n
      │                           │                        │
      │── addTurn() ─────────────►│                        │
      │                           │── emit('turn') ────────►─── data: {...}\n\n
      │                           │                        │

 HTTP /vote                 Session Store              SSE Clients
      │                           │                        │
      │── recordVote() ──────────►│                        │
      │                           │── emit('vote_updated') ►─── data: {...}\n\n
      │                           │                        │
```

### UI stream (browser overlay)

```
 Browser (public/index.html)
        │
        │  GET /api/court/sessions/:id/stream
        │◄──── data: {"type":"snapshot",...}  (initial full state)
        │◄──── data: {"type":"phase_changed",...}
        │◄──── data: {"type":"turn",...}       (live captions)
        │◄──── data: {"type":"vote_updated",...} (poll bar updates)
        │◄──── data: {"type":"session_completed",...}
        │
        │  POST /api/court/sessions/:id/vote  (verdict / sentence)
        │────►
```

---

## Required Baseline Telemetry Events Per Phase Transition

The following events **must** be emitted (by the session store) on every phase transition.
Operators and analytics consumers may rely on these events being present in the SSE stream.

| Transition | Required events |
|---|---|
| `→ case_prompt` | `phase_changed { phase: "case_prompt", durationMs }` |
| `→ openings` | `phase_changed { phase: "openings", durationMs }` |
| `→ witness_exam` | `phase_changed { phase: "witness_exam", durationMs }` |
| `→ evidence_reveal` | `phase_changed { phase: "evidence_reveal", durationMs }` |
| `→ closings` | `phase_changed { phase: "closings", durationMs }` |
| `→ verdict_vote` | `phase_changed { phase: "verdict_vote", durationMs }`, `analytics_event { event: "poll_open", phase: "verdict_vote" }` |
| `→ sentence_vote` | `phase_changed { phase: "sentence_vote", durationMs }`, `analytics_event { event: "poll_open", phase: "sentence_vote" }` |
| `→ final_ruling` | `phase_changed { phase: "final_ruling", durationMs }`, `analytics_event { event: "poll_close", phase: "verdict_vote" }`, `analytics_event { event: "poll_close", phase: "sentence_vote" }` |
| session completed | `session_completed { sessionId, finalRuling }` |
| session failed | `session_failed { sessionId, reason }` |
| turn moderated | `moderation_action { speaker, reasons }` *(only when content is redacted)* |
| vote rate-limited | `vote_spam_blocked { ip, voteType }` |

---

## Non-Goals

- Refactoring runtime code
- Introducing new external services
- Changing the HTTP or SSE wire format

---

## Consequences

- Every new runtime module must declare which existing module owns the state it reads or writes.
- Phase transitions must be initiated through `store.setPhase` — no module may mutate `session.phase` without going through the store.
- Vote tallies must be updated only through `store.recordVote` — no module may write directly to `verdictVotes` or `sentenceVotes`.
- Future contributors can map any runtime behaviour to an owning module using the **Module summary table** above.

---

## Related Documents

- [docs/architecture.md](./architecture.md) — component map and agent roles
- [docs/api.md](./api.md) — full REST and SSE reference
- [docs/operator-runbook.md](./operator-runbook.md) — deployment and operations
- [docs/moderation-playbook.md](./moderation-playbook.md) — content moderation procedures
