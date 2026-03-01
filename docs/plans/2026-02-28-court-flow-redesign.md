# Court Flow Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure witness examination to follow proper direct/cross order, add a script builder for variable exchange counts, inject probability-based random events, implement layered LLM-driven objections, increase pacing delays, and replace fixed mock dialogue with versatile randomised fallbacks.

**Architecture:** Six independent modules (Tasks 1–5) are integrated into a rewritten `runWitnessExamPhase` in Task 6. Each new module lives in `src/court/phases/` and is independently testable. Random events and objection detection each accept an injectable `rng` parameter so they are deterministic in tests.

**Tech Stack:** TypeScript ESM, `node --import tsx --test` test runner (`npm test`), Node built-in `node:test` / `node:assert/strict`.

---

### Task 1: Mock Dialogue Variety

Fix the brittle single-string mock fallback that repeats identical lines on every rate-limited call. Each category gets 5–6 generic lines broad enough to fit any case topic.

**Files:**
- Modify: `src/llm/client.ts:54-68` (the `mockReply` function)
- Modify: `src/llm/client.test.ts:83` (loosen the "Ladies and gentlemen" assertion)

**Step 1: Update the test assertion first**

Open `src/llm/client.test.ts`. Line 83 currently reads:

```ts
assert.match(output, /Ladies and gentlemen/i);
```

Replace it with:

```ts
assert.ok(output.length > 0, 'Expected non-empty fallback text when model content is empty');
```

**Step 2: Run the existing tests to confirm they pass**

```bash
npm test
```

Expected: all tests pass (the assertion is now looser, nothing broke).

**Step 3: Replace `mockReply` in `src/llm/client.ts`**

Find the `mockReply` function (lines 54–68) and replace it entirely:

```ts
const MOCK_LINES: Record<string, string[]> = {
    'opening|statement': [
        'The facts in this case are stranger than fiction, and the fiction is not great either. We intend to prove every last strange bit of it.',
        'The evidence will speak for itself — loudly, incoherently, and with unusual conviction.',
        'What you are about to hear is either a crime or a misunderstanding of historic proportions. Possibly both.',
        'The prosecution will demonstrate, beyond reasonable doubt, that something happened. The exact nature of that something will become abundantly clear.',
        'We ask only that you keep an open mind — and perhaps a strong stomach.',
        'The defense maintains our client is innocent, and also maintains several other positions that will be revealed at the worst possible moment.',
    ],
    'witness|testimony|cross': [
        'I can state with certainty that I observed something. The details are fuzzy, but the certainty is very high.',
        'At the time I thought nothing of it. In retrospect I should have thought quite a lot of it.',
        'I was present. I was observing. What I observed is what you might call difficult to categorize.',
        'Everything I am about to say is accurate to the best of my recollection, which is doing its best.',
        'There was an incident. I was adjacent to it. My proximity was noted by several parties, including myself.',
        'I remember it clearly: there was a moment, and I was in it. The moment was notable. That is my testimony.',
    ],
    'closing': [
        'The evidence has spoken. It has spoken at length, somewhat repetitively, and with great emotional commitment.',
        'We ask you to weigh the facts — not the feelings, not the drama, not the seventeen things that went unexpectedly sideways.',
        'One truth remains: something happened, someone did it, and this court must decide what happens next.',
        'The defense rests — on the bedrock of reasonable doubt and a sincere belief that this has all gone far enough.',
        'Justice demands a verdict. Logic demands clarity. The circumstances demand a stiff drink and a long lie-down.',
        'I leave you with this: whatever you decide, decide it with the full weight of your conscience and at least two of your five senses.',
    ],
    'ruling|verdict': [
        'On the matter before this court, I have considered the evidence, the arguments, and my own rising blood pressure. The verdict stands.',
        'This court finds the evidence compelling in ways that are difficult to articulate but impossible to ignore.',
        'I have heard enough. The court has heard enough. The court reporter has definitely heard enough.',
        'The ruling of this court is final. The chaos leading to it was anything but. Proceedings are concluded.',
        'After careful deliberation — I wrote things down — this court delivers its judgment.',
        'This court has seen many things. Most of them were other cases. Nevertheless, a verdict is reached.',
    ],
};

const MOCK_LINES_DEFAULT = [
    'Noted. The court acknowledges the point and invites us all to move forward with cautious optimism.',
    'Order. We proceed. Whatever just happened, we proceed from it.',
    'The record reflects the current state of affairs. The current state of affairs is noted.',
    'This court will take that under advisement. We advise ourselves to continue.',
    'The relevant determination having been made, proceedings continue.',
    'So noted. The court is, as always, moving forward.',
];

function pickRandom<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)]!;
}

function mockReply(prompt: string): string {
    for (const [pattern, lines] of Object.entries(MOCK_LINES)) {
        if (new RegExp(pattern, 'i').test(prompt)) {
            return pickRandom(lines);
        }
    }
    return pickRandom(MOCK_LINES_DEFAULT);
}
```

