import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { AGENT_IDS } from '../agents.js';
import { assignCourtRoles } from '../court/roles.js';
import { createCourtSessionStore } from '../store/session-store.js';
import type { CourtEvent } from '../types.js';
import {
    buildReplayFrames,
    createSyntheticEvent,
    parseReplaySpeed,
    rewriteReplayEventForSession,
    SessionEventRecorderManager,
} from './session-replay.js';

function makeEvent(input: {
    type: CourtEvent['type'];
    at: string;
    sessionId?: string;
    payload?: Record<string, unknown>;
}): CourtEvent {
    return {
        id: `${input.type}-${input.at}`,
        sessionId: input.sessionId ?? 'source-session',
        type: input.type,
        at: input.at,
        payload: input.payload ?? {},
    };
}

async function createInMemoryStore() {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = '';
    try {
        return await createCourtSessionStore();
    } finally {
        if (previousDatabaseUrl === undefined) {
            delete process.env.DATABASE_URL;
        } else {
            process.env.DATABASE_URL = previousDatabaseUrl;
        }
    }
}

test('parseReplaySpeed clamps invalid values to default', () => {
    assert.equal(parseReplaySpeed(undefined), 1);
    assert.equal(parseReplaySpeed('0'), 1);
    assert.equal(parseReplaySpeed(-2), 1);
    assert.equal(parseReplaySpeed('4'), 4);
});

test('buildReplayFrames respects inter-event timing and speed multiplier', () => {
    const events = [
        makeEvent({
            type: 'session_started',
            at: '2026-02-28T10:00:00.000Z',
        }),
        makeEvent({
            type: 'phase_changed',
            at: '2026-02-28T10:00:00.100Z',
            payload: {
                phase: 'openings',
                phaseStartedAt: '2026-02-28T10:00:00.100Z',
            },
        }),
        makeEvent({
            type: 'turn',
            at: '2026-02-28T10:00:00.300Z',
            payload: {
                turn: {
                    id: 'turn-1',
                    sessionId: 'source-session',
                    turnNumber: 0,
                    speaker: 'primus',
                    role: 'judge',
                    phase: 'openings',
                    dialogue: 'Court is now in session.',
                    createdAt: '2026-02-28T10:00:00.300Z',
                },
            },
        }),
    ];

    const frames = buildReplayFrames(events, 2);
    assert.deepEqual(
        frames.map(frame => frame.delayMs),
        [0, 50, 150],
    );
});

test('rewriteReplayEventForSession rewrites top-level and turn session IDs', () => {
    const source = makeEvent({
        type: 'turn',
        at: '2026-02-28T10:00:00.000Z',
        sessionId: 'source-session',
        payload: {
            sessionId: 'source-session',
            turn: {
                id: 'turn-1',
                sessionId: 'source-session',
                turnNumber: 1,
                speaker: 'primus',
                role: 'judge',
                phase: 'openings',
                dialogue: 'Overruled.',
                createdAt: '2026-02-28T10:00:00.000Z',
            },
        },
    });

    const rewritten = rewriteReplayEventForSession(source, 'target-session');

    assert.equal(rewritten.sessionId, 'target-session');
    assert.equal(rewritten.payload.sessionId, 'target-session');
    assert.equal(
        (rewritten.payload.turn as { sessionId: string }).sessionId,
        'target-session',
    );

    assert.equal(source.sessionId, 'source-session');
    assert.equal(source.payload.sessionId, 'source-session');
});

test('SessionEventRecorderManager writes initial and live session events to NDJSON', async () => {
    const store = await createInMemoryStore();
    const recordingsDir = await mkdtemp(
        join(tmpdir(), 'juryrigged-recordings-'),
    );

    const participants = AGENT_IDS.slice(0, 5);
    const session = await store.createSession({
        topic: 'Did someone replace all office coffee with soup?',
        participants,
        metadata: {
            mode: 'juryrigged',
            casePrompt: 'Did someone replace all office coffee with soup?',
            caseType: 'criminal',
            sentenceOptions: ['Fine'],
            verdictVoteWindowMs: 10,
            sentenceVoteWindowMs: 10,
            verdictVotes: {},
            sentenceVotes: {},
            roleAssignments: assignCourtRoles(participants),
        },
    });

    const recorder = new SessionEventRecorderManager(store, recordingsDir);
    await recorder.start({
        sessionId: session.id,
        initialEvents: [
            createSyntheticEvent({
                sessionId: session.id,
                type: 'session_created',
                payload: { sessionId: session.id },
                at: '2026-02-28T10:00:00.000Z',
            }),
        ],
    });

    await store.startSession(session.id);
    await store.addTurn({
        sessionId: session.id,
        speaker: participants[0],
        role: 'judge',
        phase: 'case_prompt',
        dialogue: 'All rise.',
    });
    await store.completeSession(session.id);

    await recorder.stop(session.id);
    await recorder.dispose();

    const recordingPath = join(recordingsDir, `${session.id}.ndjson`);
    const lines = (await readFile(recordingPath, 'utf8'))
        .split(/\r?\n/)
        .filter(Boolean)
        .map(line => JSON.parse(line) as CourtEvent);

    assert.ok(lines.length >= 4);
    assert.equal(lines[0]?.type, 'session_created');
    assert.ok(lines.some(event => event.type === 'session_started'));
    assert.ok(lines.some(event => event.type === 'turn'));
    assert.ok(lines.some(event => event.type === 'session_completed'));
});
