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
        // Even when rng fires everything, only one event is returned
        const result = checkRandomEvent(() => 0.0);
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
