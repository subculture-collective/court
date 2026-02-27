import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_IDS } from './agents.js';
import { assignCourtRoles } from './court/roles.js';
import { runCourtSession } from './court/orchestrator.js';
import { MockTTSAdapter } from './tts/adapter.js';
import { createCourtSessionStore } from './store/session-store.js';
import type { CourtEvent } from './types.js';

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

test('e2e round completes with witness caps and recap cadence', async () => {
    const previousCapTokens = process.env.WITNESS_MAX_TOKENS;
    const previousCapSeconds = process.env.WITNESS_MAX_SECONDS;
    const previousCadence = process.env.JUDGE_RECAP_CADENCE;

    process.env.WITNESS_MAX_TOKENS = '5';
    process.env.WITNESS_MAX_SECONDS = '999';
    process.env.JUDGE_RECAP_CADENCE = '2';

    try {
        const store = await createInMemoryStore();
        const participants = AGENT_IDS;
        const session = await store.createSession({
            topic: 'Did the defendant replace all office coffee with soup?',
            participants,
            metadata: {
                mode: 'improv_court',
                casePrompt:
                    'Did the defendant replace all office coffee with soup?',
                caseType: 'criminal',
                roleAssignments: assignCourtRoles(participants),
                sentenceOptions: ['Fine', 'Community service'],
                verdictVoteWindowMs: 1,
                sentenceVoteWindowMs: 1,
                verdictVotes: {},
                sentenceVotes: {},
            },
        });

        const recapEvents: CourtEvent[] = [];
        const capEvents: CourtEvent[] = [];
        const unsubscribe = store.subscribe(session.id, event => {
            if (event.type === 'judge_recap_emitted') {
                recapEvents.push(event);
            }
            if (event.type === 'witness_response_capped') {
                capEvents.push(event);
            }
        });

        const voteFlags = { verdict: false, sentence: false };
        const sleepFn = async () => {
            const current = await store.getSession(session.id);
            if (!current) return;

            if (current.phase === 'verdict_vote' && !voteFlags.verdict) {
                await store.castVote({
                    sessionId: session.id,
                    voteType: 'verdict',
                    choice: 'guilty',
                });
                await store.castVote({
                    sessionId: session.id,
                    voteType: 'verdict',
                    choice: 'guilty',
                });
                await store.castVote({
                    sessionId: session.id,
                    voteType: 'verdict',
                    choice: 'not_guilty',
                });
                voteFlags.verdict = true;
            }

            if (current.phase === 'sentence_vote' && !voteFlags.sentence) {
                await store.castVote({
                    sessionId: session.id,
                    voteType: 'sentence',
                    choice: 'Fine',
                });
                voteFlags.sentence = true;
            }
        };

        await runCourtSession(session.id, store, {
            ttsAdapter: new MockTTSAdapter(),
            sleepFn,
        });

        unsubscribe();

        const completed = await store.getSession(session.id);
        assert.equal(completed?.status, 'completed');
        assert.equal(completed?.metadata.finalRuling?.verdict, 'guilty');
        assert.ok((completed?.metadata.recapTurnIds ?? []).length >= 1);
        assert.ok(recapEvents.length >= 1);
        assert.ok(capEvents.length >= 1);
    } finally {
        if (previousCapTokens === undefined) {
            delete process.env.WITNESS_MAX_TOKENS;
        } else {
            process.env.WITNESS_MAX_TOKENS = previousCapTokens;
        }
        if (previousCapSeconds === undefined) {
            delete process.env.WITNESS_MAX_SECONDS;
        } else {
            process.env.WITNESS_MAX_SECONDS = previousCapSeconds;
        }
        if (previousCadence === undefined) {
            delete process.env.JUDGE_RECAP_CADENCE;
        } else {
            process.env.JUDGE_RECAP_CADENCE = previousCadence;
        }
    }
});
