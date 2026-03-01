import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectOrganicObjection, parseClassifierResponse } from './objections.js';

describe('detectOrganicObjection', () => {
    it('detects OBJECTION: at start of dialogue', () => {
        const result = detectOrganicObjection('OBJECTION: hearsay. That is inadmissible.');
        assert.equal(result, 'hearsay. That is inadmissible.');
    });

    it('is case-insensitive', () => {
        const result = detectOrganicObjection('Objection: leading question.');
        assert.equal(result, 'leading question.');
    });

    it('returns null when dialogue does not start with OBJECTION:', () => {
        assert.equal(detectOrganicObjection('I strongly disagree with that characterisation.'), null);
    });

    it('returns null for empty string', () => {
        assert.equal(detectOrganicObjection(''), null);
    });

    it('does not match OBJECTION mid-sentence', () => {
        assert.equal(detectOrganicObjection('Counsel raises an OBJECTION: hearsay.'), null);
    });
});

describe('parseClassifierResponse', () => {
    it('returns objection type for yes: response', () => {
        assert.equal(parseClassifierResponse('yes: hearsay'), 'hearsay');
    });

    it('is case-insensitive', () => {
        assert.equal(parseClassifierResponse('Yes: Speculation'), 'Speculation');
    });

    it('returns null for no', () => {
        assert.equal(parseClassifierResponse('no'), null);
    });

    it('returns null for empty string', () => {
        assert.equal(parseClassifierResponse(''), null);
    });
});
