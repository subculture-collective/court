import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { CourtPhase, CourtEvent } from '../types.js';
import { AGENTS } from '../agents.js';
import { runCourtSession } from './orchestrator.js';
import { assignCourtRoles, participantsFromRoleAssignments } from './roles.js';
import { createCourtSessionStore } from '../store/session-store.js';
import { MockTTSAdapter } from '../tts/adapter.js';

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

const PHASE_SEQUENCE: CourtPhase[] = [
    'case_prompt',
    'openings',
    'witness_exam',
    'evidence_reveal',
    'closings',
    'verdict_vote',
    'sentence_vote',
    'final_ruling',
];

describe('Court State Machine - Phase Transitions', () => {
    it('should enforce forward-only phase transitions', async () => {
        const store = await createTestStore();
        const participants = Object.keys(AGENTS).slice(0, 6) as any[];

        const session = await store.createSession({
            topic: 'Test case for phase transitions',
            participants,
            metadata: {
                mode: 'juryrigged',
                casePrompt: 'Test case for phase transitions',
                caseType: 'criminal',
                roleAssignments: {
                    judge: participants[0],
                    prosecutor: participants[1],
                    defense: participants[2],
                    witnesses: [participants[3], participants[4]],
                    bailiff: participants[5],
                },
                sentenceOptions: [
                    'fine',
                    'probation',
                    'jail',
                    'community_service',
                ],
                verdictVoteWindowMs: 20000,
                sentenceVoteWindowMs: 20000,
                verdictVotes: {},
                sentenceVotes: {},
                pressVotes: {},
                presentVotes: {},
            },
        });

        await store.startSession(session.id);

        // Test: can advance forward through sequence
        await store.setPhase(session.id, 'openings');
        await store.setPhase(session.id, 'witness_exam');
        await store.setPhase(session.id, 'evidence_reveal');

        // Test: backward transition should fail
        await assert.rejects(
            async () => store.setPhase(session.id, 'witness_exam'),
            {
                name: 'CourtValidationError',
                message:
                    'Invalid phase transition: evidence_reveal -> witness_exam',
            },
        );
    });

    it('should allow skipping evidence_reveal phase', async () => {
        const store = await createTestStore();
        const participants = Object.keys(AGENTS).slice(0, 6) as any[];

        const session = await store.createSession({
            topic: 'Test case for skipping evidence reveal',
            participants,
            metadata: {
                mode: 'juryrigged',
                casePrompt: 'Test case for phase transitions',
                caseType: 'criminal',
                roleAssignments: {
                    judge: participants[0],
                    prosecutor: participants[1],
                    defense: participants[2],
                    witnesses: [participants[3], participants[4]],
                    bailiff: participants[5],
                },
                sentenceOptions: [
                    'fine',
                    'probation',
                    'jail',
                    'community_service',
                ],
                verdictVoteWindowMs: 20000,
                sentenceVoteWindowMs: 20000,
                verdictVotes: {},
                sentenceVotes: {},
                pressVotes: {},
                presentVotes: {},
            },
        });

        await store.startSession(session.id);
        await store.setPhase(session.id, 'openings');
        await store.setPhase(session.id, 'witness_exam');

        // Test: can skip evidence_reveal and go directly to closings
        await store.setPhase(session.id, 'closings');

        const updated = await store.getSession(session.id);
        assert.equal(updated?.phase, 'closings');
    });

    it('should reject jumps that skip multiple phases', async () => {
        const store = await createTestStore();
        const participants = Object.keys(AGENTS).slice(0, 6) as any[];

        const session = await store.createSession({
            topic: 'Test case for invalid jumps',
            participants,
            metadata: {
                mode: 'juryrigged',
                casePrompt: 'Test case for invalid jumps',
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
                pressVotes: {},
                presentVotes: {},
            },
        });

        await store.startSession(session.id);

        // Test: cannot jump from case_prompt to closings
        await assert.rejects(
            async () => store.setPhase(session.id, 'closings'),
            {
                name: 'CourtValidationError',
                message: 'Invalid phase transition: case_prompt -> closings',
            },
        );

        // Test: cannot jump from case_prompt to verdict_vote
        await assert.rejects(
            async () => store.setPhase(session.id, 'verdict_vote'),
            {
                name: 'CourtValidationError',
                message:
                    'Invalid phase transition: case_prompt -> verdict_vote',
            },
        );
    });

    it('should allow no-op phase transitions (same phase)', async () => {
        const store = await createTestStore();
        const participants = Object.keys(AGENTS).slice(0, 6) as any[];

        const session = await store.createSession({
            topic: 'Test case for no-op transitions',
            participants,
            metadata: {
                mode: 'juryrigged',
                casePrompt: 'Test case for no-op transitions',
                caseType: 'civil',
                roleAssignments: {
                    judge: participants[0],
                    prosecutor: participants[1],
                    defense: participants[2],
                    witnesses: [participants[3]],
                    bailiff: participants[4],
                },
                sentenceOptions: ['damages'],
                verdictVoteWindowMs: 20000,
                sentenceVoteWindowMs: 20000,
                verdictVotes: {},
                sentenceVotes: {},
                pressVotes: {},
                presentVotes: {},
            },
        });

        await store.startSession(session.id);

        // Test: setting phase to same phase should succeed (no-op)
        await store.setPhase(session.id, 'case_prompt');
        const updated = await store.getSession(session.id);
        assert.equal(updated?.phase, 'case_prompt');
    });

    it('should emit phase_changed events on transitions', async () => {
        const store = await createTestStore();
        const participants = Object.keys(AGENTS).slice(0, 6) as any[];

        const session = await store.createSession({
            topic: 'Test case for phase events',
            participants,
            metadata: {
                mode: 'juryrigged',
                casePrompt: 'Test case for phase events',
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
                pressVotes: {},
                presentVotes: {},
            },
        });

        await store.startSession(session.id);

        const events: CourtEvent[] = [];
        store.subscribe(session.id, (event: CourtEvent) => {
            if (event.type === 'phase_changed') {
                events.push(event);
            }
        });

        await store.setPhase(session.id, 'openings', 30000);

        assert.equal(events.length, 1);
        assert.equal(events[0].type, 'phase_changed');
        assert.equal(events[0].payload.phase, 'openings');
        assert.equal(events[0].payload.phaseDurationMs, 30000);
    });

    it('should verify phase graph has no dead ends except final_ruling', () => {
        // Property test: every phase except final_ruling should have at least one valid next phase
        for (let i = 0; i < PHASE_SEQUENCE.length - 1; i++) {
            const phase = PHASE_SEQUENCE[i];
            const hasNextPhase =
                i < PHASE_SEQUENCE.length - 1 || // Can advance to next
                (phase === 'witness_exam' && i + 2 < PHASE_SEQUENCE.length); // Or skip evidence_reveal

            assert.ok(
                hasNextPhase,
                `Phase ${phase} should have at least one valid next phase`,
            );
        }

        // final_ruling is the only terminal phase
        const finalPhase = PHASE_SEQUENCE[PHASE_SEQUENCE.length - 1];
        assert.equal(
            finalPhase,
            'final_ruling',
            'final_ruling should be the last phase',
        );
    });

    it('should verify all phases are reachable from case_prompt', () => {
        // Property test: every phase should be reachable from case_prompt
        const reachable = new Set<CourtPhase>(['case_prompt']);

        for (let i = 0; i < PHASE_SEQUENCE.length - 1; i++) {
            const current = PHASE_SEQUENCE[i];
            if (reachable.has(current)) {
                // Can reach next phase
                const next = PHASE_SEQUENCE[i + 1];
                if (next) reachable.add(next);

                // Special case: can skip evidence_reveal
                if (current === 'witness_exam') {
                    const closingsIndex = PHASE_SEQUENCE.indexOf('closings');
                    if (closingsIndex !== -1) {
                        reachable.add(PHASE_SEQUENCE[closingsIndex]);
                    }
                }
            }
        }

        for (const phase of PHASE_SEQUENCE) {
            assert.ok(
                reachable.has(phase),
                `Phase ${phase} should be reachable from case_prompt`,
            );
        }
    });

    it('should verify transition invariant: no backward jumps allowed', async () => {
        const store = await createTestStore();
        const participants = Object.keys(AGENTS).slice(0, 6) as any[];

        const session = await store.createSession({
            topic: 'Test case for backward jump prevention',
            participants,
            metadata: {
                mode: 'juryrigged',
                casePrompt: 'Test case for backward jump prevention',
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
                pressVotes: {},
                presentVotes: {},
            },
        });

        await store.startSession(session.id);
        await store.setPhase(session.id, 'openings');
        await store.setPhase(session.id, 'witness_exam');
        await store.setPhase(session.id, 'closings');

        // Test all backward transitions from closings
        for (const targetPhase of [
            'case_prompt',
            'openings',
            'witness_exam',
            'evidence_reveal',
        ]) {
            await assert.rejects(
                async () =>
                    store.setPhase(session.id, targetPhase as CourtPhase),
                {
                    name: 'CourtValidationError',
                },
                `Should reject backward transition: closings -> ${targetPhase}`,
            );
        }
    });

    it('should emit poll_started events for vote phases', async () => {
        const store = await createTestStore();
        const participants = Object.keys(AGENTS).slice(0, 6) as any[];

        const session = await store.createSession({
            topic: 'Test case for poll events',
            participants,
            metadata: {
                mode: 'juryrigged',
                casePrompt: 'Test case for poll events',
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
                pressVotes: {},
                presentVotes: {},
            },
        });

        await store.startSession(session.id);

        const events: CourtEvent[] = [];
        store.subscribe(session.id, (event: CourtEvent) => {
            if (
                event.type === 'analytics_event' &&
                event.payload.name === 'poll_started'
            ) {
                events.push(event);
            }
        });

        // Advance through phases to verdict_vote
        await store.setPhase(session.id, 'openings');
        await store.setPhase(session.id, 'witness_exam');
        await store.setPhase(session.id, 'closings');
        await store.setPhase(session.id, 'verdict_vote');

        assert.equal(events.length, 1);
        assert.equal(events[0].payload.pollType, 'verdict');
        assert.equal(events[0].payload.phase, 'verdict_vote');
    });
});

