# Event Taxonomy

Canonical reference for all runtime events emitted by the Improv Court system.
Every event is represented as a [`CourtEvent`](../src/types.ts) and delivered
over the Server-Sent Events stream (`GET /api/court/sessions/:id/stream`) and
to any in-process `store.subscribe()` listener.

---

## Envelope

All events share the following envelope fields:

| Field       | Type     | Description                                    |
| ----------- | -------- | ---------------------------------------------- |
| `id`        | `string` | UUID auto-generated per event                  |
| `sessionId` | `string` | Correlation ID: identifies the court session   |
| `type`      | `string` | Event type name (see below)                    |
| `at`        | `string` | ISO 8601 timestamp when the event was produced |
| `payload`   | `object` | Type-specific data (see individual schemas)    |

> **Correlation IDs** — use `sessionId` to correlate events across a session
> lifecycle. Within a payload, `turnId` correlates events to a specific
> dialogue turn, and `phase` correlates events to the current court phase.
> A future `request_id` field (HTTP-layer) can be joined to session events via
> `sessionId` when the session is created from a POST request.

---

## Phase sequence

Phases advance in strict forward order. Skipping `evidence_reveal` (going
directly from `witness_exam` to `closings`) is the only permitted skip.

```
case_prompt → openings → witness_exam → [evidence_reveal →] closings
  → verdict_vote → sentence_vote → final_ruling
```

### Phase-transition checklist

Every phase transition emits a `phase_changed` event. The table below
confirms that each transition has a matching event name:

| Transition                         | Event emitted                                                                                            |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `case_prompt` → `openings`         | `phase_changed`                                                                                          |
| `openings` → `witness_exam`        | `phase_changed`                                                                                          |
| `witness_exam` → `evidence_reveal` | `phase_changed`                                                                                          |
| `witness_exam` → `closings` (skip) | `phase_changed`                                                                                          |
| `evidence_reveal` → `closings`     | `phase_changed`                                                                                          |
| `closings` → `verdict_vote`        | `phase_changed` + `analytics_event` (`poll_started`)                                                     |
| `verdict_vote` → `sentence_vote`   | `phase_changed` + `vote_closed` + `analytics_event` (`poll_closed`) + `analytics_event` (`poll_started`) |
| `sentence_vote` → `final_ruling`   | `phase_changed` + `vote_closed` + `analytics_event` (`poll_closed`)                                      |

---

## Event catalogue

### `session_created`

Emitted when a new session record is inserted.

**Severity:** `info`

**Payload**

```ts
{
    sessionId: string; // UUID of the newly created session
}
```

**Example**

```json
{
    "id": "e1a2b3c4-…",
    "sessionId": "f5d6e7f8-…",
    "type": "session_created",
    "at": "2024-01-15T10:00:00.000Z",
    "payload": {
        "sessionId": "f5d6e7f8-…"
    }
}
```

---

### `session_started`

Emitted when the orchestrator begins processing the session.

**Severity:** `info`

**Payload**

```ts
{
    sessionId: string;
    startedAt: string; // ISO 8601
}
```

**Example**

```json
{
    "type": "session_started",
    "payload": {
        "sessionId": "f5d6e7f8-…",
        "startedAt": "2024-01-15T10:00:01.000Z"
    }
}
```

---

### `phase_changed`

Emitted every time the session advances to a new phase.

**Severity:** `info`

**Payload**

```ts
{
  phase: CourtPhase;          // the new phase name
  phaseStartedAt: string;     // ISO 8601
  phaseDurationMs?: number;   // expected duration of this phase, if set
}
```

**Example — entering `verdict_vote`**

```json
{
    "type": "phase_changed",
    "payload": {
        "phase": "verdict_vote",
        "phaseStartedAt": "2024-01-15T10:04:30.000Z",
        "phaseDurationMs": 20000
    }
}
```

---

### `turn`

Emitted whenever a new dialogue turn is stored.

**Severity:** `info`

**Payload**

```ts
{
    turn: {
        id: string; // UUID — use as turnId for correlation
        sessionId: string;
        turnNumber: number;
        speaker: AgentId;
        role: CourtRole;
        phase: CourtPhase; // phase in which the turn was generated
        dialogue: string;
        createdAt: string; // ISO 8601
    }
}
```

**PII / safety note** — `dialogue` is LLM-generated text that has passed through
the content filter. Flagged content is replaced with a redaction placeholder
before this event is emitted. `dialogue` must never be logged at `debug` level
or below in production environments.

---

### `vote_updated`

Emitted after a jury vote is successfully recorded.

**Severity:** `info`

**Payload**

```ts
{
    voteType: 'verdict' | 'sentence';
    choice: string;
    verdictVotes: Record<string, number>; // cumulative totals
    sentenceVotes: Record<string, number>;
}
```

**Example — a verdict vote**

```json
{
    "type": "vote_updated",
    "payload": {
        "voteType": "verdict",
        "choice": "guilty",
        "verdictVotes": { "guilty": 7, "not_guilty": 2 },
        "sentenceVotes": {}
    }
}
```

---

### `vote_closed`

Emitted once when a vote phase closes (i.e., when transitioning away from
`verdict_vote` or `sentence_vote`).

**Severity:** `info`

**Payload**

```ts
{
    pollType: 'verdict' | 'sentence';
    closedAt: string; // ISO 8601
    votes: Record<string, number>; // snapshot of tallies at close
    nextPhase: CourtPhase; // phase entered after close
}
```

**Example**

```json
{
    "type": "vote_closed",
    "payload": {
        "pollType": "verdict",
        "closedAt": "2024-01-15T10:05:00.000Z",
        "votes": { "guilty": 7, "not_guilty": 2 },
        "nextPhase": "sentence_vote"
    }
}
```

