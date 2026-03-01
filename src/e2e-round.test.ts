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
    const previousJudgeCap = process.env.ROLE_MAX_TOKENS_JUDGE;
    const previousProsecutorCap = process.env.ROLE_MAX_TOKENS_PROSECUTOR;
    const previousDefenseCap = process.env.ROLE_MAX_TOKENS_DEFENSE;
    const previousWitnessCap = process.env.ROLE_MAX_TOKENS_WITNESS;
    const previousCostPer1k = process.env.TOKEN_COST_PER_1K_USD;

    process.env.WITNESS_MAX_TOKENS = '5';
    process.env.WITNESS_MAX_SECONDS = '999';
    process.env.JUDGE_RECAP_CADENCE = '2';
    process.env.ROLE_MAX_TOKENS_JUDGE = '18';
    process.env.ROLE_MAX_TOKENS_PROSECUTOR = '20';
    process.env.ROLE_MAX_TOKENS_DEFENSE = '20';
    process.env.ROLE_MAX_TOKENS_WITNESS = '12';
    process.env.TOKEN_COST_PER_1K_USD = '0.002';

    try {
        const store = await createInMemoryStore();
        const participants = AGENT_IDS;
        const session = await store.createSession({
            topic: 'Did the defendant replace all office coffee with soup?',
            participants,
            metadata: {
                mode: 'juryrigged',
                casePrompt:
                    'Did the defendant replace all office coffee with soup?',
                caseType: 'criminal',
                roleAssignments: assignCourtRoles(participants),
                sentenceOptions: ['Fine', 'Community service'],
                verdictVoteWindowMs: 1,
                sentenceVoteWindowMs: 1,
                verdictVotes: {},
                sentenceVotes: {},
                pressVotes: {},
                presentVotes: {},
            },
        });

        const recapEvents: CourtEvent[] = [];
        const capEvents: CourtEvent[] = [];
        const tokenBudgetEvents: CourtEvent[] = [];
        const tokenEstimateEvents: CourtEvent[] = [];
        const unsubscribe = store.subscribe(session.id, event => {
            if (event.type === 'judge_recap_emitted') {
                recapEvents.push(event);
            }
            if (event.type === 'witness_response_capped') {
                capEvents.push(event);
            }
            if (event.type === 'token_budget_applied') {
                tokenBudgetEvents.push(event);
            }
            if (event.type === 'session_token_estimate') {
                tokenEstimateEvents.push(event);
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
        assert.ok(tokenBudgetEvents.length >= 1);
        assert.ok(tokenEstimateEvents.length >= 1);

        const judgeBudgetEvent = tokenBudgetEvents.find(
            event => event.payload.role === 'judge',
        );
        assert.ok(judgeBudgetEvent);
        assert.equal(judgeBudgetEvent?.payload.appliedMaxTokens, 18);

        const lastTokenEstimate =
            tokenEstimateEvents[tokenEstimateEvents.length - 1];
        assert.ok(lastTokenEstimate);
        assert.equal(
            typeof lastTokenEstimate?.payload.cumulativeEstimatedTokens,
            'number',
        );
        assert.equal(
            typeof lastTokenEstimate?.payload.estimatedCostUsd,
            'number',
        );
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
        if (previousJudgeCap === undefined) {
            delete process.env.ROLE_MAX_TOKENS_JUDGE;
        } else {
            process.env.ROLE_MAX_TOKENS_JUDGE = previousJudgeCap;
        }
        if (previousProsecutorCap === undefined) {
            delete process.env.ROLE_MAX_TOKENS_PROSECUTOR;
        } else {
            process.env.ROLE_MAX_TOKENS_PROSECUTOR = previousProsecutorCap;
        }
        if (previousDefenseCap === undefined) {
            delete process.env.ROLE_MAX_TOKENS_DEFENSE;
        } else {
            process.env.ROLE_MAX_TOKENS_DEFENSE = previousDefenseCap;
        }
        if (previousWitnessCap === undefined) {
            delete process.env.ROLE_MAX_TOKENS_WITNESS;
        } else {
            process.env.ROLE_MAX_TOKENS_WITNESS = previousWitnessCap;
        }
        if (previousCostPer1k === undefined) {
            delete process.env.TOKEN_COST_PER_1K_USD;
        } else {
            process.env.TOKEN_COST_PER_1K_USD = previousCostPer1k;
        }
    }
});
