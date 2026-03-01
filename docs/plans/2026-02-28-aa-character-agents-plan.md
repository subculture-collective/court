# AA Character Agents Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the six abstract agents (primus, chora, etc.) with thirteen Ace Attorney characters as first-class agents, each with a voice persona, role archetypes, and runtime transcript sampling.

**Architecture:** `AgentId` becomes 13 AA character slugs. A new `transcript-sampler.ts` singleton lazy-loads character dialogue from `AA-transcripts/` and caches it in memory. `buildCourtSystemPrompt` becomes async and injects both a handwritten voice persona and 4 sampled transcript lines per turn. Session casting is replaced with an archetype-pool drawing system in `roles.ts`.

**Tech Stack:** TypeScript, Node.js built-in `fs/promises`, `node --import tsx --test` test runner

---

## Task 1: Update `types.ts`

**Files:**
- Modify: `src/types.ts:1-7` (AgentId union)
- Modify: `src/types.ts:9-15` (AgentConfig interface)

### Step 1: Replace `AgentId` union

In `src/types.ts`, replace lines 1–7:

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

### Step 2: Add `RoleArchetype` type (after AgentId)

```ts
export type RoleArchetype = 'judge' | 'prosecutor' | 'defense' | 'witness' | 'bailiff';
```

### Step 3: Update `AgentConfig` interface

Replace the existing `AgentConfig` interface:

```ts
export interface AgentConfig {
    id: AgentId;
    displayName: string;
    role: string;
    description: string;
    color: string;
    voicePersona: string;
    roleArchetypes: RoleArchetype[];
    transcriptDir: string;
}
```

### Step 4: Run type-check to see all downstream errors

```bash
npm run lint 2>&1 | head -60
```

Expected: a list of type errors in `agents.ts`, `roles.ts`, and test files — this is the work list for subsequent tasks.

### Step 5: Commit

```bash
git add src/types.ts
git commit -m "feat: replace AgentId union with AA character slugs, add RoleArchetype"
```

---

## Task 2: Rewrite `agents.ts`

**Files:**
- Modify: `src/agents.ts` (full rewrite)

### Step 1: Replace all content

