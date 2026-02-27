import test from 'node:test';
import assert from 'node:assert/strict';
import { assertEventPayload } from './events.js';
import type { CourtEvent } from './types.js';

function makeEvent(
    type: CourtEvent['type'],
    payload: Record<string, unknown>,
): CourtEvent {
    return {
        id: 'test-id',
        sessionId: 'sess-1',
        type,
        at: new Date().toISOString(),
        payload,
    };
}

// ---------------------------------------------------------------------------
// Valid payload tests
// ---------------------------------------------------------------------------

test('assertEventPayload: session_created valid', () => {
    assert.doesNotThrow(() =>
        assertEventPayload(makeEvent('session_created', { sessionId: 'abc' })),
    );
});

test('assertEventPayload: session_started valid', () => {
    assert.doesNotThrow(() =>
        assertEventPayload(
            makeEvent('session_started', {
                sessionId: 'abc',
                startedAt: new Date().toISOString(),
            }),
        ),
    );
});

test('assertEventPayload: phase_changed valid', () => {
    assert.doesNotThrow(() =>
        assertEventPayload(
            makeEvent('phase_changed', {
                phase: 'openings',
                phaseStartedAt: new Date().toISOString(),
                phaseDurationMs: 30_000,
            }),
        ),
    );
});

test('assertEventPayload: turn valid', () => {
    assert.doesNotThrow(() =>
        assertEventPayload(
            makeEvent('turn', {
                turn: {
                    id: 't1',
                    sessionId: 'sess-1',
                    turnNumber: 0,
                    speaker: 'chora',
                    role: 'judge',
                    phase: 'openings',
                    dialogue: 'All rise.',
                    createdAt: new Date().toISOString(),
                },
            }),
        ),
    );
});

test('assertEventPayload: vote_updated valid', () => {
    assert.doesNotThrow(() =>
        assertEventPayload(
            makeEvent('vote_updated', {
                voteType: 'verdict',
                choice: 'guilty',
                verdictVotes: { guilty: 1 },
                sentenceVotes: {},
            }),
        ),
    );
});

test('assertEventPayload: vote_closed valid', () => {
    assert.doesNotThrow(() =>
        assertEventPayload(
            makeEvent('vote_closed', {
                pollType: 'verdict',
                closedAt: new Date().toISOString(),
                votes: { guilty: 3, not_guilty: 2 },
                nextPhase: 'sentence_vote',
            }),
        ),
    );
});

test('assertEventPayload: witness_response_capped valid', () => {
    assert.doesNotThrow(() =>
        assertEventPayload(
            makeEvent('witness_response_capped', {
                turnId: 'turn-1',
                speaker: 'chora',
                phase: 'witness_exam',
                originalLength: 180,
                truncatedLength: 120,
                reason: 'tokens',
            }),
        ),
    );
});

test('assertEventPayload: judge_recap_emitted valid', () => {
    assert.doesNotThrow(() =>
        assertEventPayload(
            makeEvent('judge_recap_emitted', {
                turnId: 'turn-2',
                phase: 'witness_exam',
                cycleNumber: 2,
            }),
        ),
    );
});

test('assertEventPayload: analytics_event poll_started valid', () => {
    assert.doesNotThrow(() =>
        assertEventPayload(
            makeEvent('analytics_event', {
                name: 'poll_started',
                pollType: 'verdict',
                phase: 'verdict_vote',
            }),
        ),
    );
});

test('assertEventPayload: analytics_event vote_completed valid', () => {
    assert.doesNotThrow(() =>
        assertEventPayload(
            makeEvent('analytics_event', {
                name: 'vote_completed',
                pollType: 'verdict',
                choice: 'guilty',
            }),
        ),
    );
});

test('assertEventPayload: analytics_event poll_closed valid', () => {
    assert.doesNotThrow(() =>
        assertEventPayload(
            makeEvent('analytics_event', {
                name: 'poll_closed',
                pollType: 'verdict',
                phase: 'sentence_vote',
            }),
        ),
    );
});

test('assertEventPayload: moderation_action valid', () => {
    assert.doesNotThrow(() =>
        assertEventPayload(
            makeEvent('moderation_action', {
                turnId: 't1',
                speaker: 'mux',
                reasons: ['hate_speech'],
                phase: 'openings',
            }),
        ),
    );
});

