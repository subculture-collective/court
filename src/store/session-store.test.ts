import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_IDS } from '../agents.js';
import { assignCourtRoles } from '../court/roles.js';
import type { CourtEvent } from '../types.js';
import { createCourtSessionStore } from './session-store.js';

async function createRunningSession() {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = '';
    try {
        const store = await createCourtSessionStore();
        const participants = AGENT_IDS.slice(0, 5);
        const session = await store.createSession({
            topic: 'Did the defendant replace all office coffee with soup?',
            participants,
            metadata: {
                mode: 'juryrigged',
                casePrompt:
                    'Did the defendant replace all office coffee with soup?',
                caseType: 'criminal',
                sentenceOptions: ['Fine', 'Community service'],
                verdictVoteWindowMs: 10,
                sentenceVoteWindowMs: 10,
                verdictVotes: {},
                sentenceVotes: {},
                roleAssignments: assignCourtRoles(participants),
            },
        });
        await store.startSession(session.id);
        return { store, sessionId: session.id };
    } finally {
        if (previousDatabaseUrl === undefined) {
            delete process.env.DATABASE_URL;
        } else {
            process.env.DATABASE_URL = previousDatabaseUrl;
        }
    }
}

test('enforces deterministic phase order', async () => {
    const { store, sessionId } = await createRunningSession();
    await assert.rejects(
        store.setPhase(sessionId, 'closings'),
        /Invalid phase transition/,
    );
    await assert.doesNotReject(store.setPhase(sessionId, 'openings'));
});

test('accepts votes only during matching vote phase and valid choices', async () => {
    const { store, sessionId } = await createRunningSession();
    await assert.rejects(
        store.castVote({
            sessionId,
            voteType: 'verdict',
            choice: 'guilty',
        }),
        /Cannot cast verdict vote/,
    );

    await store.setPhase(sessionId, 'openings');
    await store.setPhase(sessionId, 'witness_exam');
    await store.setPhase(sessionId, 'closings');
    await store.setPhase(sessionId, 'verdict_vote');

    await assert.rejects(
        store.castVote({
            sessionId,
            voteType: 'verdict',
            choice: 'banana',
        }),
        /Invalid verdict choice/,
    );

    await assert.doesNotReject(
        store.castVote({
            sessionId,
            voteType: 'verdict',
            choice: 'guilty',
        }),
    );
});

test('persists final ruling for recovery', async () => {
    const { store, sessionId } = await createRunningSession();
    await store.recordFinalRuling({
        sessionId,
        verdict: 'guilty',
        sentence: 'Fine',
    });
    const session = await store.getSession(sessionId);
    assert.equal(session?.metadata.finalRuling?.verdict, 'guilty');
    assert.equal(session?.metadata.finalRuling?.sentence, 'Fine');
    assert.ok(session?.metadata.finalRuling?.decidedAt);
});

test('returned sessions are defensive copies in in-memory store', async () => {
    const { store, sessionId } = await createRunningSession();
    const session = await store.getSession(sessionId);
    assert.ok(session);
    session.phase = 'verdict_vote';

    await assert.rejects(
        store.castVote({
            sessionId,
            voteType: 'verdict',
            choice: 'guilty',
        }),
        /Cannot cast verdict vote during phase case_prompt/,
    );
});

test('rejects unknown phase values', async () => {
    const { store, sessionId } = await createRunningSession();
    await assert.rejects(
        store.setPhase(sessionId, 'not_real' as never),
        /Unknown next phase/,
    );
});

test('emits analytics events for poll lifecycle and vote completion', async () => {
    const { store, sessionId } = await createRunningSession();
    const analyticsNames: string[] = [];
    const unsubscribe = store.subscribe(sessionId, event => {
        if (event.type === 'analytics_event') {
            analyticsNames.push(String(event.payload.name));
        }
    });

    try {
        await store.setPhase(sessionId, 'openings');
        await store.setPhase(sessionId, 'witness_exam');
        await store.setPhase(sessionId, 'closings');
        await store.setPhase(sessionId, 'verdict_vote');
        await store.castVote({
            sessionId,
            voteType: 'verdict',
            choice: 'guilty',
        });
        await store.setPhase(sessionId, 'sentence_vote');
        await store.castVote({
            sessionId,
            voteType: 'sentence',
            choice: 'Fine',
        });
        await store.setPhase(sessionId, 'final_ruling');
    } finally {
        unsubscribe();
    }

    assert.deepEqual(analyticsNames, [
        'poll_started',
        'vote_completed',
        'poll_closed',
        'poll_started',
        'vote_completed',
        'poll_closed',
    ]);
});