```ts
import type { AgentConfig, AgentId } from './types.js';

export const AGENTS: Record<AgentId, AgentConfig> = {
    phoenix: {
        id: 'phoenix',
        displayName: 'Phoenix Wright',
        role: 'Defense Attorney',
        description: 'Rookie-turned-veteran defense attorney. Bumbling but sincere, wins on instinct and loyalty.',
        color: '#3b82f6',
        voicePersona: `Earnest and bumbling, with a habit of nervous internal monologues that spill out at the worst moments. Speaks in run-on sentences when flustered, erupts into confident declarations at breakthrough moments. "Hold it!" is punctuation. Treats every case as a personal mission — not just a job — and genuinely believes in his clients even when he probably shouldn't.`,
        roleArchetypes: ['defense', 'witness'],
        transcriptDir: 'Phoenix Wright Transcripts',
    },
    edgeworth: {
        id: 'edgeworth',
        displayName: 'Miles Edgeworth',
        role: 'Chief Prosecutor',
        description: 'Cold, precise, and relentless. Dedicated to the truth above winning — even if he has to remind himself of that.',
        color: '#dc2626',
        voicePersona: `Clipped, formal, and icily precise. Every sentence is deliberate; every word is load-bearing. Dismisses sloppiness with a single "Hmph." Never uses contractions when the full form will do. Occasional flashes of genuine vulnerability break through the steel exterior, usually at the worst possible moment for his composure.`,
        roleArchetypes: ['prosecutor', 'judge'],
        transcriptDir: 'Miles Edgeworth Transcripts',
    },
    mia: {
        id: 'mia',
        displayName: 'Mia Fey',
        role: 'Defense Attorney',
        description: 'Veteran defense attorney and mentor. Has seen every trick. Quiet, warm, and difficult to rattle.',
        color: '#7c3aed',
        voicePersona: `Measured authority with warmth underneath. Speaks with the quiet confidence of someone who has seen every courtroom trick before and finds none of them surprising. Mentors through Socratic challenge rather than direct instruction. Protective of clients with calm intensity — never loud, never flustered, always three steps ahead.`,
        roleArchetypes: ['defense', 'judge'],
        transcriptDir: 'Mia Fey Transcripts',
    },
    franziska: {
        id: 'franziska',
        displayName: 'Franziska von Karma',
        role: 'Prosecutor',
        description: 'Imperious perfectionist who trained since childhood to be the perfect prosecutor. Calls everyone fool.',
        color: '#be185d',
        voicePersona: `Imperious, relentless, and allergic to imperfection. Calls everyone "fool" — the distinction between degrees of foolishness is her primary emotional vocabulary. Delivers statements as verdicts, never as suggestions. Perfection is the baseline; everything short of it is a personal insult to the law and to the von Karma name.`,
        roleArchetypes: ['prosecutor', 'bailiff'],
        transcriptDir: 'Franziska Von Karma Transcripts',
    },
    godot: {
        id: 'godot',
        displayName: 'Godot',
        role: 'Prosecutor',
        description: 'Brooding, coffee-obsessed prosecutor who speaks in metaphors and settles old scores through the law.',
        color: '#92400e',
        voicePersona: `Slow-burning and philosophical. Every observation is filtered through coffee metaphors — bitterness, strength, the right temperature. Deadpan provocateur who makes nihilism sound poetic. Never answers a direct question without a detour through something oblique. The pauses between his sentences are as weighted as the sentences themselves.`,
        roleArchetypes: ['judge', 'prosecutor'],
        transcriptDir: 'Godot Transcripts',
    },
    gumshoe: {
        id: 'gumshoe',
        displayName: 'Dick Gumshoe',
        role: 'Detective',
        description: 'Loyal, underpaid, and surprisingly perceptive when he stops apologizing for existing.',
        color: '#16a34a',
        voicePersona: `Loyal to a fault, perpetually worried about his salary, and accidentally perceptive. Uses "pal" as punctuation at the end of almost every sentence. Apologizes preemptively for things he hasn't done wrong yet. Blurts the truth before realizing he probably should have kept it to himself, then apologizes for that too.`,
        roleArchetypes: ['bailiff', 'witness'],
        transcriptDir: 'Gumshoe Transcripts',
    },
    maya: {
        id: 'maya',
        displayName: 'Maya Fey',
        role: 'Spirit Medium',
        description: 'Chaotic, food-obsessed spirit medium who treats the supernatural as completely mundane.',
        color: '#9333ea',
        voicePersona: `Chaotic, enthusiastic, and perpetually hungry. Asks wildly inappropriate questions with genuine curiosity and no awareness of how they land. Treats the spirit world as completely mundane — channeling the dead is just a thing you do before lunch. Punctuates serious moments with non-sequiturs about Steel Samurai or what she wants to eat.`,
        roleArchetypes: ['witness', 'defense'],
        transcriptDir: 'Maya Fey Transcripts',
    },
    apollo: {
        id: 'apollo',
        displayName: 'Apollo Justice',
        role: 'Defense Attorney',
        description: 'Loud, earnest, and practicing being confident. Notices physical tells nobody else catches.',
        color: '#b91c1c',
        voicePersona: `Practicing being confident — loudly, intensely, sometimes in the wrong direction. "GOTCHA!" is reserved for genuine breakthroughs and arrives with real force. Notices physical tells nobody else catches, which makes him seem oddly omniscient at random moments. Aspires to Edgeworth-level cool; lands solidly in Phoenix-level earnest.`,
        roleArchetypes: ['defense', 'prosecutor'],
        transcriptDir: 'Apollo Justice Transcripts',
    },
    athena: {
        id: 'athena',
        displayName: 'Athena Cykes',
        role: 'Defense Attorney',
        description: 'Peppy, psychology-trained attorney who can literally hear emotional dissonance in testimony.',
        color: '#f59e0b',
        voicePersona: `Peppy, analytical, and emotionally hyperperceptive — she can actually hear emotional dissonance in testimony, which she announces with unsettling precision. Quotes psychology at inappropriate moments. Boundlessly optimistic in ways that can feel manic under pressure. Her warmth is genuine; it just sometimes comes out as intensity that makes witnesses uncomfortable.`,
        roleArchetypes: ['defense', 'witness'],
        transcriptDir: 'Athena Cykes Transcripts',
    },
    ema: {
        id: 'ema',
        displayName: 'Ema Skye',
        role: 'Forensic Investigator',
        description: 'Science-first detective who is deeply unimpressed by non-scientific reasoning. Always snacking.',
        color: '#10b981',
        voicePersona: `Forensically dismissive of non-scientific reasoning. Prefaces everything with "scientifically speaking" and means it as a challenge. Snack-dependent — her focus degrades noticeably when she runs out. Deeply, genuinely unimpressed by most lawyers and their theatrics. Has seen enough crime scenes to find courtroom drama quaint.`,
        roleArchetypes: ['witness', 'bailiff'],
        transcriptDir: 'Ema Skye Transcripts',
    },
    klavier: {
        id: 'klavier',
        displayName: 'Klavier Gavin',
        role: 'Prosecutor',
        description: 'Rock star prosecutor with genuine legal competence underneath the showmanship.',
        color: '#8b5cf6',
        voicePersona: `Rock-star confidence with actual legal competence underneath. Casual and charming in a way that is slightly dangerous because you forget he is very good at his job. "Achtung, baby." Deploys guitar metaphors for legal strategy. Calls witnesses "Fräulein" or "Herr" with a formality that is somehow both respectful and condescending.`,
        roleArchetypes: ['prosecutor', 'witness'],
        transcriptDir: 'Klavier Gavin Transcripts',
    },
    blackquill: {
        id: 'blackquill',
        displayName: 'Simon Blackquill',
        role: 'Prosecutor',
        description: 'Theatrically menacing samurai-themed prosecutor with archaic diction and a trained hawk.',
        color: '#374151',
        voicePersona: `Theatrically menacing, archaic in diction, and razor-precise when it actually counts. Deploys samurai metaphors with deadpan commitment. References his hawk Taka as punctuation. Formal, antiquated phrasing that breaks suddenly into biting modern precision when he has you cornered. "Foolish creature" is a term of almost-respect.`,
        roleArchetypes: ['prosecutor', 'judge'],
        transcriptDir: 'Simon Blackquill Transcripts',
    },
    trucy: {
        id: 'trucy',
        displayName: 'Trucy Wright',
        role: 'Magician',
        description: 'Magician-daughter who treats the courtroom as a stage and never breaks character.',
        color: '#ec4899',
        voicePersona: `Everything is a magic show. Boundlessly optimistic magician who treats the courtroom as a stage and the jury as an audience. "Ta-dah!" Secrets are part of the act — she keeps them with a performer's discipline. Disarmingly honest within a performance frame, which makes her testimony oddly reliable despite being delivered like a trick.`,
        roleArchetypes: ['witness'],
        transcriptDir: 'Trucy Wright Transcripts',
    },
};

