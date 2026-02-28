import type { LLMGenerateOptions } from '../types.js';

const FALLBACK_MODEL = 'deepseek/deepseek-chat-v3-0324:free';

function runtimeLLMConfig(env: NodeJS.ProcessEnv = process.env): {
    apiKey: string;
    model: string;
    forceMock: boolean;
} {
    const apiKey = (env.OPENROUTER_API_KEY ?? '').trim();
    const model = (env.LLM_MODEL ?? FALLBACK_MODEL).trim() || FALLBACK_MODEL;
    const runningNodeTests = process.argv.includes('--test');
    const forceMock = env.LLM_MOCK === 'true' || runningNodeTests;
    return { apiKey, model, forceMock };
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

export async function llmGenerate(
    options: LLMGenerateOptions,
): Promise<string> {
    const config = runtimeLLMConfig();
    const {
        messages,
        model = config.model,
        temperature = 0.7,
        maxTokens = 300,
    } = options;

    const latestUserMessage = [...messages]
        .reverse()
        .find(message => message.role === 'user')?.content;

    if (!config.apiKey || config.forceMock) {
        return mockReply(latestUserMessage ?? '');
    }

    try {
        const response = await fetch(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${config.apiKey}`,
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
            // eslint-disable-next-line no-console
            console.warn(
                `OpenRouter request failed (${response.status}); falling back to mock dialogue: ${body.slice(0, 160)}`,
            );
            return mockReply(latestUserMessage ?? '');
        }

        const data = (await response.json()) as {
            choices?: [{ message?: { content?: string } }];
        };

        const text = data.choices?.[0]?.message?.content ?? '';
        return sanitizeDialogue(text);
    } catch (error) {
        // eslint-disable-next-line no-console
        console.warn(
            `OpenRouter request threw; falling back to mock dialogue: ${error instanceof Error ? error.message : String(error)}`,
        );
        return mockReply(latestUserMessage ?? '');
    }
}
