import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import test, { after, before } from 'node:test';
import { createServerApp } from './server.js';

let server: Server;
let baseUrl = '';
let dispose: () => void;
let previousDatabaseUrl: string | undefined;

before(async () => {
    previousDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = '';

    const created = await createServerApp({
        autoRunCourtSession: false,
    });

    dispose = created.dispose;
    server = created.app.listen(0);
    await once(server, 'listening');

    const address = server.address() as AddressInfo | null;
    if (!address || typeof address === 'string') {
        throw new Error('Expected server to bind to an ephemeral TCP port');
    }

    baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
    await new Promise<void>(resolve => {
        server.close(() => resolve());
    });
    dispose();

    if (previousDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
    } else {
        process.env.DATABASE_URL = previousDatabaseUrl;
    }
});

async function postJson(path: string, body: Record<string, unknown>) {
    const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    const json = (await response.json()) as Record<string, unknown>;
    return { response, json };
}

async function createSessionId(): Promise<string> {
    const { response, json } = await postJson('/api/court/sessions', {
        topic: 'Did the defendant replace all office coffee with soup?',
        caseType: 'criminal',
    });

    assert.equal(response.status, 201);
    const session = json.session as { id: string };
    assert.ok(session?.id);
    return session.id;
}

test('POST /api/court/sessions rejects short topic with explicit code', async () => {
    const { response, json } = await postJson('/api/court/sessions', {
        topic: 'too short',
    });

    assert.equal(response.status, 400);
    assert.equal(json.code, 'INVALID_TOPIC');
    assert.equal(json.error, 'topic must be at least 10 characters');
});

test('POST /api/court/sessions rejects unsafe topic with reason codes', async () => {
    const { response, json } = await postJson('/api/court/sessions', {
        topic: 'The witness called them a faggot in open court.',
    });

    assert.equal(response.status, 400);
    assert.equal(json.code, 'TOPIC_REJECTED');
    assert.equal(json.error, 'topic violates safety policy');
    assert.ok(Array.isArray(json.reasons));
});

test('POST /api/court/sessions/:id/vote rejects invalid vote type', async () => {
    const sessionId = await createSessionId();

    const { response, json } = await postJson(
        `/api/court/sessions/${sessionId}/vote`,
        {
            type: 'banana',
            choice: 'guilty',
        },
    );

    assert.equal(response.status, 400);
    assert.equal(json.code, 'INVALID_VOTE_TYPE');
});

test('POST /api/court/sessions/:id/vote rejects empty choice', async () => {
    const sessionId = await createSessionId();

    const { response, json } = await postJson(
        `/api/court/sessions/${sessionId}/vote`,
        {
            type: 'verdict',
            choice: '   ',
        },
    );

    assert.equal(response.status, 400);
    assert.equal(json.code, 'MISSING_VOTE_CHOICE');
});

test('POST /api/court/sessions/:id/vote rejects vote outside active vote phase', async () => {
    const sessionId = await createSessionId();

    const { response, json } = await postJson(
        `/api/court/sessions/${sessionId}/vote`,
        {
            type: 'verdict',
            choice: 'guilty',
        },
    );

    assert.equal(response.status, 400);
    assert.equal(json.code, 'VOTE_REJECTED');
    assert.match(
        String(json.error),
        /Cannot cast verdict vote during phase case_prompt/,
    );
});

test('POST /api/court/sessions/:id/vote blocks duplicate votes', async () => {
    const sessionId = await createSessionId();
    const phases: Array<'openings' | 'witness_exam' | 'closings' | 'verdict_vote'> = [
        'openings',
        'witness_exam',
        'closings',
        'verdict_vote',
    ];

    for (const phase of phases) {
        const { response } = await postJson(
            `/api/court/sessions/${sessionId}/phase`,
            { phase },
        );
        assert.equal(response.status, 200);
    }

    const first = await postJson(`/api/court/sessions/${sessionId}/vote`, {
        type: 'verdict',
        choice: 'guilty',
    });
    assert.equal(first.response.status, 200);

    const second = await postJson(`/api/court/sessions/${sessionId}/vote`, {
        type: 'verdict',
        choice: 'guilty',
    });

    assert.equal(second.response.status, 429);
    assert.equal(second.json.code, 'VOTE_DUPLICATE');
});

test('POST /api/court/sessions/:id/phase rejects invalid phase values', async () => {
    const sessionId = await createSessionId();

    const { response, json } = await postJson(
        `/api/court/sessions/${sessionId}/phase`,
        {
            phase: 'bananas',
        },
    );

    assert.equal(response.status, 400);
    assert.equal(json.code, 'INVALID_PHASE');
    assert.equal(json.error, 'invalid phase');
});

test('POST /api/court/sessions/:id/phase rejects illegal phase transitions', async () => {
    const sessionId = await createSessionId();

    const { response, json } = await postJson(
        `/api/court/sessions/${sessionId}/phase`,
        {
            phase: 'closings',
        },
    );

    assert.equal(response.status, 400);
    assert.equal(json.code, 'INVALID_PHASE_TRANSITION');
    assert.match(String(json.error), /Invalid phase transition/);
});

test('GET /api/court/sessions/:id returns SESSION_NOT_FOUND for unknown id', async () => {
    const response = await fetch(`${baseUrl}/api/court/sessions/not-real`);
    const json = (await response.json()) as Record<string, unknown>;

    assert.equal(response.status, 404);
    assert.equal(json.code, 'SESSION_NOT_FOUND');
    assert.equal(json.error, 'Session not found');
});
