# API Reference

Base URL: `http://localhost:${PORT}` (default `PORT=3001`)

All request and response bodies are JSON unless noted.
Error responses have the shape `{ "code": "<ERROR_CODE>", "error": "<message>" }`.

---

## Health

### `GET /api/health`

Returns service liveness.

**Response `200`**

```json
{ "ok": true, "service": "improv-court-poc" }
```

---

## Sessions

### `GET /api/court/sessions`

Returns all sessions.

**Response `200`**

```json
{
  "sessions": [ <CourtSession>, … ]
}
```

---

### `GET /api/court/sessions/:id`

Returns a single session including its full turn history.

**Response `200`** — `{ "session": <CourtSession> }`

**Response `404`** — session not found

---

### `POST /api/court/sessions`

Creates and immediately starts a new court session.

**Request body**

| Field             | Type                    | Required | Description                                                                             |
| ----------------- | ----------------------- | -------- | --------------------------------------------------------------------------------------- |
| `topic`           | `string`                | ✅       | Case description. Minimum 10 characters.                                                |
| `caseType`        | `"criminal" \| "civil"` | ❌       | Defaults to `"criminal"`.                                                               |
| `participants`    | `AgentId[]`             | ❌       | List of agent IDs to include. Defaults to all six agents. Must be at least 4 valid IDs. |
| `sentenceOptions` | `string[]`              | ❌       | Custom sentence choices for the sentencing poll. Defaults to five built-in options.     |

**Response `201`** — `{ "session": <CourtSession> }`

**Response `400`** — validation error (topic too short, too few participants, etc.)

Common error codes:

- `INVALID_TOPIC`
- `INVALID_PARTICIPANTS`
- `SESSION_CREATE_FAILED`

**Example**

```json
POST /api/court/sessions
{
  "topic": "The defendant is accused of stealing the office thermostat",
  "caseType": "criminal"
}
```

---

### `POST /api/court/sessions/:id/vote`

Casts a jury vote. Enforces the active phase (verdict votes only accepted during `verdict_vote`; sentence votes only during `sentence_vote`).
Rate-limited to 10 votes per IP per session per 60 seconds.

**Request body**

| Field    | Type                      | Required | Description            |
| -------- | ------------------------- | -------- | ---------------------- |
| `type`   | `"verdict" \| "sentence"` | ✅       | Which poll to vote in. |
| `choice` | `string`                  | ✅       | The selected option.   |

Valid verdict choices:

- Criminal: `"guilty"` or `"not_guilty"`
- Civil: `"liable"` or `"not_liable"`

**Response `200`**

```json
{
    "sessionId": "…",
    "verdictVotes": { "guilty": 12, "not_guilty": 3 },
    "sentenceVotes": {}
}
```

**Response `400`** — invalid type, empty choice, or vote not currently accepted for that phase

Common error codes:

- `INVALID_VOTE_TYPE`
- `MISSING_VOTE_CHOICE`
- `VOTE_REJECTED`

**Response `404`** — session not found

**Response `429`** — too many votes from this IP

Additional error codes:

- `SESSION_NOT_FOUND` (`404`)
- `VOTE_RATE_LIMITED` (`429`)
- `VOTE_FAILED` (`500`)

---

### `POST /api/court/sessions/:id/phase`

Manually advance or set the session phase (operator use).
Respects the same forward-only phase transition rules as the orchestrator.

**Request body**

| Field        | Type         | Required | Description                           |
| ------------ | ------------ | -------- | ------------------------------------- |
| `phase`      | `CourtPhase` | ✅       | Target phase name.                    |
| `durationMs` | `number`     | ❌       | Override phase timer in milliseconds. |

**Response `200`** — `{ "session": <CourtSession> }`

**Response `400`** — invalid phase or illegal transition

Common error codes:

- `INVALID_PHASE`
- `INVALID_PHASE_TRANSITION`

**Response `404`** — session not found

Additional error codes:

- `SESSION_NOT_FOUND` (`404`)
- `PHASE_SET_FAILED` (`500`)

---

### `GET /api/court/sessions/:id/stream`

Opens a Server-Sent Events stream for the session.
On connect, sends a `snapshot` event with the full current state, then emits all subsequent session events in real time.

**Response** — `Content-Type: text/event-stream`

Each SSE message is a single `data:` line containing a JSON-encoded `CourtEvent`.

