# Design: Ace Attorney Character Agents (Path C)

**Date:** 2026-02-28
**Status:** Approved

## Overview

Replace the six abstract agents (`primus`, `chora`, `subrosa`, `thaum`, `praxis`, `mux`) with thirteen Ace Attorney characters as first-class agents. Each character has a handwritten voice persona, role archetypes, and a pointer to their transcript directory for runtime dialogue sampling.

## Section 1: Character Roster & AgentConfig Shape

### AgentId

```ts
export type AgentId =
    | 'phoenix'
    | 'edgeworth'
    | 'mia'
    | 'franziska'
    | 'godot'
    | 'gumshoe'
    | 'maya'
    | 'apollo'
    | 'athena'
    | 'ema'
    | 'klavier'
    | 'blackquill'
    | 'trucy';
```

### AgentConfig (additions)

```ts
export interface AgentConfig {
    id: AgentId;
    displayName: string;
    role: string;
    description: string;
    color: string;
    voicePersona: string;       // handwritten 3-5 sentence voice description
    roleArchetypes: CourtRole[]; // ordered preferred roles for archetype pool drawing
    transcriptDir: string;      // folder name under AA-transcripts/
}
```

### Role Archetype Assignments

| Character        | AgentId      | Role Archetypes              |
|-----------------|-------------|------------------------------|
| Phoenix Wright   | `phoenix`    | defense, witness             |
| Miles Edgeworth  | `edgeworth`  | prosecutor, judge            |
| Mia Fey          | `mia`        | defense, judge               |
| Franziska von Karma | `franziska` | prosecutor, bailiff        |
| Godot            | `godot`      | judge, prosecutor            |
| Dick Gumshoe     | `gumshoe`    | bailiff, witness             |
| Maya Fey         | `maya`       | witness, defense             |
| Apollo Justice   | `apollo`     | defense, prosecutor          |
| Athena Cykes     | `athena`     | defense, witness             |
| Ema Skye         | `ema`        | witness, bailiff             |
| Klavier Gavin    | `klavier`    | prosecutor, witness          |
| Simon Blackquill | `blackquill` | prosecutor, judge            |
| Trucy Wright     | `trucy`      | witness                      |

## Section 2: Session Casting via Archetype Pools

`assignCourtRoles` is rewritten to auto-cast a 7-character session from the full 13-character roster.

### Algorithm

1. Build five pools from all 13 characters by iterating their `roleArchetypes`: `judgePool`, `prosecutorPool`, `defensePool`, `witnessPool`, `bailiffPool`. Each character appears in multiple pools.
2. Shuffle each pool (Fisher-Yates).
3. Draw without replacement: pick 1 judge, 1 prosecutor, 1 defense, 1 bailiff (skipping already-selected characters).
4. Pick up to 3 witnesses from the witness pool, skipping already-used characters.
5. Return the 7 selected characters as `participants` + `roleAssignments`.

### API Compatibility

- The `/start` endpoint no longer requires a `participants` body field — it is auto-cast.
- An optional `participants` override is still accepted for manual casting (e.g. Twitch commands specifying characters by name).

## Section 3: Runtime Transcript Sampler

**New file:** `src/court/transcript-sampler.ts`

A singleton module with lazy-load caching:

- On first `sample()` call for a character, reads all `.txt` files from `<TRANSCRIPT_DIR>/<transcriptDir>/`
- Splits content by newline, filters blank lines and pure-parenthetical stage directions (lines matching `/^\s*\(.*\)\s*$/`)
- Caches the full cleaned line array in a `Map<AgentId, string[]>`
- Subsequent calls are pure in-memory array slices — no repeated I/O
- `sample(agentId: AgentId, n: number): Promise<string[]>` returns `n` random lines
- Root path configured via `TRANSCRIPT_DIR` env var, defaulting to `./AA-transcripts`

## Section 4: Prompt Integration

`buildCourtSystemPrompt` becomes `async`.

Before assembling the prompt string, it calls `transcriptSampler.sample(agentId, 4)`. The injected voice block:

```
Character voice:
[voicePersona]

Speak like this character — examples from their dialogue:
- "[sampled line]"
- "[sampled line]"
- "[sampled line]"
- "[sampled line]"
```

This block is injected after the role prompt and before the case topic.

## Files Changed

| File | Change |
|------|--------|
| `src/types.ts` | Replace `AgentId` union; add `voicePersona`, `roleArchetypes`, `transcriptDir` to `AgentConfig` |
| `src/agents.ts` | Replace 6 abstract configs with 13 AA character configs (with handwritten personas) |
| `src/court/roles.ts` | Rewrite `assignCourtRoles` to use archetype pool drawing; export `castSession` helper |
| `src/court/transcript-sampler.ts` | New — singleton lazy-load cache + `sample()` function |
| `src/court/personas.ts` | Make `buildCourtSystemPrompt` async; inject `voicePersona` + transcript samples |
| `src/court/orchestrator.ts` | Await async `buildCourtSystemPrompt`; update session init to use auto-cast |
| `src/server.ts` | Remove `participants` as required field; accept optional override |
| Test files | Update hardcoded agent IDs (`primus`, `chora`, etc.) throughout |

## Out of Scope

- CourtRecord network graph data or generated case text — not integrated
- Changing the overlay/renderer character art — visual layer unchanged
- Adding new `CourtRole` types — witness slots stay at `witness_1`–`witness_3`