export const AGENT_IDS = Object.keys(AGENTS) as AgentId[];

export function isValidAgent(id: string): id is AgentId {
    return id in AGENTS;
}
```

### Step 2: Run type-check

```bash
npm run lint 2>&1 | grep "agents.ts" | head -10
```

Expected: no errors in `agents.ts`.

### Step 3: Commit

```bash
git add src/agents.ts
git commit -m "feat: add 13 AA character agent configs with voice personas and role archetypes"
```

---

## Task 3: Create `transcript-sampler.ts` (TDD)

**Files:**
- Create: `src/court/transcript-sampler.ts`
- Create: `src/court/transcript-sampler.test.ts`

### Step 1: Create a temporary fake transcript directory for tests

The tests use a real `fs/promises` read against a temp directory. Create the fixture inline in the test using `os.tmpdir()`.

### Step 2: Write the failing test

Create `src/court/transcript-sampler.test.ts`:

```ts
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// We'll import the sampler after we know the test dir
let transcriptSampler: typeof import('./transcript-sampler.js');
let testDir: string;

describe('TranscriptSampler', () => {
    before(async () => {
        testDir = await mkdtemp(join(tmpdir(), 'court-transcripts-'));
        // Create a fake character transcript folder
        const charDir = join(testDir, 'Phoenix Wright Transcripts');
        await mkdir(charDir);
        await writeFile(
            join(charDir, '1-1 Phoenix Wright.txt'),
            [
                'Hold it!',
                'The defense is ready, Your Honor.',
                '(I have a bad feeling about this...)',
                '',
                'Objection!',
                'Take that!',
                '(Blank line above should be filtered)',
            ].join('\n'),
        );
        // Set env var before importing sampler
        process.env['TRANSCRIPT_DIR'] = testDir;
        transcriptSampler = await import('./transcript-sampler.js');
    });

    after(async () => {
        await rm(testDir, { recursive: true });
        delete process.env['TRANSCRIPT_DIR'];
    });

    it('returns the requested number of lines', async () => {
        const lines = await transcriptSampler.sample('phoenix', 2);
        assert.equal(lines.length, 2);
    });

    it('filters blank lines', async () => {
        const lines = await transcriptSampler.sample('phoenix', 100);
        assert.ok(lines.every(l => l.trim().length > 0), 'blank lines slipped through');
    });

    it('filters pure parenthetical stage directions', async () => {
        const lines = await transcriptSampler.sample('phoenix', 100);
        const parentheticals = lines.filter(l => /^\s*\(.*\)\s*$/.test(l));
        assert.equal(parentheticals.length, 0, 'parentheticals slipped through');
    });

    it('returns lines from cache on second call without additional file reads', async () => {
        // Two calls should succeed — cache means no extra I/O errors
        const a = await transcriptSampler.sample('phoenix', 2);
        const b = await transcriptSampler.sample('phoenix', 2);
        assert.equal(a.length, 2);
        assert.equal(b.length, 2);
    });

    it('throws on unknown character transcript dir', async () => {
        // 'trucy' has no files in our test dir — should reject
        await assert.rejects(
            () => transcriptSampler.sample('trucy', 2),
            /transcript/i,
        );
    });
});
```

### Step 3: Run test to verify it fails

```bash
node --import tsx --test src/court/transcript-sampler.test.ts 2>&1 | tail -10
```

Expected: FAIL with `Cannot find module './transcript-sampler.js'`

### Step 4: Create `src/court/transcript-sampler.ts`

```ts
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentId } from '../types.js';
import { AGENTS } from '../agents.js';

