import assert from 'node:assert/strict';
import test from 'node:test';
import { llmGenerate } from './client.js';

type EnvKey = 'OPENROUTER_API_KEY' | 'LLM_MOCK' | 'LLM_MODEL';

function withTemporaryEnv(
    updates: Partial<Record<EnvKey, string>>,
    run: () => Promise<void>,
): Promise<void> {
    const previous = new Map<EnvKey, string | undefined>();

    for (const key of Object.keys(updates) as EnvKey[]) {
        previous.set(key, process.env[key]);
        process.env[key] = updates[key];
    }

    return run().finally(() => {
        for (const [key, value] of previous.entries()) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
    });
}

test('llmGenerate falls back when provider returns empty message content', async () => {
    const originalFetch = globalThis.fetch;
    const originalArgv = [...process.argv];

    globalThis.fetch = async () =>
        new Response(
            JSON.stringify({
                choices: [
                    {
                        message: {
                            role: 'assistant',
                            content: '',
                            reasoning:
                                'Internal reasoning consumed the token budget before final answer.',
                        },
                    },
                ],
            }),
            {
                status: 200,
                headers: {
                    'content-type': 'application/json',
                },
            },
        );

    process.argv = process.argv.filter(arg => arg !== '--test');

    await withTemporaryEnv(
        {
            OPENROUTER_API_KEY: 'test-key',
            LLM_MOCK: 'false',
            LLM_MODEL: 'stepfun/step-3.5-flash:free',
        },
        async () => {
            const output = await llmGenerate({
                messages: [
                    {
                        role: 'system',
                        content: 'You are a courtroom defense attorney.',
                    },
                    {
                        role: 'user',
                        content: 'Deliver your opening statement.',
                    },
                ],
                maxTokens: 180,
            });

            assert.notEqual(
                output,
                '',
                'Expected non-empty fallback text when model content is empty',
            );
            assert.match(output, /Ladies and gentlemen/i);
        },
    ).finally(() => {
        globalThis.fetch = originalFetch;
        process.argv = originalArgv;
    });
});

test('llmGenerate returns sanitized provider content when non-empty', async () => {
    const originalFetch = globalThis.fetch;
    const originalArgv = [...process.argv];

    globalThis.fetch = async () =>
        new Response(
            JSON.stringify({
                choices: [
                    {
                        message: {
                            role: 'assistant',
                            content:
                                '"**Objection!** Visit https://example.com for docs"',
                        },
                    },
                ],
            }),
            {
                status: 200,
                headers: {
                    'content-type': 'application/json',
                },
            },
        );

    process.argv = process.argv.filter(arg => arg !== '--test');

    await withTemporaryEnv(
        {
            OPENROUTER_API_KEY: 'test-key',
            LLM_MOCK: 'false',
            LLM_MODEL: 'stepfun/step-3.5-flash:free',
        },
        async () => {
            const output = await llmGenerate({
                messages: [
                    { role: 'system', content: 'You are concise.' },
                    { role: 'user', content: 'Say one line.' },
                ],
                maxTokens: 120,
            });

            assert.equal(output, 'Objection! Visit for docs');
        },
    ).finally(() => {
        globalThis.fetch = originalFetch;
        process.argv = originalArgv;
    });
});
