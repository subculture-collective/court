import type { LLMGenerateOptions } from '../types.js';

const FALLBACK_MODELS = [
    'google/gemma-3-27b-it:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'mistralai/mistral-small-3.1-24b-instruct:free',
];

function runtimeLLMConfig(env: NodeJS.ProcessEnv = process.env): {
    apiKey: string;
    models: string[];
    forceMock: boolean;
} {
    const apiKey = (env.OPENROUTER_API_KEY ?? '').trim();
    const modelsRaw = (env.LLM_MODELS ?? '').trim();
    const models =
        modelsRaw ?
            modelsRaw
                .split(',')
                .map(m => m.trim())
                .filter(Boolean)
        :   FALLBACK_MODELS;
    const runningNodeTests = process.argv.includes('--test');
    const forceMock = env.LLM_MOCK === 'true' || runningNodeTests;
    return { apiKey, models, forceMock };
}

function extractFromXml(text: string): string {
    const contentMatch = text.match(
        /<parameter\s+name=["']content["'][^>]*>([\s\S]*?)<\/parameter>/i,
    );
    if (contentMatch?.[1]) {
        return contentMatch[1].trim();
    }

    return text
        .replace(
            /<\/?(?:function_?calls?|invoke|parameter|tool_call|antml:[a-z_]+)[^>]*>/gi,
            '',
        )
        .trim();
}

export function sanitizeDialogue(text: string): string {
    return extractFromXml(text)
        .replace(/<\/?[a-z_][a-z0-9_-]*(?:\s[^>]*)?\s*>/gi, '')
        .replace(/https?:\/\/\S+/g, '')
        .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1')
        .replace(/^["']|["']$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function mockReply(prompt: string): string {
    if (/opening|statement/i.test(prompt)) {
        return 'Ladies and gentlemen of the jury, the facts are weird, the timeline is worse, and someone absolutely touched the thermostat without consent.';
    }
    if (/witness|testimony|cross/i.test(prompt)) {
        return 'I saw the defendant near the snack cabinet at 2:03 AM, holding a spoon and what looked like emotional intent.';
    }
    if (/closing/i.test(prompt)) {
        return 'At the end of the day, this is either a crime or a spectacular misunderstanding involving glitter and plausible deniability.';
    }
    if (/ruling|verdict/i.test(prompt)) {
        return 'On the charge of chaos in the first degree, this court finds the defendant dramatically guilty—with style points.';
    }
    return 'Order in the court. I acknowledge the point and move us to the next absurdly important matter.';
}

async function tryModelGenerate(
    model: string,
    apiKey: string,
    messages: LLMGenerateOptions['messages'],
    temperature: number,
    maxTokens: number,
): Promise<
    { success: true; text: string } | { success: false; reason: string }
> {
    try {
        const response = await fetch(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model,
                    messages,
                    temperature,
                    max_tokens: maxTokens,
                }),
            },
        );

        if (!response.ok) {
            const body = await response.text();
            return {
                success: false,
                reason: `HTTP ${response.status}: ${body.slice(0, 100)}`,
            };
        }

        const data = (await response.json()) as {
            choices?: [{ message?: { content?: unknown } }];
        };

        const rawContent = data.choices?.[0]?.message?.content;
        const text = typeof rawContent === 'string' ? rawContent : '';
        const sanitized = sanitizeDialogue(text);

        if (!sanitized) {
            return {
                success: false,
                reason: 'Empty content after sanitization',
            };
        }

        return { success: true, text: sanitized };
    } catch (error) {
        return {
            success: false,
            reason: error instanceof Error ? error.message : String(error),
        };
    }
}

export async function llmGenerate(
    options: LLMGenerateOptions,
): Promise<string> {
    const config = runtimeLLMConfig();
    const { messages, temperature = 0.7, maxTokens = 300 } = options;

    const latestUserMessage = [...messages]
        .reverse()
        .find(message => message.role === 'user')?.content;

    if (!config.apiKey || config.forceMock) {
        return mockReply(latestUserMessage ?? '');
    }

    // Try each model in sequence until one succeeds
    const errors: string[] = [];
    for (const model of config.models) {
        const result = await tryModelGenerate(
            model,
            config.apiKey,
            messages,
            temperature,
            maxTokens,
        );

        if (result.success) {
            if (errors.length > 0) {
                // eslint-disable-next-line no-console
                console.info(
                    `[llm] model="${model}" succeeded after ${errors.length} failures`,
                );
            }
            return result.text;
        }

        errors.push(`${model}: ${result.reason}`);
        // eslint-disable-next-line no-console
        console.warn(`[llm] model="${model}" failed: ${result.reason}`);
    }

    // All models failed, fall back to mock
    // eslint-disable-next-line no-console
    console.warn(
        `[llm] All ${config.models.length} models failed; falling back to mock dialogue. Errors:\n${errors.join('\n')}`,
    );
    return mockReply(latestUserMessage ?? '');
}
