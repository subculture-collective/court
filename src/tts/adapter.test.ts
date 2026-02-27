import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createTTSAdapterFromEnv,
    MockTTSAdapter,
    NoopTTSAdapter,
} from './adapter.js';

test('createTTSAdapterFromEnv defaults to noop provider', async () => {
    const previousProvider = process.env.TTS_PROVIDER;
    delete process.env.TTS_PROVIDER;

    try {
        const adapter = createTTSAdapterFromEnv();
        assert.equal(adapter.provider, 'noop');
        assert.ok(adapter instanceof NoopTTSAdapter);
        await assert.doesNotReject(
            adapter.speakCue({
                sessionId: 'sess-1',
                phase: 'case_prompt',
                text: 'All rise.',
            }),
        );
    } finally {
        if (previousProvider === undefined) {
            delete process.env.TTS_PROVIDER;
        } else {
            process.env.TTS_PROVIDER = previousProvider;
        }
    }
});

test('createTTSAdapterFromEnv falls back to noop for unknown providers', () => {
    const previousProvider = process.env.TTS_PROVIDER;
    process.env.TTS_PROVIDER = 'definitely-not-real';

    try {
        const adapter = createTTSAdapterFromEnv();
        assert.equal(adapter.provider, 'noop');
    } finally {
        if (previousProvider === undefined) {
            delete process.env.TTS_PROVIDER;
        } else {
            process.env.TTS_PROVIDER = previousProvider;
        }
    }
});

test('mock adapter records cue/recap/verdict calls', async () => {
    const adapter = new MockTTSAdapter();

    await adapter.speakCue({
        sessionId: 'sess-1',
        phase: 'openings',
        text: 'Openings begin.',
    });
    await adapter.speakRecap({
        sessionId: 'sess-1',
        phase: 'witness_exam',
        text: 'Recap text',
    });
    await adapter.speakVerdict({
        sessionId: 'sess-1',
        verdict: 'guilty',
        sentence: 'fine',
    });

    assert.equal(adapter.calls.length, 3);
    assert.equal(adapter.calls[0]?.method, 'speakCue');
    assert.equal(adapter.calls[1]?.method, 'speakRecap');
    assert.equal(adapter.calls[2]?.method, 'speakVerdict');
});

test('mock adapter can simulate provider failures', async () => {
    const adapter = new MockTTSAdapter({
        failOn: ['speakCue', 'speakRecap', 'speakVerdict'],
    });

    await assert.rejects(
        adapter.speakCue({
            sessionId: 'sess-1',
            phase: 'case_prompt',
            text: 'All rise.',
        }),
        /mock speakCue failure/,
    );

    await assert.rejects(
        adapter.speakRecap({
            sessionId: 'sess-1',
            phase: 'witness_exam',
            text: 'Recap.',
        }),
        /mock speakRecap failure/,
    );

    await assert.rejects(
        adapter.speakVerdict({
            sessionId: 'sess-1',
            verdict: 'guilty',
            sentence: 'fine',
        }),
        /mock speakVerdict failure/,
    );
});
