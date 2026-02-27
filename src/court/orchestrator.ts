import { AGENTS } from '../agents.js';
import { llmGenerate, sanitizeDialogue } from '../llm/client.js';
import { moderateContent } from '../moderation/content-filter.js';
import { createTTSAdapterFromEnv, type TTSAdapter } from '../tts/adapter.js';
import {
    createBroadcastAdapterFromEnv,
    safeBroadcastHook,
    type BroadcastAdapter,
} from '../broadcast/adapter.js';
import {
    applyWitnessCap,
    estimateTokens,
    resolveWitnessCapConfig,
} from './witness-caps.js';
import type { WitnessCapConfig } from './witness-caps.js';
import {
    applyRoleTokenBudget,
    resolveRoleTokenBudgetConfig,
    type RoleTokenBudgetConfig,
} from './token-budget.js';
import type {
    AgentId,
    CaseType,
    CourtPhase,
    CourtRole,
    CourtSession,
    CourtTurn,
} from '../types.js';
import type { CourtSessionStore } from '../store/session-store.js';
import { buildCourtSystemPrompt } from './personas.js';
import {
    createSafelySpeak,
    createTokenSampleRecorder,
    resolveRecapCadence,
    runCasePromptPhase,
    runClosingsPhase,
    runFinalRulingPhase,
    runOpeningsPhase,
    runSentenceVotePhase,
    runVerdictVotePhase,
    runWitnessExamPhase,
    type GenerateBudgetedTurn,
    type TokenSample,
    type SessionRuntimeContext,
} from './phases/session-flow.js';

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function recentHistory(turns: CourtTurn[], limit = 8): string {
    const selected = turns.slice(-limit);
    return selected
        .map(
            turn =>
                `${AGENTS[turn.speaker]?.displayName ?? turn.speaker} (${turn.role}): ${turn.dialogue}`,
        )
        .join('\n');
}

const MODERATION_REDIRECT_DIALOGUE =
    'The court will strike that from the record. Please keep testimony appropriate and on topic.';

const broadcastBySession = new Map<string, BroadcastAdapter>();

type BudgetResolution = {
    requestedMaxTokens: number;
    appliedMaxTokens: number;
    roleMaxTokens: number;
    source: 'env_role_cap' | 'requested';
};

function resolveBudgetResolution(input: {
    role: CourtRole;
    maxTokens?: number;
    roleBudgetConfig?: RoleTokenBudgetConfig;
}): BudgetResolution {
    if (input.roleBudgetConfig) {
        return applyRoleTokenBudget(
            input.role,
            input.maxTokens,
            input.roleBudgetConfig,
        );
    }

    const fallbackMaxTokens = input.maxTokens ?? 260;
    return {
        requestedMaxTokens: fallbackMaxTokens,
        appliedMaxTokens: fallbackMaxTokens,
        roleMaxTokens: fallbackMaxTokens,
        source: 'requested',
    };
}

function appendTurnToSession(session: CourtSession, turn: CourtTurn): void {
    session.turns.push(turn);
    session.turnCount += 1;
}

async function handleFlaggedModeration(input: {
    store: CourtSessionStore;
    session: CourtSession;
    speaker: AgentId;
    moderationReasons: string[];
    activeBroadcast?: BroadcastAdapter;
}): Promise<void> {
    // eslint-disable-next-line no-console
    console.warn(
        `[moderation] content flagged session=${input.session.id} speaker=${input.speaker} reasons=${input.moderationReasons.join(',')}`,
    );

    const currentCount = input.session.metadata.objectionCount || 0;
    const newCount = currentCount + 1;
    input.session.metadata.objectionCount = newCount;

    input.store.emitEvent(input.session.id, 'objection_count_changed', {
        count: newCount,
        phase: input.session.phase,
        changedAt: new Date().toISOString(),
    });

    if (input.activeBroadcast) {
        const activeBroadcast = input.activeBroadcast;
        await safeBroadcastHook(
            'moderation_alert',
            () =>
                activeBroadcast.triggerModerationAlert({
                    reason: input.moderationReasons[0] ?? 'unknown',
                    phase: input.session.phase,
                    sessionId: input.session.id,
                }),
            (type, payload) =>
                input.store.emitEvent(input.session.id, type, {
                    phase: input.session.phase,
                    ...payload,
                }),
        );
    }
}