---

### `witness_response_capped`

Emitted when a witness response is truncated due to configured response caps.

**Severity:** `info`

**Payload**

```ts
{
    turnId: string;
    speaker: AgentId;
    phase: CourtPhase;
    originalLength: number; // token estimate
    truncatedLength: number; // token estimate after cap
    reason: 'tokens' | 'seconds';
}
```

---

### `judge_recap_emitted`

Emitted when the judge recap is generated during witness examination.

**Severity:** `info`

**Payload**

```ts
{
    turnId: string;
    phase: CourtPhase;
    cycleNumber: number; // witness cycle count when recap occurred
}
```

---

### `analytics_event`

Poll lifecycle signals. Three named sub-events are emitted under this type:

| `name`           | When                                                     |
| ---------------- | -------------------------------------------------------- |
| `poll_started`   | Phase transitions into `verdict_vote` or `sentence_vote` |
| `vote_completed` | A vote is successfully cast                              |
| `poll_closed`    | Phase transitions away from a vote phase                 |

**Severity:** `info`

**Payload**

```ts
{
  name: 'poll_started' | 'vote_completed' | 'poll_closed';
  pollType: 'verdict' | 'sentence';
  phase?: CourtPhase;  // present for poll_started and poll_closed
  choice?: string;     // present for vote_completed
}
```

**Example — poll opened**

```json
{
    "type": "analytics_event",
    "payload": {
        "name": "poll_started",
        "pollType": "verdict",
        "phase": "verdict_vote"
    }
}
```

**Example — vote cast**

```json
{
    "type": "analytics_event",
    "payload": {
        "name": "vote_completed",
        "pollType": "verdict",
        "choice": "guilty"
    }
}
```

**Example — poll closed**

```json
{
    "type": "analytics_event",
    "payload": {
        "name": "poll_closed",
        "pollType": "verdict",
        "phase": "sentence_vote"
    }
}
```

---

### `moderation_action`

Emitted when a turn's content is flagged and redacted by the content filter.

**Severity:** `warn`

**Payload**

```ts
{
  turnId: string;          // UUID of the affected turn — correlation ID
  speaker: AgentId;
  reasons: ModerationReasonCode[];  // e.g. ['hate_speech', 'violence']
  phase: CourtPhase;
}
```

**PII / safety note** — this event must **not** include the original
(pre-redaction) dialogue. Log `reasons` and `turnId` only; do not log
`speaker` names at `error` severity.

**Example**

```json
{
    "type": "moderation_action",
    "payload": {
        "turnId": "a1b2c3d4-…",
        "speaker": "mux",
        "reasons": ["hate_speech"],
        "phase": "openings"
    }
}
```

---

### `vote_spam_blocked`

Emitted when a vote is rejected due to the per-IP rate limit.

**Severity:** `warn`

**Payload**

```ts
{
    ip: string; // the source IP address
    voteType: 'verdict' | 'sentence';
}
```

**PII / safety note** — `ip` is operational data used for abuse detection only.
It must **not** be stored in long-term analytics storage. Redact or omit `ip`
when forwarding these events to external logging pipelines.

**Example**

```json
{
    "type": "vote_spam_blocked",
    "payload": {
        "ip": "203.0.113.42",
        "voteType": "verdict"
    }
}
```

---

### `session_completed`

Emitted when the session reaches `final_ruling` successfully.

**Severity:** `info`

**Payload**

```ts
{
    sessionId: string;
    completedAt: string; // ISO 8601
}
```

---

### `session_failed`

Emitted when the orchestrator throws an unrecoverable error.

**Severity:** `error`

**Payload**

```ts
{
    sessionId: string;
    reason: string; // error message (sanitized)
    completedAt: string; // ISO 8601
}
```

**Example**

```json
{
    "type": "session_failed",
    "payload": {
        "sessionId": "f5d6e7f8-…",
        "reason": "LLM request timed out after 30 s",
        "completedAt": "2024-01-15T10:09:00.000Z"
    }
}
```

---

## Severity levels

| Severity | Event types                                                                                                                                                                            |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `info`   | `session_created`, `session_started`, `phase_changed`, `turn`, `vote_updated`, `vote_closed`, `witness_response_capped`, `judge_recap_emitted`, `analytics_event`, `session_completed` |
| `warn`   | `moderation_action`, `vote_spam_blocked`                                                                                                                                               |
| `error`  | `session_failed`                                                                                                                                                                       |

---

## Logging guidelines

1. **PII constraints** — dialogue text (`turn.dialogue`) must never appear in
   log lines at `debug` or below in production. The content filter guarantees
   it is redacted before the `turn` event is emitted, but downstream log
   aggregators must treat the field as sensitive.

2. **IP addresses** — the `ip` field in `vote_spam_blocked` is operational
   data only. Do not forward it to long-term analytics stores.

3. **Redaction in `moderation_action`** — log only `turnId` and `reasons`;
   do not re-log the original dialogue.

4. **Correlation** — always include `sessionId` in structured log entries.
   Include `turnId` for `turn` and `moderation_action` events to enable
   cross-referencing.

5. **Structured logging** — emit events as JSON objects so that the `type`,
   `sessionId`, `at`, and severity fields are indexable without parsing.

---

## Runtime validation

[`src/events.ts`](../src/events.ts) exports `assertEventPayload(event)`, a
runtime shape guard that throws a `TypeError` when a required field is missing
or has the wrong type. Call it on any `CourtEvent` before forwarding to
external systems:

```ts
import { assertEventPayload } from './events.js';

store.subscribe(sessionId, event => {
    assertEventPayload(event); // throws TypeError on malformed payload
    forwardToExternalSystem(event);
});
```

Unit tests for all event types live in [`src/events.test.ts`](../src/events.test.ts).
