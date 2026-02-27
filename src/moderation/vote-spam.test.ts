import test from 'node:test';
import assert from 'node:assert/strict';
import { VoteSpamGuard } from './vote-spam.js';

test('allows votes under the rate limit', () => {
    const guard = new VoteSpamGuard({ maxVotesPerWindow: 3, windowMs: 60_000 });
    assert.equal(guard.check('session-1', '127.0.0.1'), true);
    assert.equal(guard.check('session-1', '127.0.0.1'), true);
    assert.equal(guard.check('session-1', '127.0.0.1'), true);
});

test('blocks votes exceeding the rate limit', () => {
    const guard = new VoteSpamGuard({ maxVotesPerWindow: 2, windowMs: 60_000 });
    assert.equal(guard.check('session-1', '127.0.0.1'), true);
    assert.equal(guard.check('session-1', '127.0.0.1'), true);
    assert.equal(guard.check('session-1', '127.0.0.1'), false);
});

test('tracks different IPs independently', () => {
    const guard = new VoteSpamGuard({ maxVotesPerWindow: 1, windowMs: 60_000 });
    assert.equal(guard.check('session-1', '127.0.0.1'), true);
    assert.equal(guard.check('session-1', '127.0.0.2'), true);
    assert.equal(guard.check('session-1', '127.0.0.1'), false);
    assert.equal(guard.check('session-1', '127.0.0.2'), false);
});

test('tracks different sessions independently', () => {
    const guard = new VoteSpamGuard({ maxVotesPerWindow: 1, windowMs: 60_000 });
    assert.equal(guard.check('session-1', '127.0.0.1'), true);
    assert.equal(guard.check('session-2', '127.0.0.1'), true);
    assert.equal(guard.check('session-1', '127.0.0.1'), false);
});

test('prune removes stale entries', () => {
    const guard = new VoteSpamGuard({ maxVotesPerWindow: 1, windowMs: 1 });
    assert.equal(guard.check('session-1', '127.0.0.1'), true);

    // Wait for the tiny window to expire then prune
    const start = Date.now();
    while (Date.now() - start < 5) {
        /* busy-wait past the 1ms window */
    }

    guard.prune();
    // After prune, should be allowed again
    assert.equal(guard.check('session-1', '127.0.0.1'), true);
});

test('uses default config when none provided', () => {
    const guard = new VoteSpamGuard();
    // Default is 10 votes per 60s - should allow several votes
    for (let i = 0; i < 10; i++) {
        assert.equal(guard.check('session-1', '10.0.0.1'), true);
    }
    assert.equal(guard.check('session-1', '10.0.0.1'), false);
});