async function addJudgeModerationRedirect(input: {
    store: CourtSessionStore;
    session: CourtSession;
}): Promise<void> {
    const judgeId = input.session.metadata.roleAssignments.judge;
    const judgeTurn = await input.store.addTurn({
        sessionId: input.session.id,
        speaker: judgeId,
        role: 'judge',
        phase: input.session.phase,
        dialogue: MODERATION_REDIRECT_DIALOGUE,
    });

    appendTurnToSession(input.session, judgeTurn);
}

async function generateTurn(input: {
    store: CourtSessionStore;
    session: CourtSession;
    speaker: AgentId;
    role: CourtRole;
    userInstruction: string;
    maxTokens?: number;
    capConfig?: WitnessCapConfig;
    dialoguePrefix?: string;
    broadcast?: BroadcastAdapter;
    roleBudgetConfig?: RoleTokenBudgetConfig;
    onTokenSample?: (sample: {
        turnId: string;
        role: CourtRole;
        phase: CourtPhase;
        promptTokens: number;
        completionTokens: number;
    }) => void;
}): Promise<CourtTurn> {
    const { store, session, speaker, role, userInstruction } = input;

    const systemPrompt = buildCourtSystemPrompt({
        agentId: speaker,
        role,
        topic: session.topic,
        caseType: session.metadata.caseType,
        phase: session.phase,
        history: recentHistory(session.turns),
        genre: session.metadata.currentGenre, // Phase 3: Pass genre for prompt variations
    });

    const budgetResolution = resolveBudgetResolution({
        role: input.role,
        maxTokens: input.maxTokens,
        roleBudgetConfig: input.roleBudgetConfig,
    });

    const raw = await llmGenerate({
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userInstruction },
        ],
        temperature: session.phase === 'witness_exam' ? 0.8 : 0.7,
        maxTokens: budgetResolution.appliedMaxTokens,
    });

    let dialogue = sanitizeDialogue(raw);
    const capResult =
        input.capConfig ? applyWitnessCap(dialogue, input.capConfig) : null;
    if (capResult?.capped) {
        dialogue = capResult.text;
    }

    if (input.dialoguePrefix) {
        dialogue = `${input.dialoguePrefix} ${dialogue}`.trim();
    }

    const moderation = moderateContent(dialogue);
    const activeBroadcast = input.broadcast ?? broadcastBySession.get(session.id);

    if (moderation.flagged) {
        await handleFlaggedModeration({
            store,
            session,
            speaker,
            moderationReasons: moderation.reasons,
            activeBroadcast,
        });
    }

    const turn = await input.store.addTurn({
        sessionId: session.id,
        speaker,
        role,
        phase: session.phase,
        dialogue: moderation.sanitized,
        moderationResult:
            moderation.flagged ?
                { flagged: true, reasons: moderation.reasons }
            :   undefined,
    });

    appendTurnToSession(session, turn);

    store.emitEvent(session.id, 'token_budget_applied', {
        turnId: turn.id,
        speaker,
        role,
        phase: session.phase,
        requestedMaxTokens: budgetResolution.requestedMaxTokens,
        appliedMaxTokens: budgetResolution.appliedMaxTokens,
        roleMaxTokens: budgetResolution.roleMaxTokens,
        source: budgetResolution.source,
    });

    input.onTokenSample?.({
        turnId: turn.id,
        role,
        phase: session.phase,
        promptTokens:
            estimateTokens(systemPrompt) + estimateTokens(userInstruction),
        completionTokens: estimateTokens(moderation.sanitized),
    });

    if (moderation.flagged && role !== 'judge') {
        await addJudgeModerationRedirect({
            store,
            session,
        });
    }

    if (capResult?.capped && !moderation.flagged) {
        store.emitEvent(session.id, 'witness_response_capped', {
            turnId: turn.id,
            speaker,
            phase: session.phase,
            originalLength: capResult.originalTokens,
            truncatedLength: capResult.truncatedTokens,
            reason: capResult.reason ?? 'tokens',
        });
    }

    return turn;
}

