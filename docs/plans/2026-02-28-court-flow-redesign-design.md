# Design: Court Flow Redesign

**Date:** 2026-02-28
**Status:** Approved

## Overview

Redesign the witness examination phase and supporting systems to produce more structured, dramatically satisfying trial proceedings. Fixes the current judge-opens-questioning bug, adds variable-length exchanges via a script builder, introduces probability-based random events, implements layered LLM-driven objections, increases pacing delays for Twitch viewing, and replaces brittle fixed mock dialogue with versatile fallback lines.

## Section 1: Witness Exam Restructure

Replace the current `runWitnessExamPhase` flow (judge asks → witness → prosecutor → defense) with a proper direct/cross structure.

**Per witness:**

```
1. Bailiff announces: "[DisplayName], [role/occupation], please take the stand."

2. Direct examination — 3–7 rounds (drawn by script builder at phase start):
   Each round:
   ├─ Prosecutor asks a question
   ├─ Witness answers
   ├─ [Random event check — can fire here]
   ├─ [Objection check: defense organic + classifier]
   │   └─ Judge ALWAYS rules if objection fired (sustain/overrule + 1 sentence)
   └─ [Judge interrupt: 10–12% chance — clarification or jury instruction; skips objection slot]

3. Cross-examination — 2–5 rounds (drawn by script builder at phase start):
   Each round:
   ├─ Defense asks a question
   ├─ Witness answers
   ├─ [Random event check — can fire here]
   ├─ [Objection check: prosecutor organic + classifier]
   │   └─ Judge ALWAYS rules if objection fired (sustain/overrule + 1 sentence)
   └─ [Judge interrupt: 10–12% chance — clarification or jury instruction; skips objection slot]
```

**Rules:**
- Judge never opens witness questioning
- Bailiff introduces each witness by `displayName` (from `AgentConfig`)
- No objection check after any judge turn (interrupt or ruling)
- Judge always rules on any detected objection

## Section 2: Script Builder

Called once at the start of `runWitnessExamPhase`. Produces a pre-drawn plan for all witnesses so the structure is determined up-front and logged.

```ts
interface WitnessScript {
    directRounds: number;  // drawn: 3–7
    crossRounds: number;   // drawn: 2–5
}

function buildWitnessScripts(witnessCount: number): WitnessScript[]
```

Each witness gets independently rolled values. The full plan is logged at phase start so the session structure is visible in server output.

## Section 3: Random Events

A catalogue of named events checked once per round after the witness answer. Each has a probability and a designated speaker role. Only one event fires per round.

| Event ID | Probability | Speaker | Description |
|---|---|---|---|
| `witness_outburst` | 12% | witness | Witness goes off-script with an emotional or bizarre interjection |
| `dramatic_revelation` | 8% | witness | Witness blurts something that reframes the whole case |
| `bailiff_interruption` | 8% | bailiff | Bailiff intervenes due to courtroom disorder |
| `gallery_disruption` | 6% | judge | Judge restores order after audience chaos |
| `evidence_challenged` | 10% | prosecutor or defense | Opposing counsel challenges the evidentiary basis of a question |

Events generate one extra `generateBudgetedTurn` with a role-appropriate `userInstruction`, then proceedings resume normally. Events fire during both direct and cross rounds.

## Section 4: Objections (Layered — Option C)

Two mechanisms work in tandem. No objection check fires after any judge turn.

### Organic (B) — attorney self-trigger
The opposing attorney's system prompt during witness exam includes:

> *"If the preceding dialogue gives you clear legal grounds to object — hearsay, speculation, badgering, or a leading question — begin your turn with `OBJECTION: [type]`. Otherwise proceed normally with your next question or rebuttal."*

The generated turn either becomes an objection or normal dialogue; no extra API call required.

### Classifier (A) — safety net
After each attorney question and witness answer (not after judge turns), a lightweight secondary LLM call:

> *"Does the following dialogue give opposing counsel grounds to object? Respond only: `yes: <type>` or `no`."*

If the classifier returns `yes` and organic did not already fire an objection this round, the opposing attorney generates an objection turn.

### Judge ruling
Always generated when an objection is detected (from either mechanism). One turn:
- Speaker: judge
- `userInstruction`: *"Rule on this objection: sustained or overruled. One sentence, then move proceedings forward."*

## Section 5: Pacing

All delays increased for comfortable Twitch viewing pace.

| Constant | Before | After |
|---|---|---|
| `witnessBetweenTurns` | 600 ms | 2,500 ms |
| `witnessBetweenCycles` | 800 ms | 3,000 ms |
| `openingBetweenSides` | 900 ms | 2,000 ms |
| `casePromptAfterCue` | 1,200 ms | 2,000 ms |
| `recapLeadIn` | 600 ms | 1,500 ms |
| `closingBetweenSides` | 800 ms | 2,000 ms |

## Section 6: Mock Dialogue Variety

`mockReply()` in `src/llm/client.ts` is rewritten to select randomly from 5+ strings per category. All lines are intentionally generic — they must work for any case topic without referencing specific facts. Absurd tone is preserved; specificity is not.

Categories and intent:
- **opening/statement** — broad declarations about evidence, truth, chaos
- **witness/testimony** — vague sensory observations that could apply to any incident
- **closing** — philosophical summations about justice and human nature
- **ruling/verdict** — judicial pronouncements on guilt, ambiguity, or dramatic irony
- **default** — catch-all procedural filler that sounds plausible in any phase

## Files Changed

| File | Change |
|---|---|
| `src/court/phases/session-flow.ts` | Rewrite `runWitnessExamPhase`; update `PAUSE_MS` constants |
| `src/court/phases/witness-script.ts` | New — `buildWitnessScripts()`, `WitnessScript` type |
| `src/court/phases/random-events.ts` | New — event catalogue, `checkRandomEvent()` |
| `src/court/phases/objections.ts` | New — `handleObjectionRound()` (organic flag check + classifier call + judge ruling) |
| `src/llm/client.ts` | Rewrite `mockReply()` with randomised versatile lines |
| Test files | New unit tests for script builder, random events, objection classifier |

## Out of Scope

- Twitch channel-points objection trigger — future work
- Overlay/renderer visual changes (gavel slam, objection stamp) — separate pass
- Changing `CourtPhase` values or session state shape
