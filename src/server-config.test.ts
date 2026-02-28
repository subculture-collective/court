import assert from 'node:assert/strict';
import test from 'node:test';
import { parseReplayLaunchConfig, resolveTrustProxySetting } from './server.js';

test('resolveTrustProxySetting returns undefined when TRUST_PROXY is missing or blank', () => {
    assert.equal(resolveTrustProxySetting({} as NodeJS.ProcessEnv), undefined);
    assert.equal(
        resolveTrustProxySetting({ TRUST_PROXY: '   ' } as NodeJS.ProcessEnv),
        undefined,
    );
});

test('resolveTrustProxySetting parses booleans and hop counts', () => {
    assert.equal(
        resolveTrustProxySetting({ TRUST_PROXY: 'true' } as NodeJS.ProcessEnv),
        true,
    );
    assert.equal(
        resolveTrustProxySetting({ TRUST_PROXY: 'FALSE' } as NodeJS.ProcessEnv),
        false,
    );
    assert.equal(
        resolveTrustProxySetting({ TRUST_PROXY: '1' } as NodeJS.ProcessEnv),
        1,
    );
});

test('resolveTrustProxySetting parses csv lists and passthrough values', () => {
    assert.deepEqual(
        resolveTrustProxySetting({
            TRUST_PROXY: 'loopback, linklocal, uniquelocal',
        } as NodeJS.ProcessEnv),
        ['loopback', 'linklocal', 'uniquelocal'],
    );

    assert.equal(
        resolveTrustProxySetting({
            TRUST_PROXY: 'loopback',
        } as NodeJS.ProcessEnv),
        'loopback',
    );
});

test('parseReplayLaunchConfig reads replay path and speed from env', () => {
    const config = parseReplayLaunchConfig([], {
        REPLAY_FILE: './recordings/session.ndjson',
        REPLAY_SPEED: '4',
    } as NodeJS.ProcessEnv);

    assert.ok(config);
    assert.equal(config?.speed, 4);
    assert.match(config?.filePath ?? '', /recordings\/session\.ndjson$/);
});

test('parseReplayLaunchConfig applies argv overrides', () => {
    const config = parseReplayLaunchConfig(
        ['--replay', 'fixtures/demo.ndjson', '--speed', '2'],
        {
            REPLAY_FILE: './recordings/session.ndjson',
            REPLAY_SPEED: '1',
        } as NodeJS.ProcessEnv,
    );

    assert.ok(config);
    assert.equal(config?.speed, 2);
    assert.match(config?.filePath ?? '', /fixtures\/demo\.ndjson$/);
});

test('parseReplayLaunchConfig returns undefined when replay file is absent', () => {
    const config = parseReplayLaunchConfig([], {} as NodeJS.ProcessEnv);
    assert.equal(config, undefined);
});
