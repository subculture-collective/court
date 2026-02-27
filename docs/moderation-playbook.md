# Moderation Playbook

This document describes the content moderation system and procedures for responding to incidents during live JuryRigged sessions.

---

## Overview

JuryRigged uses a layered moderation approach:

1. **Curated + screened inputs** — case prompts (operator or API-supplied) are screened with the moderation filter; unsafe topics are rejected and unsafe prompt-bank entries are skipped.
2. **LLM system prompt policy** — every agent prompt includes the Clean Courtroom Policy (see below).
3. **Automated content filter** — every generated turn is scanned before storage.
4. **Operator override** — phase controls and session termination are available via the API at any time.

---

## Clean Courtroom Policy

The following policy is injected into every LLM system prompt (source: `src/court/personas.ts`):

```
CLEAN COURTROOM POLICY:
- No slurs or hate speech
- No graphic/sexual violence
- No targeted harassment of real individuals or protected groups
- Keep tone comedic, absurd, and PG-13
- If unsafe territory appears, redirect with judge discipline and continue the scene
```

---

## Automated Content Filter

### What it detects

The filter (`src/moderation/content-filter.ts`) uses regular expression rules to detect five categories:

| Reason code      | Examples of what is matched                      |
| ---------------- | ------------------------------------------------ |
| `slur`           | Racial, ethnic, and homophobic slurs             |
| `hate_speech`    | Incitement phrases, genocide references          |
| `violence`       | Graphic violence and self-harm instructions      |
| `harassment`     | Doxxing references, swatting, directed self-harm |
| `sexual_content` | Explicit sexual language                         |

### What happens when content is flagged

1. The turn `dialogue` is replaced with:
    > `[The witness statement has been redacted by the court for decorum violations.]`
2. A `moderation_action` SSE event is emitted to all stream subscribers.
3. The objection count is incremented and a judge redirect line is inserted to steer the scene back on track.
4. If broadcast automation is enabled, a `moderation_alert` hook is triggered for the operator overlay.
5. A warning is written to the server log:

    ```
    [moderation] content flagged session=<id> speaker=<agentId> reasons=<code,code>
    ```

6. Orchestration continues normally with the sanitized text.

### Limitations

The pattern-based filter is a best-effort layer.
It will not catch all harmful outputs, especially novel phrasing or context-dependent content.
Operators should monitor live sessions and be prepared to intervene manually.

---

## Vote Spam Protection

The `VoteSpamGuard` (source: `src/moderation/vote-spam.ts`) limits voting per IP, per session, **per vote type** and detects duplicate/replayed submissions within a configurable window.

When a vote is blocked:

- The API returns HTTP 429 with `code` set to `VOTE_RATE_LIMITED` or `VOTE_DUPLICATE`.
- The response includes `reason` and `retryAfterMs` fields for client pacing.
- A `vote_spam_blocked` SSE event is emitted.
- A warning is written to the server log:

    ```
    [vote-spam] blocked ip=<ip> session=<id> reason=<reason>
    ```

Tune limits via environment variables (see `.env` / `.env.example`):

- `VOTE_SPAM_MAX_VOTES_PER_WINDOW`
- `VOTE_SPAM_WINDOW_MS`
- `VOTE_SPAM_DUPLICATE_WINDOW_MS`

---

## Operator Incident Procedures

### Scenario 1 — Repeated offensive outputs from an agent

**Symptoms:** `[moderation]` log entries repeating for the same session or speaker.

**Steps:**

1. If the session is ongoing, advance it to `final_ruling` to end the vote windows immediately:

    ```bash
    curl -s -X POST http://localhost:3001/api/court/sessions/<SESSION_ID>/phase \
      -H 'Content-Type: application/json' \
      -d '{"phase":"final_ruling"}'
    ```

2. If the content is still harmful after redaction, terminate the session by stopping the process or, for production deployments, kill the Docker service and restart clean.
3. Review the case prompt and revise it to remove ambiguous phrasing that may have elicited the output.
4. Do **not** add new pattern rules to the content filter without testing against the existing test suite (`src/moderation/content-filter.test.ts`).

### Scenario 2 — Session stuck / not advancing

**Symptoms:** Phase timer appears expired but the next phase has not started; no new SSE events.

**Steps:**

1. Manually set the next expected phase:

    ```bash
    curl -s -X POST http://localhost:3001/api/court/sessions/<SESSION_ID>/phase \
      -H 'Content-Type: application/json' \
      -d '{"phase":"<next_phase>"}'
    ```

2. Check server logs for errors (LLM timeout, Postgres connectivity).
3. If the orchestrator threw and marked the session `failed`, create a new session with the same parameters.

### Scenario 3 — LLM producing out-of-character or off-topic content

**Symptoms:** Agent dialogue is off-topic, breaks character, or contains LLM meta-commentary.

**Steps:**

1. This is expected occasionally — the automated `sanitizeDialogue` step strips markdown and XML artefacts.
2. If quality degrades severely, consider switching to a different `LLM_MODEL` in `.env` and restarting the server.
3. The mock mode (`OPENROUTER_API_KEY` unset) is always available as a stable fallback for demos and testing.

### Scenario 4 — Vote spam / poll manipulation

**Symptoms:** `[vote-spam]` log entries from a single IP; vote tallies look abnormal.

**Steps:**

1. The guard blocks further votes automatically after the threshold is exceeded.
2. If the IP bypass is suspected (proxied clients), reduce `maxVotesPerWindow` and redeploy.
3. For extreme cases, disable the `/api/court/sessions/:id/vote` endpoint by proxying requests through an authentication layer or removing public access.

### Scenario 5 — Session recovery after crash

**Symptoms:** Server restarted; sessions were in `running` state.

**Steps:**

1. On startup, the server automatically calls `store.recoverInterruptedSessions()` and re-starts orchestration for each interrupted session.
2. Verify recovery by querying `GET /api/court/sessions` and confirming the session status transitions from `running` back to `completed`.
3. If the session is stuck in `running` after restart with in-memory storage (non-Postgres), session state has been lost. Create a new session.

---

## Curating Safe Case Prompts

Case prompts are provided by the operator when creating a session.
Guidelines:

- Keep prompts **absurd and fictional** (no real individuals, brands, or events).
- Avoid topics involving protected characteristics (race, religion, gender, etc.) unless the angle is purely comedic and punches up rather than down.
- Test new prompts in mock mode before going live.
- Maintain a reviewed prompt library; only use prompts from that library in production.

---

## Curating Sentence Options

Sentence options are provided at session creation.
Guidelines:

- All options should be **clearly fictional and comedic** (no real-world punishments or humiliating personal content).
- Keep the list between 3 and 8 options for readability.
- Examples of safe options:
    - "Banished to the shadow realm"
    - "Mandatory apology haikus"
    - "Ethics training hosted by a raccoon"
    - "Community service in the meme archives"
    - "Ukulele ankle-monitor probation"