function verdictOptions(caseType: CaseType): string[] {
    return caseType === 'civil' ?
            ['liable', 'not_liable']
        :   ['guilty', 'not_guilty'];
}

export interface RunCourtSessionOptions {
    ttsAdapter?: TTSAdapter;
    sleepFn?: (ms: number) => Promise<void>;
}

type GenerateTurnInput = Parameters<typeof generateTurn>[0];

function createGenerateBudgetedTurn(input: {
    roleTokenBudgetConfig: RoleTokenBudgetConfig;
    onTokenSample: (sample: TokenSample) => void;
}): GenerateBudgetedTurn {
    return turnInput =>
        generateTurn({
            ...turnInput,
            roleBudgetConfig: input.roleTokenBudgetConfig,
            onTokenSample: input.onTokenSample,
        });
}

export async function runCourtSession(
    sessionId: string,
    store: CourtSessionStore,
    options: RunCourtSessionOptions = {},
): Promise<void> {
    const session = await store.startSession(sessionId);
    const tts = options.ttsAdapter ?? createTTSAdapterFromEnv();
    const broadcast = await createBroadcastAdapterFromEnv(); // Phase 3: Initialize broadcast adapter
    broadcastBySession.set(session.id, broadcast);
    const pause = options.sleepFn ?? sleep;
    const witnessCapConfig = resolveWitnessCapConfig();
    const roleTokenBudgetConfig = resolveRoleTokenBudgetConfig();
    const recapCadence = resolveRecapCadence();
    const ttsMetrics = {
        success: 0,
        failure: 0,
    };
    const onTokenSample = createTokenSampleRecorder({
        store,
        sessionId: session.id,
        roleTokenBudgetConfig,
    });
    const generateBudgetedTurn = createGenerateBudgetedTurn({
        roleTokenBudgetConfig,
        onTokenSample,
    });
    const safelySpeak = createSafelySpeak({
        tts,
        sessionId: session.id,
        ttsMetrics,
    });

    const context: SessionRuntimeContext = {
        store,
        session,
        tts,
        broadcast,
        pause,
        safelySpeak,
        generateBudgetedTurn,
        witnessCapConfig,
        recapCadence,
    };

    try {
        await runCasePromptPhase(context);
        await runOpeningsPhase(context);
        await runWitnessExamPhase(context);

        // Phase 3: Evidence reveal phase (currently skipped, placeholder for future implementation)
        // TODO: Implement evidence_reveal phase logic
        // Example of how evidence could be revealed:
        // session.phase = 'evidence_reveal';
        // await store.setPhase(session.id, 'evidence_reveal', 15_000);
        // const evidenceText = await generateEvidenceCard(session, judge);
        // const evidenceId = `evidence_${Date.now()}`;
        // session.metadata.evidenceCards = session.metadata.evidenceCards || [];
        // session.metadata.evidenceCards.push({
        //     id: evidenceId,
        //     text: evidenceText,
        //     revealedAt: new Date().toISOString(),
        // });
        // store.emitEvent(session.id, 'evidence_revealed', {
        //     evidenceId,
        //     evidenceText,
        //     phase: 'evidence_reveal',
        //     revealedAt: new Date().toISOString(),
        // });
        // await pause(800);

        await runClosingsPhase(context);

        const verdictChoices = verdictOptions(session.metadata.caseType);
        await runVerdictVotePhase(context, verdictChoices);
        await runSentenceVotePhase(context);
        await runFinalRulingPhase(context, verdictChoices);
    } catch (error) {
        const message =
            error instanceof Error ?
                error.message
            :   'Unknown orchestration error';
        await store.failSession(session.id, message);
    } finally {
        broadcastBySession.delete(session.id);
        // eslint-disable-next-line no-console
        console.info(
            `[tts] session=${session.id} provider=${tts.provider} success=${ttsMetrics.success} failure=${ttsMetrics.failure}`,
        );
    }
}
