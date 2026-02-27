import test from 'node:test';
import assert from 'node:assert/strict';
import {
    applyRoleTokenBudget,
    estimateCostUsd,
    resolveRoleTokenBudgetConfig,
    roleTokenLimit,
} from './token-budget.js';

test('resolveRoleTokenBudgetConfig parses role caps and falls back safely', () => {
    const config = resolveRoleTokenBudgetConfig({
        ROLE_MAX_TOKENS_DEFAULT: '300',
        ROLE_MAX_TOKENS_JUDGE: '180',
        ROLE_MAX_TOKENS_PROSECUTOR: '170',
        ROLE_MAX_TOKENS_DEFENSE: '165',
        ROLE_MAX_TOKENS_WITNESS: '140',
        ROLE_MAX_TOKENS_BAILIFF: '95',
        TOKEN_COST_PER_1K_USD: '0.003',
    });

    assert.equal(config.defaultMaxTokens, 300);
    assert.equal(config.judgeMaxTokens, 180);
    assert.equal(config.prosecutorMaxTokens, 170);
    assert.equal(config.defenseMaxTokens, 165);
    assert.equal(config.witnessMaxTokens, 140);
    assert.equal(config.bailiffMaxTokens, 95);
    assert.equal(config.costPer1kTokensUsd, 0.003);

    const fallback = resolveRoleTokenBudgetConfig({
        ROLE_MAX_TOKENS_DEFAULT: '-1',
        TOKEN_COST_PER_1K_USD: 'NaN',
    });
    assert.equal(fallback.defaultMaxTokens, 260);
    assert.equal(fallback.costPer1kTokensUsd, 0.002);
});

test('roleTokenLimit maps witness variants to witness cap', () => {
    const config = resolveRoleTokenBudgetConfig({
        ROLE_MAX_TOKENS_WITNESS: '111',
    });

    assert.equal(roleTokenLimit('witness_1', config), 111);
    assert.equal(roleTokenLimit('witness_2', config), 111);
    assert.equal(roleTokenLimit('witness_3', config), 111);
});

test('applyRoleTokenBudget enforces env cap and reports source', () => {
    const config = resolveRoleTokenBudgetConfig({ ROLE_MAX_TOKENS_JUDGE: '90' });

    const capped = applyRoleTokenBudget('judge', 260, config);
    assert.equal(capped.requestedMaxTokens, 260);
    assert.equal(capped.appliedMaxTokens, 90);
    assert.equal(capped.source, 'env_role_cap');

    const passthrough = applyRoleTokenBudget('judge', 40, config);
    assert.equal(passthrough.appliedMaxTokens, 40);
    assert.equal(passthrough.source, 'requested');
});

test('estimateCostUsd computes stable rounded estimate', () => {
    assert.equal(estimateCostUsd(0, 0.002), 0);
    assert.equal(estimateCostUsd(2500, 0.002), 0.005);
    assert.equal(estimateCostUsd(1333, 0.003), 0.003999);
});