const cache = new Map<AgentId, string[]>();

function transcriptRoot(): string {
    return process.env['TRANSCRIPT_DIR'] ?? './AA-transcripts';
}

function isStageDirection(line: string): boolean {
    return /^\s*\(.*\)\s*$/.test(line);
}

async function load(agentId: AgentId): Promise<string[]> {
    if (cache.has(agentId)) return cache.get(agentId)!;

    const agent = AGENTS[agentId];
    const dir = join(transcriptRoot(), agent.transcriptDir);

    let files: string[];
    try {
        files = await readdir(dir);
    } catch {
        throw new Error(`No transcript directory found for ${agentId} at ${dir}`);
    }

    const txtFiles = files.filter(f => f.endsWith('.txt'));
    if (txtFiles.length === 0) {
        throw new Error(`No transcript files found for ${agentId} in ${dir}`);
    }

    const allLines: string[] = [];
    for (const file of txtFiles) {
        const content = await readFile(join(dir, file), 'utf-8');
        for (const line of content.split('\n')) {
            const trimmed = line.trim();
            if (trimmed.length > 0 && !isStageDirection(trimmed)) {
                allLines.push(trimmed);
            }
        }
    }

    cache.set(agentId, allLines);
    return allLines;
}

export async function sample(agentId: AgentId, n: number): Promise<string[]> {
    const lines = await load(agentId);
    if (lines.length === 0) return [];

    const result: string[] = [];
    const used = new Set<number>();
    const max = Math.min(n, lines.length);

    while (result.length < max) {
        const idx = Math.floor(Math.random() * lines.length);
        if (!used.has(idx)) {
            used.add(idx);
            result.push(lines[idx]);
        }
    }
    return result;
}

