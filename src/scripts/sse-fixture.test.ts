import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFixtureFileName, createSseDataParser } from './sse-fixture.js';

test('createSseDataParser parses chunked data lines into complete SSE messages', () => {
    const payloads: string[] = [];
    const parser = createSseDataParser(data => {
        payloads.push(data);
    });

    parser.push('data: {"type":"snapshot"}\n\n');
    parser.push('data: {"type":"turn","payload":{"speaker":"judge"}}\n');
    parser.push('\n');
    parser.flush();

    assert.deepEqual(payloads, [
        '{"type":"snapshot"}',
        '{"type":"turn","payload":{"speaker":"judge"}}',
    ]);
});

test('createSseDataParser supports multiline data payloads', () => {
    const payloads: string[] = [];
    const parser = createSseDataParser(data => {
        payloads.push(data);
    });

    parser.push('data: {"type":"snapshot",\n');
    parser.push('data: "payload": {"phase": "openings"}}\n\n');
    parser.flush();

    assert.equal(
        payloads[0],
        '{"type":"snapshot",\n"payload": {"phase": "openings"}}',
    );
});

test('buildFixtureFileName sanitizes unsafe characters', () => {
    const fileName = buildFixtureFileName('session/alpha:beta', 1234);

    assert.equal(fileName, 'sse-session_alpha_beta-1234.json');
});