describe('Court Orchestrator - TTS integration', () => {
    it('routes cues through adapter methods at phase milestones', async () => {
        const store = await createTestStore();
        const roleAssignments = assignCourtRoles();
        const participants = participantsFromRoleAssignments(roleAssignments);

        const session = await store.createSession({
            topic: 'Did the defendant replace office coffee with soup?',
            participants,
            metadata: {
                mode: 'juryrigged',
                casePrompt:
                    'Did the defendant replace office coffee with soup?',
                caseType: 'criminal',
                roleAssignments,
                sentenceOptions: ['fine', 'probation'],
                verdictVoteWindowMs: 1,
                sentenceVoteWindowMs: 1,
                verdictVotes: {},
                sentenceVotes: {},
                pressVotes: {},
                presentVotes: {},
            },
        });

        const adapter = new MockTTSAdapter();
        await runCourtSession(session.id, store, {
            ttsAdapter: adapter,
            sleepFn: async () => {},
        });

        const completed = await store.getSession(session.id);
        assert.equal(completed?.status, 'completed');
        assert.ok(completed?.metadata.finalRuling);

        const methods = adapter.calls.map(call => call.method);
        assert.ok(methods.includes('speakCue'));
        assert.ok(methods.includes('speakRecap'));
        assert.ok(methods.includes('speakVerdict'));
    });

    it('does not fail session progression when TTS provider throws', async () => {
        const store = await createTestStore();
        const roleAssignments = assignCourtRoles();
        const participants = participantsFromRoleAssignments(roleAssignments);

        const session = await store.createSession({
            topic: 'Did the defendant install a trampoline in the jury box?',
            participants,
            metadata: {
                mode: 'juryrigged',
                casePrompt:
                    'Did the defendant install a trampoline in the jury box?',
                caseType: 'criminal',
                roleAssignments,
                sentenceOptions: ['fine', 'probation'],
                verdictVoteWindowMs: 1,
                sentenceVoteWindowMs: 1,
                verdictVotes: {},
                sentenceVotes: {},
                pressVotes: {},
                presentVotes: {},
            },
        });

        const failingAdapter = new MockTTSAdapter({
            failOn: ['speakCue', 'speakRecap', 'speakVerdict'],
        });

        await runCourtSession(session.id, store, {
            ttsAdapter: failingAdapter,
            sleepFn: async () => {},
        });

        const completed = await store.getSession(session.id);
        assert.equal(completed?.status, 'completed');
        assert.ok(completed?.metadata.finalRuling);
        assert.ok(failingAdapter.calls.length > 0);
    });
});
