import test from 'node:test';
import assert from 'node:assert/strict';
import { moderateContent } from './content-filter.js';
import { VoteSpamGuard } from './vote-spam.js';
import { screenPromptForSession } from '../court/prompt-bank.js';
import type { PromptBankEntry } from '../types.js';

test('prompt screening blocks unsafe prompt entries', () => {
    const unsafePrompt: PromptBankEntry = {
        id: 'unsafe-1',
        genre: 'absurd_civil',
        casePrompt: 'The witness called them a faggot during testimony.',
        caseType: 'civil',
        active: true,
    };

    const result = screenPromptForSession(unsafePrompt);
    assert.equal(result.allowed, false);
    assert.ok(result.reasons.includes('slur'));
});

test('prompt screening allows safe prompt entries', () => {
    const safePrompt: PromptBankEntry = {
        id: 'safe-1',
        genre: 'fantasy_court',
        casePrompt:
            'A wizard is accused of enchanting a coffee machine to serve espresso with opinions.',
        caseType: 'criminal',
        active: true,
    };

    const result = screenPromptForSession(safePrompt);
    assert.equal(result.allowed, true);
    assert.deepEqual(result.reasons, []);
});

test('witness output moderation redacts unsafe content', () => {
    const result = moderateContent('They threatened to doxx the jurors.');
    assert.equal(result.flagged, true);
    assert.ok(result.reasons.includes('harassment'));
    assert.ok(result.sanitized.includes('redacted'));
});

test('vote spam guard blocks duplicate votes within window', () => {
    const guard = new VoteSpamGuard({
        maxVotesPerWindow: 10,
        windowMs: 60_000,
        duplicateWindowMs: 60_000,
    });

    const first = guard.check('session-1', '127.0.0.1', 'verdict', 'guilty');
    const second = guard.check('session-1', '127.0.0.1', 'verdict', 'guilty');

    assert.equal(first.allowed, true);
    assert.equal(second.allowed, false);
    assert.equal(second.reason, 'duplicate_vote');
});