**Step 4: Run the tests again**

```bash
npm test
```

Expected: all tests pass.

**Step 5: Commit**

```bash
git add src/llm/client.ts src/llm/client.test.ts
git commit -m "feat: randomise mock dialogue fallback with versatile category lines"
```

---

### Task 2: Pacing Constants

Increase all inter-turn delays for comfortable Twitch viewing pace.

**Files:**
- Modify: `src/court/phases/session-flow.ts:25-32`

**Step 1: Update `PAUSE_MS` in `src/court/phases/session-flow.ts`**

Find the `PAUSE_MS` object (lines 25–32) and replace:

```ts
const PAUSE_MS = {
    casePromptAfterCue: 2_000,
    openingBetweenSides: 2_000,
    witnessBetweenTurns: 2_500,
    witnessBetweenCycles: 3_000,
    recapLeadIn: 1_500,
    closingBetweenSides: 2_000,
} as const;
```

**Step 2: Run tests**

```bash
npm test
```

Expected: all tests pass (pacing constants are not directly tested).

**Step 3: Commit**

```bash
git add src/court/phases/session-flow.ts
git commit -m "feat: increase pacing delays for Twitch viewing comfort"
```

---

### Task 3: Witness Script Builder

A pure function that draws variable round counts per witness at phase start, keeping structure deterministic once drawn.

**Files:**
- Create: `src/court/phases/witness-script.ts`
- Create: `src/court/phases/witness-script.test.ts`

**Step 1: Write the failing test**

Create `src/court/phases/witness-script.test.ts`:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildWitnessScripts } from './witness-script.js';

describe('buildWitnessScripts', () => {
    it('returns one script per witness', () => {
        const scripts = buildWitnessScripts(3);
        assert.equal(scripts.length, 3);
    });

    it('direct rounds are in range 3–7', () => {
        for (let i = 0; i < 50; i++) {
            const [script] = buildWitnessScripts(1);
            assert.ok(script!.directRounds >= 3 && script!.directRounds <= 7,
                `directRounds out of range: ${script!.directRounds}`);
        }
    });

    it('cross rounds are in range 2–5', () => {
        for (let i = 0; i < 50; i++) {
            const [script] = buildWitnessScripts(1);
            assert.ok(script!.crossRounds >= 2 && script!.crossRounds <= 5,
                `crossRounds out of range: ${script!.crossRounds}`);
        }
    });

    it('witnesses get independent rolls', () => {
        const scripts = buildWitnessScripts(20);
        const directCounts = new Set(scripts.map(s => s.directRounds));
        // With 20 witnesses and 5 possible values (3-7), very likely to see at least 2 distinct values
        assert.ok(directCounts.size > 1, 'All 20 witnesses got identical directRounds — extremely unlikely if random');
    });

    it('returns empty array for 0 witnesses', () => {
        assert.deepEqual(buildWitnessScripts(0), []);
    });
});
```

**Step 2: Run tests to confirm failure**

```bash
npm test
```

Expected: FAIL — "Cannot find module './witness-script.js'"

**Step 3: Implement `src/court/phases/witness-script.ts`**

```ts
export interface WitnessScript {
    directRounds: number; // 3–7
    crossRounds: number;  // 2–5
}