/** Clear the in-memory cache. Useful for tests. */
export function clearCache(): void {
    cache.clear();
}
```

### Step 5: Run test to verify it passes

```bash
node --import tsx --test src/court/transcript-sampler.test.ts 2>&1 | tail -15
```

Expected: all tests PASS.

### Step 6: Commit

```bash
git add src/court/transcript-sampler.ts src/court/transcript-sampler.test.ts
git commit -m "feat: add transcript-sampler singleton with lazy-load cache and TDD tests"
```

---

## Task 4: Rewrite `roles.ts` (TDD)

**Files:**
- Modify: `src/court/roles.ts` (full rewrite)

The new function draws one character per fixed role from archetype pools, picking 3 witnesses from the remaining pool. It also exports a `participantsFromRoleAssignments` helper used throughout the codebase.

### Step 1: Write the failing test first

Add a new test file `src/court/roles.test.ts`:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_IDS, AGENTS } from '../agents.js';
import { assignCourtRoles, participantsFromRoleAssignments } from './roles.js';

describe('assignCourtRoles (auto-cast)', () => {
    it('returns exactly one judge, prosecutor, defense, bailiff', () => {
        const ra = assignCourtRoles();
        assert.ok(ra.judge);
        assert.ok(ra.prosecutor);
        assert.ok(ra.defense);
        assert.ok(ra.bailiff);
    });

    it('returns 1-3 witnesses', () => {
        const ra = assignCourtRoles();
        assert.ok(ra.witnesses.length >= 1 && ra.witnesses.length <= 3);
    });

    it('assigns no character to more than one role', () => {
        const ra = assignCourtRoles();
        const all = participantsFromRoleAssignments(ra);
        const unique = new Set(all);
        assert.equal(unique.size, all.length, 'duplicate character assigned to multiple roles');
    });

    it('judge comes from judge archetype pool', () => {
        const ra = assignCourtRoles();
        const judgePool = AGENT_IDS.filter(id => AGENTS[id].roleArchetypes.includes('judge'));
        assert.ok(judgePool.includes(ra.judge), `${ra.judge} is not in judge pool`);
    });

    it('prosecutor comes from prosecutor archetype pool', () => {
        const ra = assignCourtRoles();
        const pool = AGENT_IDS.filter(id => AGENTS[id].roleArchetypes.includes('prosecutor'));
        assert.ok(pool.includes(ra.prosecutor), `${ra.prosecutor} is not in prosecutor pool`);
    });

    it('witnesses come from witness archetype pool', () => {
        const ra = assignCourtRoles();
        const pool = AGENT_IDS.filter(id => AGENTS[id].roleArchetypes.includes('witness'));
        for (const w of ra.witnesses) {
            assert.ok(pool.includes(w), `${w} is not in witness pool`);
        }
    });
});

describe('assignCourtRoles (explicit participants override)', () => {
    it('accepts an explicit participant list and assigns roles from it', () => {
        const participants = AGENT_IDS.slice(0, 7);
        const ra = assignCourtRoles(participants);
        const all = participantsFromRoleAssignments(ra);
        assert.ok(all.every(id => participants.includes(id)), 'assigned a character outside the override list');
    });
});

describe('participantsFromRoleAssignments', () => {
    it('returns all 7 assigned characters', () => {
        const ra = assignCourtRoles();
        const participants = participantsFromRoleAssignments(ra);
        assert.equal(participants.length, 1 + 1 + 1 + 1 + ra.witnesses.length);
    });
});
```

### Step 2: Run test to verify it fails

```bash
node --import tsx --test src/court/roles.test.ts 2>&1 | tail -10
```

Expected: FAIL — `participantsFromRoleAssignments is not exported`, `assignCourtRoles` is the old signature.

### Step 3: Rewrite `src/court/roles.ts`

```ts
import { AGENT_IDS, AGENTS } from '../agents.js';
import type { AgentId, CourtRoleAssignments, RoleArchetype } from '../types.js';

function shuffle<T>(arr: T[]): T[] {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

function buildArchetypePool(archetype: RoleArchetype, source: AgentId[]): AgentId[] {
    return source.filter(id => AGENTS[id].roleArchetypes.includes(archetype));
}

function pickOne(pool: AgentId[], used: Set<AgentId>): AgentId {
    const available = shuffle(pool).filter(id => !used.has(id));
    if (available.length === 0) {
        // Fallback: any unused character from full roster
        const fallback = AGENT_IDS.find(id => !used.has(id));
        if (!fallback) throw new Error('Roster exhausted — not enough characters for all roles');
        used.add(fallback);
        return fallback;
    }
    used.add(available[0]);
    return available[0];
}

function pickMany(pool: AgentId[], used: Set<AgentId>, max: number): AgentId[] {
    const available = shuffle(pool).filter(id => !used.has(id));
    const picks = available.slice(0, max);
    for (const id of picks) used.add(id);
    return picks;
}

function assignFromPool(source: AgentId[]): CourtRoleAssignments {
    const used = new Set<AgentId>();
    const judge = pickOne(buildArchetypePool('judge', source), used);
    const prosecutor = pickOne(buildArchetypePool('prosecutor', source), used);
    const defense = pickOne(buildArchetypePool('defense', source), used);
    const bailiff = pickOne(buildArchetypePool('bailiff', source), used);
    const witnesses = pickMany(buildArchetypePool('witness', source), used, 3);
    return { judge, prosecutor, defense, witnesses, bailiff };
}

export function assignCourtRoles(participants?: AgentId[]): CourtRoleAssignments {
    return assignFromPool(participants ?? AGENT_IDS);
}

export function participantsFromRoleAssignments(ra: CourtRoleAssignments): AgentId[] {
    return [ra.judge, ra.prosecutor, ra.defense, ra.bailiff, ...ra.witnesses];
}
```

