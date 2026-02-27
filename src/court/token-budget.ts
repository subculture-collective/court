import type { CourtRole } from '../types.js';

export interface RoleTokenBudgetConfig {
    defaultMaxTokens: number;
    judgeMaxTokens: number;
    prosecutorMaxTokens: number;
    defenseMaxTokens: number;
    witnessMaxTokens: number;
    bailiffMaxTokens: number;
    costPer1kTokensUsd: number;
}

export interface RoleTokenBudgetResolution {
    requestedMaxTokens: number;
    appliedMaxTokens: number;
    roleMaxTokens: number;
    source: 'env_role_cap' | 'requested';
}

const DEFAULT_ROLE_BUDGET_CONFIG: RoleTokenBudgetConfig = {
    defaultMaxTokens: 260,
    judgeMaxTokens: 220,
    prosecutorMaxTokens: 220,
    defenseMaxTokens: 220,
    witnessMaxTokens: 160,
    bailiffMaxTokens: 120,
    costPer1kTokensUsd: 0.002,
};

function parsePositiveInt(value: string | undefined, fallback: number): number {
    if (!value) return fallback;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePositiveFloat(
    value: string | undefined,
    fallback: number,
): number {
    if (!value) return fallback;
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveRoleTokenBudgetConfig(
    env: NodeJS.ProcessEnv = process.env,
): RoleTokenBudgetConfig {
    return {
        defaultMaxTokens: parsePositiveInt(
            env.ROLE_MAX_TOKENS_DEFAULT,
            DEFAULT_ROLE_BUDGET_CONFIG.defaultMaxTokens,
        ),
        judgeMaxTokens: parsePositiveInt(
            env.ROLE_MAX_TOKENS_JUDGE,
            DEFAULT_ROLE_BUDGET_CONFIG.judgeMaxTokens,
        ),
        prosecutorMaxTokens: parsePositiveInt(
            env.ROLE_MAX_TOKENS_PROSECUTOR,
            DEFAULT_ROLE_BUDGET_CONFIG.prosecutorMaxTokens,
        ),
        defenseMaxTokens: parsePositiveInt(
            env.ROLE_MAX_TOKENS_DEFENSE,
            DEFAULT_ROLE_BUDGET_CONFIG.defenseMaxTokens,
        ),
        witnessMaxTokens: parsePositiveInt(
            env.ROLE_MAX_TOKENS_WITNESS,
            DEFAULT_ROLE_BUDGET_CONFIG.witnessMaxTokens,
        ),
        bailiffMaxTokens: parsePositiveInt(
            env.ROLE_MAX_TOKENS_BAILIFF,
            DEFAULT_ROLE_BUDGET_CONFIG.bailiffMaxTokens,
        ),
        costPer1kTokensUsd: parsePositiveFloat(
            env.TOKEN_COST_PER_1K_USD,
            DEFAULT_ROLE_BUDGET_CONFIG.costPer1kTokensUsd,
        ),
    };
}

export function roleTokenLimit(
    role: CourtRole,
    config: RoleTokenBudgetConfig,
): number {
    switch (role) {
        case 'judge':
            return config.judgeMaxTokens;
        case 'prosecutor':
            return config.prosecutorMaxTokens;
        case 'defense':
            return config.defenseMaxTokens;
        case 'witness_1':
        case 'witness_2':
        case 'witness_3':
            return config.witnessMaxTokens;
        case 'bailiff':
            return config.bailiffMaxTokens;
        default: {
            const _never: never = role;
            throw new Error(`Unsupported role: ${String(_never)}`);
        }
    }
}

export function applyRoleTokenBudget(
    role: CourtRole,
    requestedMaxTokens: number | undefined,
    config: RoleTokenBudgetConfig,
): RoleTokenBudgetResolution {
    const requested =
        requestedMaxTokens && requestedMaxTokens > 0 ?
            requestedMaxTokens
        :   config.defaultMaxTokens;
    const roleLimit = roleTokenLimit(role, config);
    const applied = Math.max(1, Math.min(requested, roleLimit));

    return {
        requestedMaxTokens: requested,
        appliedMaxTokens: applied,
        roleMaxTokens: roleLimit,
        source: applied < requested ? 'env_role_cap' : 'requested',
    };
}

export function estimateCostUsd(
    totalTokens: number,
    costPer1kTokensUsd: number,
): number {
    const safeTotal = Math.max(0, totalTokens);
    const raw = (safeTotal / 1000) * costPer1kTokensUsd;
    return Number(raw.toFixed(6));
}
