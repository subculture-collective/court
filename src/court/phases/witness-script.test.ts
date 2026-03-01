import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildWitnessScripts } from './witness-script.js';

describe('buildWitnessScripts', () => {
    it('returns one script per witness', () => {
        const scripts = buildWitnessScripts(3);
        assert.equal(scripts.length, 3);
    });

    it('direct rounds are in range 3–7', () => {
        for (let i = 0; i < 50; i++) {
            const [script] = buildWitnessScripts(1);
            assert.ok(
                script!.directRounds >= 3 && script!.directRounds <= 7,
                `directRounds out of range: ${script!.directRounds}`,
            );
        }
    });

    it('cross rounds are in range 2–5', () => {
        for (let i = 0; i < 50; i++) {
            const [script] = buildWitnessScripts(1);
            assert.ok(
                script!.crossRounds >= 2 && script!.crossRounds <= 5,
                `crossRounds out of range: ${script!.crossRounds}`,
            );
        }
    });

    it('witnesses get independent rolls', () => {
        const scripts = buildWitnessScripts(20);
        const directCounts = new Set(scripts.map(s => s.directRounds));
        assert.ok(
            directCounts.size > 1,
            'All 20 witnesses got identical directRounds — extremely unlikely if random',
        );
    });

    it('returns empty array for 0 witnesses', () => {
        assert.deepEqual(buildWitnessScripts(0), []);
    });
});
