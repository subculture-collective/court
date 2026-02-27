import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { CourtEvent } from '../types.js';
import { createCourtSessionStore } from '../store/session-store.js';
import { AGENTS } from '../agents.js';

// Helper to create store with in-memory backend
async function createTestStore() {
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

// Helper to pick winner from vote tallies (same logic as orchestrator's bestOf)
function bestOf(votes: Record<string, number>, fallback: string): string {
    const entries = Object.entries(votes);
    if (entries.length === 0) return fallback;

    const sorted = [...entries].sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] ?? fallback;
}

describe('Vote Tally Logic', () => {
    it('should return choice with highest vote count', () => {
        const votes = {
            guilty: 15,
            not_guilty: 8,
        };

        const winner = bestOf(votes, 'not_guilty');
        assert.equal(winner, 'guilty');
    });

    it('should handle tie by selecting first sorted entry (deterministic)', () => {
        const votes = {
            guilty: 10,
            not_guilty: 10,
        };

        // With a tie, sort() will pick lexicographically first after sorting by count
        // Since both have count 10, the original order matters
        // Array.sort is stable, so 'guilty' comes first
        const winner = bestOf(votes, 'not_guilty');
        assert.ok(winner === 'guilty' || winner === 'not_guilty');
        // Determinism test: calling again should give same result
        const winner2 = bestOf(votes, 'not_guilty');
        assert.equal(winner, winner2);
    });

    it('should return fallback for empty vote counts', () => {
        const votes = {};
        const winner = bestOf(votes, 'not_guilty');
        assert.equal(winner, 'not_guilty');
    });

    it('should handle three-way tie deterministically', () => {
        const votes = {
            fine: 5,
            probation: 5,
            jail: 5,
        };

        const winner = bestOf(votes, 'fine');
        // Should be deterministic
        const winner2 = bestOf(votes, 'fine');
        assert.equal(winner, winner2);
    });

    it('should handle single choice', () => {
        const votes = {
            guilty: 1,
        };

        const winner = bestOf(votes, 'not_guilty');
        assert.equal(winner, 'guilty');
    });

    it('should prefer choice with even one more vote', () => {
        const votes = {
            liable: 11,
            not_liable: 10,
        };

        const winner = bestOf(votes, 'not_liable');
        assert.equal(winner, 'liable');
    });
});

