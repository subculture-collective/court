import test from 'node:test';
import assert from 'node:assert/strict';
import { moderateContent } from './content-filter.js';

test('passes clean comedic text through unchanged', () => {
    const clean =
        'I saw the defendant near the snack cabinet at 2:03 AM, holding a spoon.';
    const result = moderateContent(clean);
    assert.equal(result.flagged, false);
    assert.deepEqual(result.reasons, []);
    assert.equal(result.sanitized, clean);
});

test('flags and redacts text containing slurs', () => {
    const input = 'The witness called them a faggot in open court.';
    const result = moderateContent(input);
    assert.equal(result.flagged, true);
    assert.ok(result.reasons.includes('slur'));
    assert.ok(result.sanitized.includes('redacted'));
    assert.equal(result.original, input);
});

test('flags hate speech patterns', () => {
    const input = 'We should kill all of them immediately.';
    const result = moderateContent(input);
    assert.equal(result.flagged, true);
    assert.ok(result.reasons.includes('hate_speech'));
});

test('flags violence patterns', () => {
    const input = 'They wanted to mutilate the evidence and the witness.';
    const result = moderateContent(input);
    assert.equal(result.flagged, true);
    assert.ok(result.reasons.includes('violence'));
});

test('flags harassment patterns', () => {
    const input = 'Someone threatened to doxx the jury members.';
    const result = moderateContent(input);
    assert.equal(result.flagged, true);
    assert.ok(result.reasons.includes('harassment'));
});

test('flags sexual content patterns', () => {
    const input = 'The testimony devolved into descriptions of orgasm.';
    const result = moderateContent(input);
    assert.equal(result.flagged, true);
    assert.ok(result.reasons.includes('sexual_content'));
});

test('collects multiple reason codes for text with multiple violations', () => {
    const input = 'Kill all of them and mutilate the rest.';
    const result = moderateContent(input);
    assert.equal(result.flagged, true);
    assert.ok(result.reasons.length >= 2);
});

test('returns redaction placeholder for flagged content', () => {
    const input = 'Someone called them a retard during testimony.';
    const result = moderateContent(input);
    assert.equal(result.flagged, true);
    assert.ok(
        result.sanitized.includes('redacted'),
        'sanitized text should contain redaction notice',
    );
    assert.notEqual(result.sanitized, input);
});
