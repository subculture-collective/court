export interface WitnessCapConfig {
    maxTokens: number;
    maxSeconds: number;
    tokensPerSecond: number;
    truncationMarker: string;
}

export interface WitnessCapResult {
    text: string;
    capped: boolean;
    originalTokens: number;
    truncatedTokens: number;
    reason?: 'tokens' | 'seconds';
}

const DEFAULTS: WitnessCapConfig = {
    maxTokens: 150,
    maxSeconds: 30,
    tokensPerSecond: 3,
    truncationMarker: '[The witness was cut off by the judge.]',
};

function parsePositiveInt(value: string | undefined, fallback: number): number {
    if (!value) return fallback;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInt(
    value: string | undefined,
    fallback: number,
): number {
    if (!value) return fallback;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function resolveWitnessCapConfig(
    env: NodeJS.ProcessEnv = process.env,
): WitnessCapConfig {
    return {
        maxTokens: parseNonNegativeInt(
            env.WITNESS_MAX_TOKENS,
            DEFAULTS.maxTokens,
        ),
        maxSeconds: parseNonNegativeInt(
            env.WITNESS_MAX_SECONDS,
            DEFAULTS.maxSeconds,
        ),
        tokensPerSecond: parsePositiveInt(
            env.WITNESS_TOKENS_PER_SECOND,
            DEFAULTS.tokensPerSecond,
        ),
        truncationMarker:
            env.WITNESS_TRUNCATION_MARKER ?? DEFAULTS.truncationMarker,
    };
}

export function estimateTokens(text: string): number {
    const trimmed = text.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
}

export function truncateToTokens(text: string, maxTokens: number): string {
    if (maxTokens <= 0) return '';
    const parts = text.trim().split(/\s+/);
    if (parts.length <= maxTokens) return text.trim();
    return parts.slice(0, maxTokens).join(' ');
}

export function effectiveTokenLimit(config: WitnessCapConfig): {
    limit: number | undefined;
    reason?: 'tokens' | 'seconds';
} {
    const tokenLimit =
        config.maxTokens > 0 ? config.maxTokens : Number.POSITIVE_INFINITY;
    const timeLimit =
        config.maxSeconds > 0 ?
            Math.floor(config.maxSeconds * config.tokensPerSecond)
        :   Number.POSITIVE_INFINITY;

    const limit = Math.min(tokenLimit, timeLimit);
    if (!Number.isFinite(limit)) {
        return { limit: undefined };
    }

    if (timeLimit < tokenLimit) {
        return { limit, reason: 'seconds' };
    }

    return { limit, reason: 'tokens' };
}

export function applyWitnessCap(
    text: string,
    config: WitnessCapConfig,
): WitnessCapResult {
    const originalTokens = estimateTokens(text);
    const { limit, reason } = effectiveTokenLimit(config);

    if (!limit || originalTokens <= limit) {
        return {
            text,
            capped: false,
            originalTokens,
            truncatedTokens: originalTokens,
        };
    }

    const cappedText = truncateToTokens(text, Math.max(1, limit));
    return {
        text: `${cappedText} ${config.truncationMarker}`.trim(),
        capped: true,
        originalTokens,
        truncatedTokens: Math.max(1, limit),
        reason,
    };
}