export function buildWitnessScripts(witnessCount: number): WitnessScript[] {
    return Array.from({ length: witnessCount }, () => ({
        directRounds: Math.floor(Math.random() * 5) + 3,
        crossRounds: Math.floor(Math.random() * 4) + 2,
    }));
}
```

**Step 4: Run tests to confirm pass**

```bash
npm test
```

Expected: all tests pass.

**Step 5: Commit**

```bash
git add src/court/phases/witness-script.ts src/court/phases/witness-script.test.ts
git commit -m "feat: witness script builder draws variable round counts per witness"
```

---

### Task 4: Random Events

A catalogue of named courtroom events with probability weights. Checked once per round after the witness answer. Only one event fires per round.

**Files:**
- Create: `src/court/phases/random-events.ts`
- Create: `src/court/phases/random-events.test.ts`

**Step 1: Write the failing test**

Create `src/court/phases/random-events.test.ts`:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkRandomEvent, RANDOM_EVENTS } from './random-events.js';

describe('checkRandomEvent', () => {
    it('returns null when rng always returns 1.0 (above all probabilities)', () => {
        const result = checkRandomEvent(() => 1.0);
        assert.equal(result, null);
    });

    it('returns an event when rng always returns 0.0 (below all probabilities)', () => {
        const result = checkRandomEvent(() => 0.0);
        assert.ok(result !== null);
        assert.ok(typeof result.id === 'string');
        assert.ok(typeof result.userInstruction === 'string');
    });

    it('returns at most one event per call', () => {
        let callCount = 0;
        const rng = () => {
            callCount++;
            return 0.0; // fires everything
        };
        const result = checkRandomEvent(rng);
        // Result is a single event or null — not an array
        assert.ok(result === null || typeof result.id === 'string');
    });

    it('all RANDOM_EVENTS have required fields', () => {
        for (const event of RANDOM_EVENTS) {
            assert.ok(typeof event.id === 'string', `event.id missing: ${JSON.stringify(event)}`);
            assert.ok(typeof event.probability === 'number');
            assert.ok(event.probability > 0 && event.probability < 1);
            assert.ok(typeof event.speaker === 'string');
            assert.ok(typeof event.userInstruction === 'string');
        }
    });
});
```

**Step 2: Run tests to confirm failure**

```bash
npm test
```

Expected: FAIL — "Cannot find module './random-events.js'"

**Step 3: Implement `src/court/phases/random-events.ts`**

```ts
export type EventSpeaker = 'witness' | 'bailiff' | 'judge' | 'opposing_counsel';

export interface RandomEvent {
    id: string;
    probability: number;
    speaker: EventSpeaker;
    userInstruction: string;
}

export const RANDOM_EVENTS: RandomEvent[] = [
    {
        id: 'witness_outburst',
        probability: 0.12,
        speaker: 'witness',
        userInstruction:
            'Have an emotional or bizarre outburst relevant to the case. Stay in character but go off-script in an unexpected way that reveals something about your relationship to the events.',
    },
    {
        id: 'dramatic_revelation',
        probability: 0.08,
        speaker: 'witness',
        userInstruction:
            'Blurt out an unexpected detail that reframes the entire case. Make it dramatic, specific to the case topic, and something neither side was expecting.',
    },
    {
        id: 'bailiff_interruption',
        probability: 0.08,
        speaker: 'bailiff',
        userInstruction:
            'Briefly interrupt proceedings to address a minor courtroom disturbance. Keep it short, procedural, and mildly absurd.',
    },
    {
        id: 'gallery_disruption',
        probability: 0.06,
        speaker: 'judge',
        userInstruction:
            'Restore order after the public gallery disrupts proceedings. Be authoritative and slightly exasperated. One or two sentences.',
    },
    {
        id: 'evidence_challenged',
        probability: 0.10,
        speaker: 'opposing_counsel',
        userInstruction:
            'Challenge the evidentiary basis of the preceding question or answer. Be specific about what you are challenging and why it is inadmissible or misleading.',
    },
];

/**
 * Checks whether a random event fires this round.
 * Accepts an injectable `rng` for deterministic testing.
 * Returns at most one event; returns null if none fire.
 */
export function checkRandomEvent(rng: () => number = Math.random): RandomEvent | null {
    // Shuffle catalogue so higher-probability events don't always win on ties
    const shuffled = [...RANDOM_EVENTS].sort(() => rng() - 0.5);
    for (const event of shuffled) {
        if (rng() < event.probability) {
            return event;
        }
    }
    return null;
}
```