test('assertEventPayload: vote_spam_blocked valid', () => {
    assert.doesNotThrow(() =>
        assertEventPayload(
            makeEvent('vote_spam_blocked', {
                ip: '127.0.0.1',
                voteType: 'verdict',
            }),
        ),
    );
});

test('assertEventPayload: session_completed valid', () => {
    assert.doesNotThrow(() =>
        assertEventPayload(
            makeEvent('session_completed', {
                sessionId: 'abc',
                completedAt: new Date().toISOString(),
            }),
        ),
    );
});

test('assertEventPayload: session_failed valid', () => {
    assert.doesNotThrow(() =>
        assertEventPayload(
            makeEvent('session_failed', {
                sessionId: 'abc',
                reason: 'LLM timeout',
                completedAt: new Date().toISOString(),
            }),
        ),
    );
});

// ---------------------------------------------------------------------------
// Invalid payload tests
// ---------------------------------------------------------------------------

test('assertEventPayload: session_created missing sessionId', () => {
    assert.throws(
        () => assertEventPayload(makeEvent('session_created', {})),
        TypeError,
    );
});

test('assertEventPayload: session_started missing startedAt', () => {
    assert.throws(
        () =>
            assertEventPayload(
                makeEvent('session_started', { sessionId: 'abc' }),
            ),
        TypeError,
    );
});

test('assertEventPayload: phase_changed missing phase', () => {
    assert.throws(
        () =>
            assertEventPayload(
                makeEvent('phase_changed', {
                    phaseStartedAt: new Date().toISOString(),
                }),
            ),
        TypeError,
    );
});

test('assertEventPayload: turn missing turn object', () => {
    assert.throws(
        () => assertEventPayload(makeEvent('turn', { turn: 'not-an-object' })),
        TypeError,
    );
});

test('assertEventPayload: turn rejects array as turn value', () => {
    assert.throws(
        () => assertEventPayload(makeEvent('turn', { turn: [] })),
        TypeError,
    );
});

test('assertEventPayload: vote_updated missing verdictVotes', () => {
    assert.throws(
        () =>
            assertEventPayload(
                makeEvent('vote_updated', {
                    voteType: 'verdict',
                    choice: 'guilty',
                    sentenceVotes: {},
                }),
            ),
        TypeError,
    );
});

test('assertEventPayload: vote_closed missing votes', () => {
    assert.throws(
        () =>
            assertEventPayload(
                makeEvent('vote_closed', {
                    pollType: 'verdict',
                    closedAt: new Date().toISOString(),
                    nextPhase: 'sentence_vote',
                }),
            ),
        TypeError,
    );
});

test('assertEventPayload: witness_response_capped missing turnId', () => {
    assert.throws(
        () =>
            assertEventPayload(
                makeEvent('witness_response_capped', {
                    speaker: 'chora',
                    phase: 'witness_exam',
                    originalLength: 180,
                    truncatedLength: 120,
                    reason: 'tokens',
                }),
            ),
        TypeError,
    );
});

test('assertEventPayload: judge_recap_emitted missing cycleNumber', () => {
    assert.throws(
        () =>
            assertEventPayload(
                makeEvent('judge_recap_emitted', {
                    turnId: 'turn-2',
                    phase: 'witness_exam',
                }),
            ),
        TypeError,
    );
});

test('assertEventPayload: analytics_event missing pollType', () => {
    assert.throws(
        () =>
            assertEventPayload(
                makeEvent('analytics_event', { name: 'poll_started' }),
            ),
        TypeError,
    );
});

test('assertEventPayload: moderation_action missing reasons array', () => {
    assert.throws(
        () =>
            assertEventPayload(
                makeEvent('moderation_action', {
                    turnId: 't1',
                    speaker: 'mux',
                    phase: 'openings',
                }),
            ),
        TypeError,
    );
});

test('assertEventPayload: vote_spam_blocked missing ip', () => {
    assert.throws(
        () =>
            assertEventPayload(
                makeEvent('vote_spam_blocked', { voteType: 'verdict' }),
            ),
        TypeError,
    );
});

test('assertEventPayload: session_completed missing completedAt', () => {
    assert.throws(
        () =>
            assertEventPayload(
                makeEvent('session_completed', { sessionId: 'abc' }),
            ),
        TypeError,
    );
});

test('assertEventPayload: session_failed missing reason', () => {
    assert.throws(
        () =>
            assertEventPayload(
                makeEvent('session_failed', {
                    sessionId: 'abc',
                    completedAt: new Date().toISOString(),
                }),
            ),
        TypeError,
    );
});
