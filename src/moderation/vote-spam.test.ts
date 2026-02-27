import test from 'node:test';
import assert from 'node:assert/strict';
import { VoteSpamGuard } from './vote-spam.js';

test('allows votes under the rate limit', () => {
    const guard = new VoteSpamGuard({
        maxVotesPerWindow: 3,
        windowMs: 60_000,
        duplicateWindowMs: 0,
    });
    assert.equal(
        guard.check('session-1', '127.0.0.1', 'verdict', 'guilty').allowed,
        true,
    );
    assert.equal(
        guard.check('session-1', '127.0.0.1', 'verdict', 'guilty').allowed,
        true,
    );
    assert.equal(
        guard.check('session-1', '127.0.0.1', 'verdict', 'guilty').allowed,
        true,
    );
});

test('blocks votes exceeding the rate limit', () => {
    const guard = new VoteSpamGuard({
        maxVotesPerWindow: 2,
        windowMs: 60_000,
        duplicateWindowMs: 0,
    });
    assert.equal(
        guard.check('session-1', '127.0.0.1', 'verdict', 'guilty').allowed,
        true,
    );
    assert.equal(
        guard.check('session-1', '127.0.0.1', 'verdict', 'guilty').allowed,
        true,
    );
    const decision = guard.check(
        'session-1',
        '127.0.0.1',
        'verdict',
        'guilty',
    );
    assert.equal(decision.allowed, false);
    assert.equal(decision.reason, 'rate_limited');
});

test('blocks duplicate votes within the duplicate window', () => {
    const guard = new VoteSpamGuard({
        maxVotesPerWindow: 10,
        windowMs: 60_000,
        duplicateWindowMs: 60_000,
    });
    assert.equal(
        guard.check('session-1', '127.0.0.1', 'verdict', 'guilty').allowed,
        true,
    );
    const decision = guard.check(
        'session-1',
        '127.0.0.1',
        'verdict',
        'guilty',
    );
    assert.equal(decision.allowed, false);
    assert.equal(decision.reason, 'duplicate_vote');
});

test('tracks different IPs independently', () => {
    const guard = new VoteSpamGuard({
        maxVotesPerWindow: 1,
        windowMs: 60_000,
        duplicateWindowMs: 0,
    });
    assert.equal(
        guard.check('session-1', '127.0.0.1', 'verdict', 'guilty').allowed,
        true,
    );
    assert.equal(
        guard.check('session-1', '127.0.0.2', 'verdict', 'guilty').allowed,
        true,
    );
    assert.equal(
        guard.check('session-1', '127.0.0.1', 'verdict', 'guilty').allowed,
        false,
    );
    assert.equal(
        guard.check('session-1', '127.0.0.2', 'verdict', 'guilty').allowed,
        false,
    );
});

test('tracks different sessions independently', () => {
    const guard = new VoteSpamGuard({
        maxVotesPerWindow: 1,
        windowMs: 60_000,
        duplicateWindowMs: 0,
    });
    assert.equal(
        guard.check('session-1', '127.0.0.1', 'verdict', 'guilty').allowed,
        true,
    );
    assert.equal(
        guard.check('session-2', '127.0.0.1', 'verdict', 'guilty').allowed,
        true,
    );
    assert.equal(
        guard.check('session-1', '127.0.0.1', 'verdict', 'guilty').allowed,
        false,
    );
});

test('prune removes stale entries', () => {
    const guard = new VoteSpamGuard({
        maxVotesPerWindow: 1,
        windowMs: 1,
        duplicateWindowMs: 1,
    });
    assert.equal(
        guard.check('session-1', '127.0.0.1', 'verdict', 'guilty').allowed,
        true,
    );

    // Wait for the tiny window to expire then prune
    const start = Date.now();
    while (Date.now() - start < 5) {
        /* busy-wait past the 1ms window */
    }

    guard.prune();
    // After prune, should be allowed again
    assert.equal(
        guard.check('session-1', '127.0.0.1', 'verdict', 'guilty').allowed,
        true,
    );
});

test('uses default config when none provided', () => {
    const guard = new VoteSpamGuard();
    // Default is 10 votes per 60s - should allow several votes
    for (let i = 0; i < 10; i++) {
        const decision = guard.check(
            'session-1',
            '10.0.0.1',
            'verdict',
            `choice-${i}`,
        );
        assert.equal(decision.allowed, true);
    }
    const blocked = guard.check(
        'session-1',
        '10.0.0.1',
        'verdict',
        'choice-11',
    );
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.reason, 'rate_limited');
});