```
data: {"type":"snapshot","payload":{…}}\n\n
data: {"type":"turn","payload":{…}}\n\n
```

---

## Data Schemas

### `CourtSession`

```ts
{
  id: string;                   // UUID
  topic: string;
  status: "pending" | "running" | "completed" | "failed";
  participants: AgentId[];
  phase: CourtPhase;
  turnCount: number;
  turns: CourtTurn[];
  metadata: CourtSessionMetadata;
  createdAt: string;            // ISO 8601
  startedAt?: string;
  completedAt?: string;
  failureReason?: string;
}
```

### `CourtTurn`

```ts
{
    id: string; // UUID
    sessionId: string;
    turnNumber: number;
    speaker: AgentId;
    role: CourtRole;
    phase: CourtPhase;
    dialogue: string;
    createdAt: string;
}
```

### `CourtSessionMetadata`

```ts
{
  mode: "improv_court";
  casePrompt: string;
  caseType: "criminal" | "civil";
  sentenceOptions: string[];
  phaseStartedAt?: string;
  phaseDurationMs?: number;
  verdictVoteWindowMs: number;
  sentenceVoteWindowMs: number;
  verdictVotes: Record<string, number>;
  sentenceVotes: Record<string, number>;
  voteSnapshots?: {
    verdict?: {
      closedAt: string;
      votes: Record<string, number>;
    };
    sentence?: {
      closedAt: string;
      votes: Record<string, number>;
    };
  };
  recapTurnIds?: string[];
  finalRuling?: {
    verdict: string;
    sentence: string;
    decidedAt: string;
  };
  roleAssignments: {
    judge: AgentId;
    prosecutor: AgentId;
    defense: AgentId;
    witnesses: AgentId[];
    bailiff: AgentId;
  };
}
```

### `AgentId`

One of: `"chora"` | `"subrosa"` | `"thaum"` | `"praxis"` | `"mux"` | `"primus"`

### `CourtPhase`

One of: `"case_prompt"` | `"openings"` | `"witness_exam"` | `"evidence_reveal"` | `"closings"` | `"verdict_vote"` | `"sentence_vote"` | `"final_ruling"`

### `CourtRole`

One of: `"judge"` | `"prosecutor"` | `"defense"` | `"witness_1"` | `"witness_2"` | `"witness_3"` | `"bailiff"`

---

## SSE Event Contracts

Every SSE payload is a `CourtEvent`:

```ts
{
    id: string;
    sessionId: string;
    type: CourtEventType;
    at: string; // ISO 8601 timestamp
    payload: Record<string, unknown>;
}
```

### Event Types

| Type                      | When emitted                                                        | Key payload fields                                                          |
| ------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `snapshot`                | Immediately on SSE connect                                          | `session`, `turns`, `verdictVotes`, `sentenceVotes`, `recapTurnIds`         |
| `session_created`         | Session record inserted                                             | `sessionId`                                                                 |
| `session_started`         | Orchestration begins                                                | `sessionId`                                                                 |
| `phase_changed`           | Phase advances                                                      | `phase`, `durationMs`                                                       |
| `turn`                    | A new dialogue turn is stored                                       | `turn: CourtTurn`                                                           |
| `vote_updated`            | A vote is successfully cast                                         | `voteType`, `choice`, `verdictVotes`, `sentenceVotes`                       |
| `vote_closed`             | Transitioned away from a vote phase; includes frozen tally snapshot | `pollType`, `closedAt`, `votes`, `nextPhase`                                |
| `witness_response_capped` | Witness response was truncated due to caps                          | `turnId`, `speaker`, `phase`, `originalLength`, `truncatedLength`, `reason` |
| `judge_recap_emitted`     | Judge recap emitted during witness exam                             | `turnId`, `phase`, `cycleNumber`                                            |
| `analytics_event`         | Poll open/close lifecycle events                                    | `event`, `phase`                                                            |
| `moderation_action`       | Turn content was flagged and redacted                               | `speaker`, `reasons`                                                        |
| `vote_spam_blocked`       | Vote rejected due to rate limiting                                  | `ip`, `voteType`                                                            |
| `session_completed`       | Session reached `final_ruling` successfully                         | `sessionId`, `finalRuling`                                                  |
| `session_failed`          | Orchestration threw an unrecoverable error                          | `sessionId`, `reason`                                                       |
