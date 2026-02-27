import test from 'node:test';
import assert from 'node:assert/strict';
import {
    applyWitnessCap,
    estimateTokens,
    resolveWitnessCapConfig,
} from './witness-caps.js';

test('estimateTokens counts words', () => {
    assert.equal(estimateTokens(''), 0);
    assert.equal(estimateTokens('one two three'), 3);
    assert.equal(estimateTokens(' spaced   words  '), 2);
});

test('applyWitnessCap truncates when maxTokens exceeded', () => {
    const text = 'one two three four five six seven';
    const result = applyWitnessCap(text, {
        maxTokens: 5,
        maxSeconds: 0,
        tokensPerSecond: 3,
        truncationMarker: '[cut off]'.trim(),
    });

    assert.equal(result.capped, true);
    assert.equal(result.originalTokens, 7);
    assert.equal(result.truncatedTokens, 5);
    assert.equal(result.reason, 'tokens');
    assert.match(result.text, /\[cut off\]$/);
});

test('applyWitnessCap respects maxSeconds when stricter than maxTokens', () => {
    const text = 'one two three four five';
    const result = applyWitnessCap(text, {
        maxTokens: 10,
        maxSeconds: 1,
        tokensPerSecond: 2,
        truncationMarker: '[cut off]'.trim(),
    });

    assert.equal(result.capped, true);
    assert.equal(result.truncatedTokens, 2);
    assert.equal(result.reason, 'seconds');
});

test('applyWitnessCap returns original text when under limits', () => {
    const text = 'short response';
    const result = applyWitnessCap(text, {
        maxTokens: 50,
        maxSeconds: 0,
        tokensPerSecond: 3,
        truncationMarker: '[cut off]'.trim(),
    });

    assert.equal(result.capped, false);
    assert.equal(result.text, text);
});

test('resolveWitnessCapConfig falls back to defaults on invalid values', () => {
    const config = resolveWitnessCapConfig({
        WITNESS_MAX_TOKENS: 'not-a-number',
        WITNESS_MAX_SECONDS: '-1',
        WITNESS_TOKENS_PER_SECOND: '0',
        WITNESS_TRUNCATION_MARKER: '!!!',
    });

    assert.equal(config.maxTokens, 150);
    assert.equal(config.maxSeconds, 30);
    assert.equal(config.tokensPerSecond, 3);
    assert.equal(config.truncationMarker, '!!!');
});
