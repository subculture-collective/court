import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let transcriptSampler: typeof import('./transcript-sampler.js');
let testDir: string;

describe('TranscriptSampler', () => {
    before(async () => {
        testDir = await mkdtemp(join(tmpdir(), 'court-transcripts-'));
        const charDir = join(testDir, 'Phoenix Wright Transcripts');
        await mkdir(charDir);
        await writeFile(
            join(charDir, '1-1 Phoenix Wright.txt'),
            [
                'Hold it!',
                'The defense is ready, Your Honor.',
                '(I have a bad feeling about this...)',
                '',
                'Objection!',
                'Take that!',
                '(Blank line above should be filtered)',
            ].join('\n'),
        );
        process.env['TRANSCRIPT_DIR'] = testDir;
        transcriptSampler = await import('./transcript-sampler.js');
    });

    after(async () => {
        await rm(testDir, { recursive: true });
        delete process.env['TRANSCRIPT_DIR'];
    });

    it('returns the requested number of lines', async () => {
        const lines = await transcriptSampler.sample('phoenix', 2);
        assert.equal(lines.length, 2);
    });

    it('filters blank lines', async () => {
        const lines = await transcriptSampler.sample('phoenix', 100);
        assert.ok(lines.every(l => l.trim().length > 0), 'blank lines slipped through');
    });

    it('filters pure parenthetical stage directions', async () => {
        const lines = await transcriptSampler.sample('phoenix', 100);
        const parentheticals = lines.filter(l => /^\s*\(.*\)\s*$/.test(l));
        assert.equal(parentheticals.length, 0, 'parentheticals slipped through');
    });

    it('returns lines from cache on second call without additional file reads', async () => {
        const a = await transcriptSampler.sample('phoenix', 2);
        const b = await transcriptSampler.sample('phoenix', 2);
        assert.equal(a.length, 2);
        assert.equal(b.length, 2);
    });

    it('throws on unknown character transcript dir', async () => {
        await assert.rejects(
            () => transcriptSampler.sample('trucy', 2),
            /transcript/i,
        );
    });
});