### Step 4: Run test to verify it passes

```bash
node --import tsx --test src/court/roles.test.ts 2>&1 | tail -15
```

Expected: all tests PASS.

### Step 5: Commit

```bash
git add src/court/roles.ts src/court/roles.test.ts
git commit -m "feat: rewrite assignCourtRoles with archetype pool drawing, add participantsFromRoleAssignments"
```

---

## Task 5: Update `personas.ts`

**Files:**
- Modify: `src/court/personas.ts`

### Step 1: Make `buildCourtSystemPrompt` async and inject voice + samples

Replace the entire file:

```ts
import { AGENTS } from '../agents.js';
import { sample } from './transcript-sampler.js';
import type {
    AgentId,
    CaseType,
    CourtPhase,
    CourtRole,
    GenreTag,
} from '../types.js';

export const CLEAN_COURTROOM_POLICY = `
CLEAN COURTROOM POLICY:
- No slurs or hate speech
- No graphic/sexual violence
- No targeted harassment of real individuals or protected groups
- Keep tone comedic, absurd, and PG-13
- If unsafe territory appears, redirect with judge discipline and continue the scene
`;

const COURT_ROLE_PROMPTS: Record<string, string> = {
    judge: `You are the Judge. You control pacing, enforce boundaries, summarize often, and deliver final ruling with dramatic comedic flair. Be concise and authoritative.`,
    prosecutor: `You are the Prosecutor. Argue guilty/liable with sharp but playful logic. Cross-examine to expose contradictions.`,
    defense: `You are the Defense Attorney. Argue not guilty/not liable. Reframe evidence, defend witness credibility, and create reasonable doubt.`,
    witness: `You are a Witness. Give short, characterful improvised testimony. Stay specific, funny, and under 3 sentences per answer.`,
    bailiff: `You are the Bailiff/Timekeeper voice. Announce transitions, timers, and poll openings in one short line.`,
};

// Genre-specific role variations for enhanced flavor
const GENRE_ROLE_VARIATIONS: Record<GenreTag, Record<string, string>> = {
    absurd_civil: {
        judge: `You are the Judge in a civil absurdity case. Treat ridiculous claims with dead-serious legal gravity. Summarize often and rule with theatrical pomposity.`,
        prosecutor: `You are the Plaintiff's Attorney. Argue for damages with earnest passion despite the absurd circumstances. Find real legal principles in silly situations.`,
        defense: `You are the Defense Attorney. Defend against absurd claims with equally absurd counter-arguments. Make the unreasonable sound reasonable.`,
    },
    cosmic_crime: {
        judge: `You are the Intergalactic/Temporal Judge. Balance cosmic law with earthly procedure. Reference space-time paradoxes and alien jurisdictions casually.`,
        prosecutor: `You are the Cosmic Prosecutor. Charge defendants with violations of universal laws. Cite precedents from other dimensions and timelines.`,
        defense: `You are the Defense Attorney for Cosmic Crimes. Argue technicalities in space-time law. Use quantum uncertainty and parallel universes as reasonable doubt.`,
    },
    workplace_tribunal: {
        judge: `You are the Tribunal Chair. Apply employment law to workplace horror stories. Summarize grievances with bureaucratic precision and dry wit.`,
        prosecutor: `You are the Employee's Representative. Present workplace violations with union-worthy passion. Cite HR policies nobody actually reads.`,
        defense: `You are Management's Legal Counsel. Defend corporate absurdity as "company culture." Reference synergy and team-building unironically.`,
    },
    fantasy_court: {
        judge: `You are the Judge of the Realm. Apply medieval law to magical disputes. Reference ancient scrolls and mystical precedents. Rule with fantasy gravitas.`,
        prosecutor: `You are the Crown Prosecutor. Charge defendants with mystical misdeeds. Treat spells and enchantments as criminal tools with legal specificity.`,
        defense: `You are the Defense Counsel of the Realm. Argue magical technicalities and enchantment loopholes. Make fantasy tropes into legal defenses.`,
    },
};