**Step 4: Run tests to confirm pass**

```bash
npm test
```

Expected: all tests pass.

**Step 5: Commit**

```bash
git add src/court/phases/random-events.ts src/court/phases/random-events.test.ts
git commit -m "feat: random event catalogue with injectable rng for deterministic testing"
```

---

### Task 5: Objection Detection and Handling

Two-layer objection system: organic self-trigger detection (string parse, zero cost) and a lightweight LLM classifier call as safety net. Judge always rules when an objection is detected.

**Files:**
- Create: `src/court/phases/objections.ts`
- Create: `src/court/phases/objections.test.ts`

**Step 1: Write the failing tests**

Create `src/court/phases/objections.test.ts`:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectOrganicObjection, parseClassifierResponse } from './objections.js';

describe('detectOrganicObjection', () => {
    it('detects OBJECTION: at start of dialogue', () => {
        const result = detectOrganicObjection('OBJECTION: hearsay. That is inadmissible.');
        assert.equal(result, 'hearsay. That is inadmissible.');
    });

    it('is case-insensitive', () => {
        const result = detectOrganicObjection('Objection: leading question.');
        assert.equal(result, 'leading question.');
    });

    it('returns null when dialogue does not start with OBJECTION:', () => {
        assert.equal(detectOrganicObjection('I strongly disagree with that characterisation.'), null);
    });

    it('returns null for empty string', () => {
        assert.equal(detectOrganicObjection(''), null);
    });

    it('does not match OBJECTION mid-sentence', () => {
        assert.equal(detectOrganicObjection('Counsel raises an OBJECTION: hearsay.'), null);
    });
});

describe('parseClassifierResponse', () => {
    it('returns objection type for yes: response', () => {
        assert.equal(parseClassifierResponse('yes: hearsay'), 'hearsay');
    });

    it('is case-insensitive', () => {
        assert.equal(parseClassifierResponse('Yes: Speculation'), 'Speculation');
    });

    it('returns null for no', () => {
        assert.equal(parseClassifierResponse('no'), null);
    });

    it('returns null for empty string', () => {
        assert.equal(parseClassifierResponse(''), null);
    });
});
```

**Step 2: Run tests to confirm failure**

```bash
npm test
```

Expected: FAIL — "Cannot find module './objections.js'"

**Step 3: Implement `src/court/phases/objections.ts`**

```ts
import type { AgentId, CourtRole, CourtSession } from '../../types.js';
import type { CourtSessionStore } from '../../store/session-store.js';
import { llmGenerate } from '../../llm/client.js';
import type { GenerateBudgetedTurn } from './session-flow.js';

/**
 * Checks if the attorney self-triggered an objection by beginning dialogue with "OBJECTION:".
 * Returns the text after "OBJECTION:" or null.
 */
export function detectOrganicObjection(dialogue: string): string | null {
    const match = dialogue.match(/^OBJECTION:\s*(.+)/i);
    return match ? match[1].trim() : null;
}

/**
 * Parses the raw response from the objection classifier LLM call.
 * Returns the objection type string, or null if the model said no.
 */
export function parseClassifierResponse(text: string): string | null {
    const match = text.match(/^yes:\s*(.+)/i);
    return match ? match[1].trim() : null;
}

/**
 * Calls the LLM as a lightweight classifier to check whether dialogue
 * gives opposing counsel legal grounds to object.
 */
async function runObjectionClassifier(dialogue: string): Promise<string | null> {
    const response = await llmGenerate({
        messages: [
            {
                role: 'user',
                content: `Does the following courtroom dialogue give opposing counsel clear legal grounds to object — hearsay, speculation, badgering, or a leading question? Reply only: yes: <type> or no.\n\n"${dialogue}"`,
            },
        ],
        temperature: 0.1,
        maxTokens: 15,
    });
    return parseClassifierResponse(response);
}

export interface ObjectionRoundInput {
    dialogue: string;
    objectingAgentId: AgentId;
    objectingRole: CourtRole;
    judgeAgentId: AgentId;
    generateBudgetedTurn: GenerateBudgetedTurn;
    store: CourtSessionStore;
    session: CourtSession;
    pause: (ms: number) => Promise<void>;
}