test('emits vote_closed and persists vote snapshots when vote phases end', async () => {
    const { store, sessionId } = await createRunningSession();
    const voteClosedEvents: CourtEvent[] = [];

    const unsubscribe = store.subscribe(sessionId, event => {
        if (event.type === 'vote_closed') {
            voteClosedEvents.push(event);
        }
    });

    try {
        await store.setPhase(sessionId, 'openings');
        await store.setPhase(sessionId, 'witness_exam');
        await store.setPhase(sessionId, 'closings');
        await store.setPhase(sessionId, 'verdict_vote');

        await store.castVote({
            sessionId,
            voteType: 'verdict',
            choice: 'guilty',
        });
        await store.castVote({
            sessionId,
            voteType: 'verdict',
            choice: 'guilty',
        });

        await store.setPhase(sessionId, 'sentence_vote');

        await store.castVote({
            sessionId,
            voteType: 'sentence',
            choice: 'Fine',
        });

        await store.setPhase(sessionId, 'final_ruling');
    } finally {
        unsubscribe();
    }

    assert.equal(voteClosedEvents.length, 2);

    assert.equal(voteClosedEvents[0]?.payload.pollType, 'verdict');
    assert.equal(voteClosedEvents[0]?.payload.nextPhase, 'sentence_vote');
    assert.deepEqual(voteClosedEvents[0]?.payload.votes, { guilty: 2 });
    assert.equal(typeof voteClosedEvents[0]?.payload.closedAt, 'string');

    assert.equal(voteClosedEvents[1]?.payload.pollType, 'sentence');
    assert.equal(voteClosedEvents[1]?.payload.nextPhase, 'final_ruling');
    assert.deepEqual(voteClosedEvents[1]?.payload.votes, { Fine: 1 });
    assert.equal(typeof voteClosedEvents[1]?.payload.closedAt, 'string');

    const session = await store.getSession(sessionId);
    assert.ok(session?.metadata.voteSnapshots?.verdict?.closedAt);
    assert.deepEqual(session?.metadata.voteSnapshots?.verdict?.votes, {
        guilty: 2,
    });
    assert.ok(session?.metadata.voteSnapshots?.sentence?.closedAt);
    assert.deepEqual(session?.metadata.voteSnapshots?.sentence?.votes, {
        Fine: 1,
    });
});

test('recordRecap stores recap turn ids and emits judge_recap_emitted', async () => {
    const { store, sessionId } = await createRunningSession();
    const recapEvents: CourtEvent[] = [];

    const unsubscribe = store.subscribe(sessionId, event => {
        if (event.type === 'judge_recap_emitted') {
            recapEvents.push(event);
        }
    });

    try {
        await store.setPhase(sessionId, 'openings');
        const recapTurn = await store.addTurn({
            sessionId,
            speaker: 'chora',
            role: 'judge',
            phase: 'openings',
            dialogue: 'Recap: The witness spilled the soup.',
        });

        await store.recordRecap({
            sessionId,
            turnId: recapTurn.id,
            phase: 'openings',
            cycleNumber: 2,
        });
    } finally {
        unsubscribe();
    }

    assert.equal(recapEvents.length, 1);
    const session = await store.getSession(sessionId);
    assert.deepEqual(session?.metadata.recapTurnIds, [
        recapEvents[0]?.payload.turnId,
    ]);
    assert.equal(recapEvents[0]?.payload.phase, 'openings');
    assert.equal(recapEvents[0]?.payload.cycleNumber, 2);
});