describe('Vote Lifecycle Integration', () => {
    it('should accept votes during verdict_vote phase only', async () => {
        const store = await createTestStore();
        const participants = Object.keys(AGENTS).slice(0, 6) as any[];

        const session = await store.createSession({
            topic: 'Test case for vote phase gating',
            participants,
            metadata: {
                mode: 'juryrigged',
                casePrompt: 'Test case',
                caseType: 'criminal',
                roleAssignments: {
                    judge: participants[0],
                    prosecutor: participants[1],
                    defense: participants[2],
                    witnesses: [participants[3]],
                    bailiff: participants[4],
                },
                sentenceOptions: ['fine', 'probation'],
                verdictVoteWindowMs: 20000,
                sentenceVoteWindowMs: 20000,
                verdictVotes: {},
                sentenceVotes: {},
            },
        });

        await store.startSession(session.id);

        // Cannot vote during case_prompt
        await assert.rejects(
            async () =>
                store.castVote({
                    sessionId: session.id,
                    voteType: 'verdict',
                    choice: 'guilty',
                }),
            {
                name: 'CourtValidationError',
                message: 'Cannot cast verdict vote during phase case_prompt',
            },
        );

        // Advance to verdict_vote phase
        await store.setPhase(session.id, 'openings');
        await store.setPhase(session.id, 'witness_exam');
        await store.setPhase(session.id, 'closings');
        await store.setPhase(session.id, 'verdict_vote');

        // Now votes should be accepted
        await store.castVote({
            sessionId: session.id,
            voteType: 'verdict',
            choice: 'guilty',
        });

        const updated = await store.getSession(session.id);
        assert.equal(updated?.metadata.verdictVotes['guilty'], 1);
    });

    it('should accumulate votes for the same choice', async () => {
        const store = await createTestStore();
        const participants = Object.keys(AGENTS).slice(0, 6) as any[];

        const session = await store.createSession({
            topic: 'Test case for vote accumulation',
            participants,
            metadata: {
                mode: 'juryrigged',
                casePrompt: 'Test case',
                caseType: 'criminal',
                roleAssignments: {
                    judge: participants[0],
                    prosecutor: participants[1],
                    defense: participants[2],
                    witnesses: [participants[3]],
                    bailiff: participants[4],
                },
                sentenceOptions: ['fine', 'probation'],
                verdictVoteWindowMs: 20000,
                sentenceVoteWindowMs: 20000,
                verdictVotes: {},
                sentenceVotes: {},
            },
        });

        await store.startSession(session.id);
        await store.setPhase(session.id, 'openings');
        await store.setPhase(session.id, 'witness_exam');
        await store.setPhase(session.id, 'closings');
        await store.setPhase(session.id, 'verdict_vote');

        // Cast multiple votes for 'guilty'
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
            choice: 'guilty',
        });

        // Cast votes for 'not_guilty'
        await store.castVote({
            sessionId: session.id,
            voteType: 'verdict',
            choice: 'not_guilty',
        });

        const updated = await store.getSession(session.id);
        assert.equal(updated?.metadata.verdictVotes['guilty'], 3);
        assert.equal(updated?.metadata.verdictVotes['not_guilty'], 1);
    });

    it('should emit vote_updated event on each vote cast', async () => {
        const store = await createTestStore();
        const participants = Object.keys(AGENTS).slice(0, 6) as any[];

        const session = await store.createSession({
            topic: 'Test case for vote events',
            participants,
            metadata: {
                mode: 'juryrigged',
                casePrompt: 'Test case',
                caseType: 'criminal',
                roleAssignments: {
                    judge: participants[0],
                    prosecutor: participants[1],
                    defense: participants[2],
                    witnesses: [participants[3]],
                    bailiff: participants[4],
                },
                sentenceOptions: ['fine'],
                verdictVoteWindowMs: 20000,
                sentenceVoteWindowMs: 20000,
                verdictVotes: {},
                sentenceVotes: {},
            },
        });

        await store.startSession(session.id);
        await store.setPhase(session.id, 'openings');
        await store.setPhase(session.id, 'witness_exam');
        await store.setPhase(session.id, 'closings');
        await store.setPhase(session.id, 'verdict_vote');

        const events: CourtEvent[] = [];
        store.subscribe(session.id, (event: CourtEvent) => {
            if (event.type === 'vote_updated') {
                events.push(event);
            }
        });

        await store.castVote({
            sessionId: session.id,
            voteType: 'verdict',
            choice: 'guilty',
        });

        assert.equal(events.length, 1);
        assert.equal(events[0].type, 'vote_updated');
        assert.equal(events[0].payload.voteType, 'verdict');
        assert.equal(events[0].payload.choice, 'guilty');
        assert.ok(events[0].payload.verdictVotes);
    });

    it('should reject invalid verdict choices', async () => {
        const store = await createTestStore();
        const participants = Object.keys(AGENTS).slice(0, 6) as any[];

        const session = await store.createSession({
            topic: 'Test case for invalid choices',
            participants,
            metadata: {
                mode: 'juryrigged',
                casePrompt: 'Test case',
                caseType: 'criminal',
                roleAssignments: {
                    judge: participants[0],
                    prosecutor: participants[1],
                    defense: participants[2],
                    witnesses: [participants[3]],
                    bailiff: participants[4],
                },
                sentenceOptions: ['fine'],
                verdictVoteWindowMs: 20000,
                sentenceVoteWindowMs: 20000,
                verdictVotes: {},
                sentenceVotes: {},
            },
        });

        await store.startSession(session.id);
        await store.setPhase(session.id, 'openings');
        await store.setPhase(session.id, 'witness_exam');
        await store.setPhase(session.id, 'closings');
        await store.setPhase(session.id, 'verdict_vote');

        await assert.rejects(
            async () =>
                store.castVote({
                    sessionId: session.id,
                    voteType: 'verdict',
                    choice: 'super_guilty',
                }),
            {
                name: 'CourtValidationError',
                message: /Invalid verdict choice/,
            },
        );
    });

    it('should reject invalid sentence choices', async () => {
        const store = await createTestStore();
        const participants = Object.keys(AGENTS).slice(0, 6) as any[];

        const session = await store.createSession({
            topic: 'Test case for invalid sentence',
            participants,
            metadata: {
                mode: 'juryrigged',
                casePrompt: 'Test case',
                caseType: 'criminal',
                roleAssignments: {
                    judge: participants[0],
                    prosecutor: participants[1],
                    defense: participants[2],
                    witnesses: [participants[3]],
                    bailiff: participants[4],
                },
                sentenceOptions: ['fine', 'probation'],
                verdictVoteWindowMs: 20000,
                sentenceVoteWindowMs: 20000,
                verdictVotes: {},
                sentenceVotes: {},
            },
        });

        await store.startSession(session.id);
        await store.setPhase(session.id, 'openings');
        await store.setPhase(session.id, 'witness_exam');
        await store.setPhase(session.id, 'closings');
        await store.setPhase(session.id, 'verdict_vote');
        await store.setPhase(session.id, 'sentence_vote');

        await assert.rejects(
            async () =>
                store.castVote({
                    sessionId: session.id,
                    voteType: 'sentence',
                    choice: 'death_penalty',
                }),
            {
                name: 'CourtValidationError',
                message: /Invalid sentence choice/,
            },
        );
    });

    it('should handle sentence votes independently from verdict votes', async () => {
        const store = await createTestStore();
        const participants = Object.keys(AGENTS).slice(0, 6) as any[];

        const session = await store.createSession({
            topic: 'Test case for sentence voting',
            participants,
            metadata: {
                mode: 'juryrigged',
                casePrompt: 'Test case',
                caseType: 'criminal',
                roleAssignments: {
                    judge: participants[0],
                    prosecutor: participants[1],
                    defense: participants[2],
                    witnesses: [participants[3]],
                    bailiff: participants[4],
                },
                sentenceOptions: ['fine', 'probation', 'jail'],
                verdictVoteWindowMs: 20000,
                sentenceVoteWindowMs: 20000,
                verdictVotes: {},
                sentenceVotes: {},
            },
        });

        await store.startSession(session.id);
        await store.setPhase(session.id, 'openings');
        await store.setPhase(session.id, 'witness_exam');
        await store.setPhase(session.id, 'closings');
        await store.setPhase(session.id, 'verdict_vote');
        await store.setPhase(session.id, 'sentence_vote');

        await store.castVote({
            sessionId: session.id,
            voteType: 'sentence',
            choice: 'probation',
        });
        await store.castVote({
            sessionId: session.id,
            voteType: 'sentence',
            choice: 'fine',
        });
        await store.castVote({
            sessionId: session.id,
            voteType: 'sentence',
            choice: 'probation',
        });

        const updated = await store.getSession(session.id);
        assert.equal(updated?.metadata.sentenceVotes['probation'], 2);
        assert.equal(updated?.metadata.sentenceVotes['fine'], 1);
        // Verdict votes should still be empty
        assert.equal(
            Object.keys(updated?.metadata.verdictVotes ?? {}).length,
            0,
        );
    });
});
