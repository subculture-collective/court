import type { LLMGenerateOptions } from '../types.js';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? '';
const DEFAULT_MODEL =
    process.env.LLM_MODEL ?? 'deepseek/deepseek-chat-v3-0324:free';
const FORCE_MOCK = process.env.LLM_MOCK === 'true';

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
    const {
        messages,
        model = DEFAULT_MODEL,
        temperature = 0.7,
        maxTokens = 300,
    } = options;

    const latestUserMessage = [...messages]
        .reverse()
        .find(message => message.role === 'user')?.content;

    if (!OPENROUTER_API_KEY || FORCE_MOCK) {
        return mockReply(latestUserMessage ?? '');
    }

    const response = await fetch(
        'https://openrouter.ai/api/v1/chat/completions',
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${OPENROUTER_API_KEY}`,
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
        throw new Error(
            `OpenRouter request failed (${response.status}): ${body.slice(0, 300)}`,
        );
    }

    const data = (await response.json()) as {
        choices?: [{ message?: { content?: string } }];
    };

    const text = data.choices?.[0]?.message?.content ?? '';
    return sanitizeDialogue(text);
}