/**
 * Runs the two-layer objection check for one round.
 * 1. Check if the attorney organically self-triggered (dialogue starts with OBJECTION:).
 * 2. If not, run the classifier.
 * 3. If either fires, and organic did NOT already produce the turn, generate an objection turn.
 * 4. Judge ALWAYS rules after any objection.
 */
export async function handleObjectionRound(input: ObjectionRoundInput): Promise<void> {
    const organic = detectOrganicObjection(input.dialogue);
    let objectionType = organic;

    if (!objectionType) {
        objectionType = await runObjectionClassifier(input.dialogue);
    }

    if (!objectionType) return;

    // Only generate the attorney objection turn if it was NOT already part of their dialogue
    if (!organic) {
        await input.generateBudgetedTurn({
            store: input.store,
            session: input.session,
            speaker: input.objectingAgentId,
            role: input.objectingRole,
            userInstruction: `Object to the preceding testimony on grounds of ${objectionType}. Begin your turn with "OBJECTION:" followed by the type and a one-sentence explanation.`,
        });
        await input.pause(600);
    }

    // Judge always rules
    await input.generateBudgetedTurn({
        store: input.store,
        session: input.session,
        speaker: input.judgeAgentId,
        role: 'judge',
        userInstruction:
            'Rule on the objection that was just raised: sustained or overruled. One sentence, then direct proceedings to continue.',
    });
}
```

**Step 4: Run tests to confirm pass**

```bash
npm test
```

Expected: all tests pass.

**Step 5: Commit**

```bash
git add src/court/phases/objections.ts src/court/phases/objections.test.ts
git commit -m "feat: two-layer objection detection — organic self-trigger + classifier safety net"
```

---

### Task 6: Rewrite `runWitnessExamPhase`

Replace the current judge-opens flow with the full structured bailiff-introduce → direct → cross flow, integrated with the script builder (Task 3), random events (Task 4), and objections (Task 5).

**Files:**
- Modify: `src/court/phases/session-flow.ts:263-357` (the `runWitnessExamPhase` function)

**Context:** This function currently has judge asking first. The new flow is:
1. Bailiff introduces each witness by display name + role
2. Prosecutor direct: 3–7 rounds (script builder) — each round: prosecutor question → witness answer → random event check → objection check or judge interrupt (mutually exclusive)
3. Defense cross: 2–5 rounds — same structure, opposing roles flipped
4. Judge recap every N witnesses (unchanged cadence logic)

**Step 1: Add imports at the top of `session-flow.ts`**

After the existing imports, add:

```ts
import { buildWitnessScripts } from './witness-script.js';
import { checkRandomEvent, type RandomEvent, type EventSpeaker } from './random-events.js';
import { handleObjectionRound } from './objections.js';
import { AGENTS } from '../../agents.js';
```

**Step 2: Add `shouldJudgeInterrupt` helper before `runWitnessExamPhase`**

```ts
function shouldJudgeInterrupt(rng: () => number = Math.random, probability = 0.12): boolean {
    return rng() < probability;
}
```

**Step 3: Add `runRandomEvent` helper before `runWitnessExamPhase`**

```ts
async function runRandomEvent(
    context: SessionRuntimeContext,
    event: RandomEvent,
    witnessId: AgentId,
    witnessRole: CourtRole,
    prosecutorId: AgentId,
    defenseId: AgentId,
    isDirectExam: boolean,
): Promise<void> {
    const speaker: EventSpeaker = event.speaker;
    let agentId: AgentId;
    let role: CourtRole;

    if (speaker === 'witness') {
        agentId = witnessId;
        role = witnessRole;
    } else if (speaker === 'bailiff') {
        agentId = context.session.metadata.roleAssignments.bailiff;
        role = 'bailiff';
    } else if (speaker === 'judge') {
        agentId = context.session.metadata.roleAssignments.judge;
        role = 'judge';
    } else {
        // opposing_counsel: during direct the defense opposes; during cross the prosecution opposes
        agentId = isDirectExam ? defenseId : prosecutorId;
        role = isDirectExam ? 'defense' : 'prosecutor';
    }

    await context.generateBudgetedTurn({
        store: context.store,
        session: context.session,
        speaker: agentId,
        role,
        userInstruction: event.userInstruction,
    });
}
```

**Step 4: Replace `runWitnessExamPhase` entirely**

Remove the existing function (lines 263–357) and replace with:

```ts
export async function runWitnessExamPhase(
    context: SessionRuntimeContext,
): Promise<void> {
    const { judge, prosecutor, defense, witnesses, bailiff } =
        context.session.metadata.roleAssignments;

    await beginPhase(context, 'witness_exam', PHASE_DURATION_MS.witnessExam);
    await context.safelySpeak('speakCue', () =>
        context.tts.speakCue({
            sessionId: context.session.id,
            phase: 'witness_exam',
            text: 'Witness examination begins. The court will hear testimony.',
        }),
    );

    const scripts = buildWitnessScripts(witnesses.length);
    // eslint-disable-next-line no-console
    console.info(
        `[witness-exam] session=${context.session.id} scripts=${JSON.stringify(scripts)}`,
    );

    let witnessIndex = 0;

    for (const witness of witnesses) {
        const script = scripts[witnessIndex]!;
        const witnessRole = `witness_${Math.min(witnessIndex + 1, MAX_WITNESS_ROLE_INDEX)}` as CourtRole;
        const witnessConfig = AGENTS[witness];

        // 1. Bailiff introduces witness
        await context.pause(PAUSE_MS.witnessBetweenTurns);
        await context.generateBudgetedTurn({
            store: context.store,
            session: context.session,
            speaker: bailiff,
            role: 'bailiff',
            userInstruction: `Call ${witnessConfig.displayName} (${witnessConfig.role}) to the stand. Announce their name and role formally and briefly.`,
        });
        await context.pause(PAUSE_MS.witnessBetweenTurns);

        // 2. Direct examination
        for (let q = 0; q < script.directRounds; q++) {
            const prosecutorTurn = await context.generateBudgetedTurn({
                store: context.store,
                session: context.session,
                speaker: prosecutor,
                role: 'prosecutor',
                userInstruction: `Ask ${witnessConfig.displayName} a focused question about the core accusation. Direct examination question ${q + 1} of ${script.directRounds}. If you have grounds to object to anything said previously, begin with "OBJECTION:" followed by the type.`,
            });
            await context.pause(PAUSE_MS.witnessBetweenTurns);

            const witnessTurn = await context.generateBudgetedTurn({
                store: context.store,
                session: context.session,
                speaker: witness,
                role: witnessRole,
                userInstruction:
                    'Answer the question in 1–3 sentences with one concrete detail. Be truthful — or convincingly not.',
                maxTokens: Math.min(
                    MAX_WITNESS_TURN_TOKENS,
                    context.witnessCapConfig
                        ? (effectiveTokenLimit(context.witnessCapConfig).limit ?? MAX_WITNESS_TURN_TOKENS)
                        : MAX_WITNESS_TURN_TOKENS,
                ),
                capConfig: context.witnessCapConfig,
            });
            await context.pause(PAUSE_MS.witnessBetweenTurns);

            // Random event check
            const event = checkRandomEvent();
            if (event) {
                await runRandomEvent(context, event, witness, witnessRole, prosecutor, defense, true);
                await context.pause(PAUSE_MS.witnessBetweenTurns);
            }

            // Judge interrupt or objection check (mutually exclusive)
            if (shouldJudgeInterrupt()) {
                await context.generateBudgetedTurn({
                    store: context.store,
                    session: context.session,
                    speaker: judge,
                    role: 'judge',
                    userInstruction:
                        'Briefly clarify a procedural point or give a short instruction to the jury. One or two sentences.',
                });
                await context.pause(PAUSE_MS.witnessBetweenTurns);
            } else {
                await handleObjectionRound({
                    dialogue: witnessTurn.dialogue,
                    objectingAgentId: defense,
                    objectingRole: 'defense',
                    judgeAgentId: judge,
                    generateBudgetedTurn: context.generateBudgetedTurn,
                    store: context.store,
                    session: context.session,
                    pause: context.pause,
                });
            }
        }

        // 3. Cross-examination
        for (let q = 0; q < script.crossRounds; q++) {
            const defenseTurn = await context.generateBudgetedTurn({
                store: context.store,
                session: context.session,
                speaker: defense,
                role: 'defense',
                userInstruction: `Cross-examine ${witnessConfig.displayName} with one pointed challenge. Cross question ${q + 1} of ${script.crossRounds}. If you have grounds to object to anything said previously, begin with "OBJECTION:" followed by the type.`,
            });
            await context.pause(PAUSE_MS.witnessBetweenTurns);

            const witnessCrossTurn = await context.generateBudgetedTurn({
                store: context.store,
                session: context.session,
                speaker: witness,
                role: witnessRole,
                userInstruction:
                    'Respond to the cross-examination in 1–3 sentences. You may be evasive, emotional, or suspiciously specific.',
                maxTokens: Math.min(
                    MAX_WITNESS_TURN_TOKENS,
                    context.witnessCapConfig
                        ? (effectiveTokenLimit(context.witnessCapConfig).limit ?? MAX_WITNESS_TURN_TOKENS)
                        : MAX_WITNESS_TURN_TOKENS,
                ),
                capConfig: context.witnessCapConfig,
            });
            await context.pause(PAUSE_MS.witnessBetweenTurns);

            // Random event check
            const crossEvent = checkRandomEvent();
            if (crossEvent) {
                await runRandomEvent(context, crossEvent, witness, witnessRole, prosecutor, defense, false);
                await context.pause(PAUSE_MS.witnessBetweenTurns);
            }

            // Judge interrupt or objection check (mutually exclusive)
            if (shouldJudgeInterrupt()) {
                await context.generateBudgetedTurn({
                    store: context.store,
                    session: context.session,
                    speaker: judge,
                    role: 'judge',
                    userInstruction:
                        'Briefly clarify a procedural point or give a short instruction to the jury. One or two sentences.',
                });
                await context.pause(PAUSE_MS.witnessBetweenTurns);
            } else {
                await handleObjectionRound({
                    dialogue: witnessCrossTurn.dialogue,
                    objectingAgentId: prosecutor,
                    objectingRole: 'prosecutor',
                    judgeAgentId: judge,
                    generateBudgetedTurn: context.generateBudgetedTurn,
                    store: context.store,
                    session: context.session,
                    pause: context.pause,
                });
            }
        }

        // Judge recap at cadence
        witnessIndex += 1;
        if (witnessIndex % context.recapCadence === 0) {
            await context.pause(PAUSE_MS.recapLeadIn);
            const recapTurn = await context.generateBudgetedTurn({
                store: context.store,
                session: context.session,
                speaker: judge,
                role: 'judge',
                userInstruction:
                    'Give a two-sentence recap of what matters so far and keep the jury oriented.',
                dialoguePrefix: 'Recap:',
            });

            await context.store.recordRecap({
                sessionId: context.session.id,
                turnId: recapTurn.id,
                phase: context.session.phase,
                cycleNumber: witnessIndex,
            });

            await context.safelySpeak('speakRecap', () =>
                context.tts.speakRecap({
                    sessionId: context.session.id,
                    phase: 'witness_exam',
                    text: recapTurn.dialogue,
                }),
            );
        }

        await context.pause(PAUSE_MS.witnessBetweenCycles);
    }
}
```

**Step 5: Run tests**

```bash
npm test
```

Expected: all tests pass. If TypeScript errors appear, check import paths — they must use `.js` extensions (e.g., `'./witness-script.js'` not `'./witness-script'`).

**Step 6: Commit**

```bash
git add src/court/phases/session-flow.ts
git commit -m "feat: restructure witness exam — bailiff intro, direct/cross, script builder, random events, objections"
```

---

## Test Command Reference

```bash
# Run all tests
npm test

# Run a single test file
node --import tsx --test src/court/phases/witness-script.test.ts

# TypeScript type check only
npm run lint
```

## Notes for Implementer

- All `.ts` imports must use `.js` extensions (ESM requirement of this project)
- The test runner is Node's built-in `node:test` — no Jest, no Vitest
- `LLM_MOCK=true` is set automatically when `--test` is in `process.argv`, so `llmGenerate` calls in objection tests return mock dialogue (not real LLM calls)
- The `effectiveTokenLimit` import is already in `session-flow.ts` — do not remove it
- `AGENTS` is imported from `'../../agents.js'` in orchestrator — same path pattern for session-flow