test(
    'postgres store persists final ruling when TEST_DATABASE_URL is provided',
    { skip: !process.env.TEST_DATABASE_URL },
    async () => {
        const previousDatabaseUrl = process.env.DATABASE_URL;
        process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
        try {
            const store = await createCourtSessionStore();
            const participants = AGENT_IDS.slice(0, 5);
            const session = await store.createSession({
                topic: 'Did the defendant replace all office coffee with soup?',
                participants,
                metadata: {
                    mode: 'juryrigged',
                    casePrompt:
                        'Did the defendant replace all office coffee with soup?',
                    caseType: 'criminal',
                    sentenceOptions: ['Fine', 'Community service'],
                    verdictVoteWindowMs: 10,
                    sentenceVoteWindowMs: 10,
                    verdictVotes: {},
                    sentenceVotes: {},
                    roleAssignments: assignCourtRoles(participants),
                },
            });
            await store.startSession(session.id);
            await store.recordFinalRuling({
                sessionId: session.id,
                verdict: 'guilty',
                sentence: 'Fine',
            });
            const reloaded = await store.getSession(session.id);
            assert.equal(reloaded?.metadata.finalRuling?.verdict, 'guilty');
            assert.equal(reloaded?.metadata.finalRuling?.sentence, 'Fine');
            assert.ok(reloaded?.metadata.finalRuling?.decidedAt);
        } finally {
            if (previousDatabaseUrl === undefined) {
                delete process.env.DATABASE_URL;
            } else {
                process.env.DATABASE_URL = previousDatabaseUrl;
            }
        }
    },
);

test('in-memory store returns empty list for restart recovery', async () => {
    const { store } = await createRunningSession();
    const recovered = await store.recoverInterruptedSessions();
    assert.equal(recovered.length, 0);
});

test(
    'postgres store returns running session IDs for restart recovery',
    { skip: !process.env.TEST_DATABASE_URL },
    async () => {
        const previousDatabaseUrl = process.env.DATABASE_URL;
        process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
        try {
            const store = await createCourtSessionStore();
            const participants = AGENT_IDS.slice(0, 5);

            // Create and start two sessions
            const session1 = await store.createSession({
                topic: 'Test case 1 for recovery',
                participants,
                metadata: {
                    mode: 'juryrigged',
                    casePrompt: 'Test case 1',
                    caseType: 'criminal',
                    sentenceOptions: ['Fine'],
                    verdictVoteWindowMs: 10,
                    sentenceVoteWindowMs: 10,
                    verdictVotes: {},
                    sentenceVotes: {},
                    roleAssignments: assignCourtRoles(participants),
                },
            });
            await store.startSession(session1.id);

            const session2 = await store.createSession({
                topic: 'Test case 2 for recovery',
                participants,
                metadata: {
                    mode: 'juryrigged',
                    casePrompt: 'Test case 2',
                    caseType: 'criminal',
                    sentenceOptions: ['Fine'],
                    verdictVoteWindowMs: 10,
                    sentenceVoteWindowMs: 10,
                    verdictVotes: {},
                    sentenceVotes: {},
                    roleAssignments: assignCourtRoles(participants),
                },
            });
            await store.startSession(session2.id);

            // Create but don't start a third session
            const session3 = await store.createSession({
                topic: 'Test case 3 for recovery',
                participants,
                metadata: {
                    mode: 'juryrigged',
                    casePrompt: 'Test case 3',
                    caseType: 'criminal',
                    sentenceOptions: ['Fine'],
                    verdictVoteWindowMs: 10,
                    sentenceVoteWindowMs: 10,
                    verdictVotes: {},
                    sentenceVotes: {},
                    roleAssignments: assignCourtRoles(participants),
                },
            });

            // Complete the first session
            await store.completeSession(session1.id);

            // Recovery should return only session2 (running, not completed)
            const recovered = await store.recoverInterruptedSessions();
            assert.equal(recovered.length, 1);
            assert.equal(recovered[0], session2.id);
        } finally {
            if (previousDatabaseUrl === undefined) {
                delete process.env.DATABASE_URL;
            } else {
                process.env.DATABASE_URL = previousDatabaseUrl;
            }
        }
    },
);