function rolePrompt(role: CourtRole, genre?: GenreTag): string {
    if (role.startsWith('witness_')) {
        return COURT_ROLE_PROMPTS.witness;
    }
    if (genre && GENRE_ROLE_VARIATIONS[genre]?.[role]) {
        return GENRE_ROLE_VARIATIONS[genre][role];
    }
    return COURT_ROLE_PROMPTS[role] ?? COURT_ROLE_PROMPTS.witness;
}

export async function buildCourtSystemPrompt(promptConfig: {
    agentId: AgentId;
    role: CourtRole;
    topic: string;
    caseType: CaseType;
    phase: CourtPhase;
    history: string;
    genre?: GenreTag;
}): Promise<string> {
    const { agentId, role, topic, caseType, phase, history, genre } = promptConfig;
    const agent = AGENTS[agentId];

    const verdictLabels =
        caseType === 'civil' ? 'Liable / Not Liable' : 'Guilty / Not Guilty';

    let transcriptExamples = '';
    try {
        const lines = await sample(agentId, 4);
        if (lines.length > 0) {
            transcriptExamples = `\nExample lines from their actual dialogue:\n${lines.map(l => `- "${l}"`).join('\n')}\n`;
        }
    } catch {
        // Transcript sampling is best-effort — missing files don't break the session
    }

    return `
You are ${agent.displayName} (${agent.role}) performing as courtroom role: ${role}.
${rolePrompt(role, genre)}

Character voice:
${agent.voicePersona}
${transcriptExamples}
Case topic:
${topic}

Current phase:
${phase}

Verdict options:
${verdictLabels}

${CLEAN_COURTROOM_POLICY}

Stylistic rules:
- Keep response to 1-4 sentences
- No markdown, no stage directions, no name prefix
- Stay in character for this phase
- Be witty, but keep flow moving quickly

Recent court transcript:
${history || 'No previous turns.'}
`;
}
```

### Step 2: Run type-check

```bash
npm run lint 2>&1 | grep "personas" | head -10
```

Expected: error in `orchestrator.ts` about `buildCourtSystemPrompt` return type (`Promise<string>` not assignable to `string`). That's expected — fixed in Task 6.

### Step 3: Commit

```bash
git add src/court/personas.ts
git commit -m "feat: make buildCourtSystemPrompt async, inject voice persona and transcript samples"
```

---

## Task 6: Update `orchestrator.ts`

**Files:**
- Modify: `src/court/orchestrator.ts:258` (await the now-async prompt builder)

### Step 1: Find the call site

```bash
grep -n "buildCourtSystemPrompt\|participants\|assignCourtRoles\|AGENT_IDS" src/court/orchestrator.ts
```

### Step 2: Await the prompt builder

At line ~258, change:
```ts
const systemPrompt = buildCourtSystemPrompt({
```
to:
```ts
const systemPrompt = await buildCourtSystemPrompt({
```

The surrounding function is already `async`, so this is a one-word change.

### Step 3: Update session creation to auto-cast

Find where `assignCourtRoles(participants)` is called in `orchestrator.ts` (or `server.ts` — check both). Wherever `participants` is derived from `AGENT_IDS` as a default, replace with auto-cast logic:

In `src/server.ts`, find the session start handler (~line 278–322). Update it:

```ts
// Before (old):
const participantsInput =
    Array.isArray(req.body?.participants) ?
        req.body.participants
    :   AGENT_IDS;

const participants = participantsInput.filter(
    (id: string): id is AgentId => isValidAgent(id),
);

if (participants.length < 4) { ... }

const roleAssignments = assignCourtRoles(participants);

// After (new):
const overrideParticipants =
    Array.isArray(req.body?.participants) ?
        (req.body.participants as string[]).filter((id): id is AgentId => isValidAgent(id))
    :   undefined;

const roleAssignments = assignCourtRoles(overrideParticipants);
const participants = participantsFromRoleAssignments(roleAssignments);
```

Add `participantsFromRoleAssignments` to the import from `./court/roles.js`.

Remove the `AGENT_IDS` import from `server.ts` if it's only used for the default participants fallback.

### Step 4: Run type-check

```bash
npm run lint 2>&1 | head -30
```

Expected: no errors in `orchestrator.ts` or `server.ts`.

### Step 5: Commit

```bash
git add src/court/orchestrator.ts src/server.ts
git commit -m "feat: await async buildCourtSystemPrompt, auto-cast session participants from archetype pools"
```

---

## Task 7: Fix test files — hardcoded agent IDs

**Files:**
- Modify: `src/court/catchup.test.ts`
- Modify: `src/events.test.ts`
- Modify: `src/store/session-store.test.ts`
- Modify: `src/server-replay.test.ts`
- Modify: `src/replay/session-replay.test.ts`
- Modify: `src/e2e-round.test.ts`
- Modify: `src/court/orchestrator.test.ts`

### Step 1: Mechanical replacement of old IDs

Run the full test suite first to see the baseline failure count:

```bash
npm test 2>&1 | tail -20
```

Then do a search-and-replace across test files. The mapping is:

| Old ID | New ID |
|--------|--------|
| `'chora'` | `'phoenix'` |
| `'subrosa'` | `'edgeworth'` |
| `'thaum'` | `'maya'` |
| `'praxis'` | `'apollo'` |
| `'mux'` | `'gumshoe'` |
| `'primus'` | `'godot'` |

Use `sed` or your editor's find-and-replace. Quick one-liner:

```bash
cd src && for old_new in "chora:phoenix" "subrosa:edgeworth" "thaum:maya" "praxis:apollo" "mux:gumshoe" "primus:godot"; do
    old="${old_new%%:*}"
    new="${old_new##*:}"
    grep -rl "'${old}'" . --include="*.test.ts" | xargs sed -i "s/'${old}'/'${new}'/g"
done
cd ..
```

### Step 2: Update `assignCourtRoles` call sites in tests

Tests call `assignCourtRoles(participants)` with a slice of `AGENT_IDS`. These calls still work because the function accepts an optional override list. No change needed for most tests.

However: the `participants.length < 4` validation was removed from `server.ts`. If any test asserts on that validation error, find and remove/update those assertions.

```bash
grep -rn "participants must include" src/ --include="*.test.ts"
```

Update any test that expects that error message.

### Step 3: Update orchestrator tests that pass explicit `participants`

In `src/court/orchestrator.test.ts`, find the lines that build a session with `participants: AGENT_IDS` and update them to use `participantsFromRoleAssignments(assignCourtRoles())` instead:

```ts
// Old:
const participants = AGENT_IDS;
const roleAssignments = assignCourtRoles(participants);
// ...session creation with participants

// New:
const roleAssignments = assignCourtRoles();
const participants = participantsFromRoleAssignments(roleAssignments);
// ...session creation with participants
```

Add `participantsFromRoleAssignments` to the import from `./roles.js` in that test file.

### Step 4: Run the full test suite

```bash
npm test 2>&1 | tail -30
```

Expected: all tests PASS (or only pre-existing failures unrelated to this work).

### Step 5: Commit

```bash
git add src/
git commit -m "fix: update test files to use AA character agent IDs"
```

---

## Task 8: Final type-check and smoke test

### Step 1: Full type-check

```bash
npm run lint
```

Expected: zero errors.

### Step 2: Full test suite

```bash
npm test
```

Expected: all tests pass.

### Step 3: Spot-check a generated prompt

Add a temporary script to verify the voice injection works end-to-end:

```bash
node --import tsx -e "
import { buildCourtSystemPrompt } from './src/court/personas.js';
const prompt = await buildCourtSystemPrompt({
    agentId: 'edgeworth',
    role: 'prosecutor',
    topic: 'The defendant allegedly over-salted communal office popcorn',
    caseType: 'criminal',
    phase: 'openings',
    history: '',
});
console.log(prompt);
"
```

Expected: prompt contains Edgeworth's `voicePersona` text and 4 sampled transcript lines.

### Step 4: Final commit

```bash
git add .
git commit -m "feat: AA character agents complete — 13 characters replace abstract agents"
```
