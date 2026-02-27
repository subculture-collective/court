# JuryRigged ⚖️🎭

*Roleplay comedy + audience verdict game show format*

## One-liner

AI lawyers argue absurd cases, AI witnesses improv testimony, and the audience serves as jury—delivering a verdict and voting on a ridiculous sentence. A judge AI issues the final ruling with dramatic (and silly) flair.

---

## Core Concept

A structured, turn-based “courtroom show” designed for streaming: instantly legible to new viewers, naturally clip-friendly, and tolerant of platform latency.

**Hook:** everyone sticks around for the **verdict moment** (and the sentencing poll right after).

---

## Roles

### AI agents

- **Judge**: controls pacing, sustains tone, delivers summary + final ruling/sentence
- **Prosecutor**: argues “guilty / liable” (or equivalent), cross-examines
- **Defense**: argues “not guilty / not liable,” cross-examines
- **Witnesses (1–3)**: improvised testimony (characterful, constrained, punchy)

### System host (automated)

- **Bailiff / timekeeper**: phase timers, announcements, stingers, poll triggers, scene transitions

### Viewers (jury)

- Vote on **verdict**
- Vote on **sentence** (from curated options)

---

## Round Flow & Automation

1. **Case prompt selected**
2. **Opening statements (timed)**
3. **Witness examination (turn-based Q/A)**
4. **Optional “evidence card” reveal**
5. **Closing arguments**
6. **Jury verdict vote**
7. **Jury sentence vote** (curated outcomes)
8. **Judge final ruling + comedic wrap-up**

**Automation emphasis**

- Hard phase boundaries + strict turn enforcement
- Timers per segment + caps per response
- Auto-summaries to prevent runaway monologues and keep newcomers oriented

---

## Voting / Decision System

### Verdict poll

- Criminal style: **Guilty / Not Guilty**
- Civil style: **Liable / Not Liable**

### Sentencing poll (pre-enumerated outcomes)

Examples:

- Community service
- Banished to the shadow realm
- Forced to write apology haikus
- Mandatory “ethics training” hosted by a raccoon
- Probation with an ankle monitor that only plays ukulele covers

---

## UI/UX (Overlay + On-screen Systems)

- Courtroom overlay: **bench + counsel tables**
- **Active-speaker indicator**
- **Evidence cards carousel**
- **Objection counter** (recurring bit + pacing feedback)
- **Jury vote bars** (verdict + sentence)
- **Live captions / transcript**
- “Case file” sidebar:
  - Charges / claims
  - Constraints (tone policy, no-go topics)
  - Current phase timer

---

## Integrations / APIs

- **Polls + TTS** (announcer moments, verdict, recap)
- Overlay framework: **NodeCG** or **StreamElements**
- Optional: **OBS WebSocket** for automatic scene changes
- Optional: soundboard stingers triggered automatically:
  - “Order in the court!”
  - “Sustained!”
  - “Overruled!”
  - “Mistrial!”

---

## Latency Tolerance

Designed to be naturally robust with stream delay:

- Turn-based segments
- 20–40s vote windows
- Phase timers make pacing predictable even when chat is laggy

---

## Safety & Moderation Policy

**Clean Courtroom Policy**

- Curated case prompts (pre-approved)
- Curated sentence options (pre-approved)
- Guardrails for witnesses (no slurs, no graphic content, no harassment targets)

---

## Failure Modes & Mitigation

### Offensive content risk

- Use curated prompts + strict policy filters
- Immediate “Judge redirects” + bailiff stinger (“Order!”) + swap witness

### Runaway monologues

- Hard time/token caps
- Auto-summarization (judge recap) on schedule:
  - **Judge summary every 2 questions**
  - **Witness answers capped** (time + token)

### Repetitive humor / fatigue

- Prompt bank rotation + style constraints per episode
- Rotate “case genres”:
  - Absurd civil suit
  - Cosmic crime
  - Workplace tribunal
  - Fantasy court

### Chaotic pacing

- Strict turn enforcement + phase timers
- Bailiff announces transitions and locks phases

---

## Complexity

**Medium**

- Multi-agent turn-taking + overlays + timers
- Lower secrecy/state complexity than deduction games
- Minimal persistent state requirements (good for reliability)

---

## Predicted Audience Retention: High

### Why it works

- Comedy + structure = drop-in comprehension within ~20 seconds
- “Verdict moment” is a clear retention hook (people stay for vote + sentence)
- Hard phase boundaries create natural pacing and predictability

### Retention risks

- Humor fatigue (“objection!” beats get stale)
- Witness segments can drag if witnesses ramble

### Fixes

- Rotate case genres
- Hard caps + periodic judge summaries
- Add recurring bits:
  - Objection Counter
  - Contempt Meter
  - Evidence Wheel

---

## Monetization (Clean, Non-Gross)

### Strong, non-extractive levers

- **Verdict vote multipliers (cosmetic only)**
  Subs/bits unlock courtroom effects:
  - gavel slam SFX
  - confetti
  - “Order in court” stinger
  *(Not pay-to-win outcomes.)*

- **Patreon perk**
  Patrons submit case prompts into a curated queue
  (still moderated/approved)

- **Sponsor fit**
  Brands like “game show energy” adjacency:
  - structured segments
  - predictable moments
  - clip-friendly reveals and verdicts

---

## Product Strategy: What to Ship First 🛠️

### Architecture Decision Record

See [docs/ADR-001-juryrigged-architecture.md](docs/ADR-001-juryrigged-architecture.md) for runtime boundaries, module ownership, phase-state contracts, and API/SSE/persistence contracts.

### Phase 1 — JuryRigged = “Orchestration/Overlay Engine Test”

Proves:

- turn-taking
- polling
- TTS cues
- scene switching
- safety filters
- overlays
- transcript capture

Produces clips immediately.

### Phase 2 — Co-op Cipher Break (stateful progress UI)

Proves:

- timers
- progress bar
- decision history
- hint escalation

### Phase 3 — Writers’ Room (persistence + recap pipeline)

Proves:

- story bible
- canon registry
- branch pruning

### Phase 4 — Ghost in the Chat (season finale format)

Uses everything:

- plus secrecy + evidence logic

**Thesis:** build a reliable game show OS first, then layer ambition on top.

---

## Extra Levers (High Impact)

- **Onboarding/catch-up panel** (15–30s): “Here’s the case so far…”
- **Round length discipline**: retention loves predictable cadence
- **Soft participation**: lurkers can vote without typing commands
- **Clip triggers**: guarantee 1–2 clip moments per round
  (verdict, evidence reveal, twist lock)
- **Failure theatrics**: “mistrial” / “narrator emergency recap” turns bugs into content

---

## Cost Model (Runtime Expense Knobs) 💸

### Primary drivers

- **LLM tokens per minute**
  - multi-agent formats multiply tokens quickly
- **Summaries**
  - expensive but necessary; do once per phase
- **TTS minutes**
  - keep TTS for “announcer moments,” verdicts, recaps (not constant narration)
- **Image generation**
  - biggest cost spike if frequent
  - use event-based: episode cover, key evidence art, final verdict tableau
- **State persistence + logging**
  - cheap in dollars, expensive in correctness (bugs kill trust)

### Relative runtime cost (low → high)

JuryRigged (medium) < Cipher (medium) < Writers’ Room (medium-high) ≈ Ghost (medium-high)

---
