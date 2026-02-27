import { AGENTS } from '../agents.js';
import { llmGenerate, sanitizeDialogue } from '../llm/client.js';
import { moderateContent } from '../moderation/content-filter.js';
import type {
    AgentId,
    CaseType,
    CourtRole,
    CourtSession,
    CourtTurn,
} from '../types.js';
import type { CourtSessionStore } from '../store/session-store.js';
import { buildCourtSystemPrompt } from './personas.js';

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

function bestOf(votes: Record<string, number>, fallback: string): string {
    const entries = Object.entries(votes);
    if (entries.length === 0) return fallback;

    const sorted = [...entries].sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] ?? fallback;
}

async function generateTurn(input: {
    store: CourtSessionStore;
    session: CourtSession;
    speaker: AgentId;
    role: CourtRole;
    userInstruction: string;
}): Promise<void> {
    const { store, session, speaker, role, userInstruction } = input;

    const systemPrompt = buildCourtSystemPrompt({
        agentId: speaker,
        role,
        topic: session.topic,
        caseType: session.metadata.caseType,
        phase: session.phase,
        history: recentHistory(session.turns),
    });

    const raw = await llmGenerate({
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userInstruction },
        ],
        temperature: session.phase === 'witness_exam' ? 0.8 : 0.7,
        maxTokens: 260,
    });

    const sanitized = sanitizeDialogue(raw);
    const moderation = moderateContent(sanitized);

    if (moderation.flagged) {
        // eslint-disable-next-line no-console
        console.warn(
            `[moderation] content flagged session=${session.id} speaker=${speaker} reasons=${moderation.reasons.join(',')}`,
        );
    }

    await input.store.addTurn({
        sessionId: session.id,
        speaker,
        role,
        phase: session.phase,
        dialogue: moderation.sanitized,
        moderationResult: moderation.flagged ?
            { flagged: true, reasons: moderation.reasons }
        :   undefined,
    });
}

function verdictOptions(caseType: CaseType): string[] {
    return caseType === 'civil' ?
            ['liable', 'not_liable']
        :   ['guilty', 'not_guilty'];
}

export async function runCourtSession(
    sessionId: string,
    store: CourtSessionStore,
): Promise<void> {
    const session = await store.startSession(sessionId);

    try {
        const { judge, prosecutor, defense, witnesses, bailiff } =
            session.metadata.roleAssignments;

        session.phase = 'case_prompt';
        await store.setPhase(session.id, 'case_prompt', 8_000);
        await store.addTurn({
            sessionId: session.id,
            speaker: bailiff,
            role: 'bailiff',
            phase: 'case_prompt',
            dialogue: `All rise. The Court of Improvised Absurdity is now in session. Case: ${session.topic}`,
        });
        await sleep(1_200);

        session.phase = 'openings';
        await store.setPhase(session.id, 'openings', 30_000);
        await generateTurn({
            store,
            session,
            speaker: prosecutor,
            role: 'prosecutor',
            userInstruction:
                'Deliver your opening statement and explain why the court should lean toward conviction/liability.',
        });
        await sleep(900);
        await generateTurn({
            store,
            session,
            speaker: defense,
            role: 'defense',
            userInstruction:
                'Deliver your opening statement and establish reasonable doubt / non-liability.',
        });

        session.phase = 'witness_exam';
        await store.setPhase(session.id, 'witness_exam', 40_000);
        await sleep(600);

        const activeWitnesses = witnesses.slice(
            0,
            Math.max(1, witnesses.length),
        );
        let exchangeCount = 0;

        for (const [index, witness] of activeWitnesses.entries()) {
            await generateTurn({
                store,
                session,
                speaker: judge,
                role: 'judge',
                userInstruction: `Ask witness ${index + 1} a focused question about the core accusation.`,
            });
            await sleep(600);

            await generateTurn({
                store,
                session,
                speaker: witness,
                role: `witness_${Math.min(index + 1, 3)}` as CourtRole,
                userInstruction:
                    'Provide testimony in 1-3 sentences with one concrete detail and one comedic detail.',
            });
            await sleep(600);

            await generateTurn({
                store,
                session,
                speaker: prosecutor,
                role: 'prosecutor',
                userInstruction:
                    'Cross-examine this witness with one pointed challenge.',
            });
            await sleep(600);

            await generateTurn({
                store,
                session,
                speaker: defense,
                role: 'defense',
                userInstruction:
                    'Respond to the cross-exam and protect witness credibility in one short rebuttal.',
            });

            exchangeCount += 1;
            if (exchangeCount % 2 === 0) {
                await sleep(600);
                await generateTurn({
                    store,
                    session,
                    speaker: judge,
                    role: 'judge',
                    userInstruction:
                        'Give a two-sentence recap of what matters so far and keep the jury oriented.',
                });
            }

            await sleep(800);
        }

        session.phase = 'closings';
        await store.setPhase(session.id, 'closings', 30_000);
        await generateTurn({
            store,
            session,
            speaker: prosecutor,
            role: 'prosecutor',
            userInstruction:
                'Deliver closing argument in 2-4 sentences with one memorable line.',
        });
        await sleep(800);
        await generateTurn({
            store,
            session,
            speaker: defense,
            role: 'defense',
            userInstruction:
                'Deliver closing argument in 2-4 sentences and request acquittal/non-liability.',
        });

        const verdictChoices = verdictOptions(session.metadata.caseType);

        session.phase = 'verdict_vote';
        await store.setPhase(
            session.id,
            'verdict_vote',
            session.metadata.verdictVoteWindowMs,
        );
        await store.addTurn({
            sessionId: session.id,
            speaker: bailiff,
            role: 'bailiff',
            phase: 'verdict_vote',
            dialogue: `Jury poll is open: ${verdictChoices.join(' / ')}. Cast your votes now.`,
        });
        await sleep(session.metadata.verdictVoteWindowMs);

        session.phase = 'sentence_vote';
        await store.setPhase(
            session.id,
            'sentence_vote',
            session.metadata.sentenceVoteWindowMs,
        );
        await store.addTurn({
            sessionId: session.id,
            speaker: bailiff,
            role: 'bailiff',
            phase: 'sentence_vote',
            dialogue: `Sentence poll is now open. Options: ${session.metadata.sentenceOptions.join(' | ')}`,
        });
        await sleep(session.metadata.sentenceVoteWindowMs);

        session.phase = 'final_ruling';
        await store.setPhase(session.id, 'final_ruling', 20_000);

        const latest = await store.getSession(session.id);
        if (!latest) {
            throw new Error(
                `Session not found during final ruling: ${session.id}`,
            );
        }

        const winningVerdict = bestOf(
            latest.metadata.verdictVotes,
            verdictChoices[0],
        );
        const winningSentence = bestOf(
            latest.metadata.sentenceVotes,
            latest.metadata.sentenceOptions[0],
        );
        await store.recordFinalRuling({
            sessionId: session.id,
            verdict: winningVerdict,
            sentence: winningSentence,
        });

        await generateTurn({
            store,
            session,
            speaker: judge,
            role: 'judge',
            userInstruction: `Deliver the final ruling with dramatic comedic flair. Winning verdict: ${winningVerdict}. Winning sentence: ${winningSentence}. Mention both explicitly.`,
        });

        await store.completeSession(session.id);
    } catch (error) {
        const message =
            error instanceof Error ?
                error.message
            :   'Unknown orchestration error';
        await store.failSession(session.id, message);
    }
}
