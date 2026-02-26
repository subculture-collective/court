import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_IDS } from '../agents.js';
import { assignCourtRoles } from '../court/roles.js';
import { createCourtSessionStore } from './session-store.js';

async function createRunningSession() {
    process.env.DATABASE_URL = '';
    const store = await createCourtSessionStore();
    const participants = AGENT_IDS.slice(0, 5);
    const session = await store.createSession({
        topic: 'Did the defendant replace all office coffee with soup?',
        participants,
        metadata: {
            mode: 'improv_court',
            casePrompt: 'Did the defendant replace all office coffee with soup?',
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
