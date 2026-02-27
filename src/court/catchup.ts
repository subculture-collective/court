import type { CourtPhase, CourtTurn } from '../types.js';

export interface CatchupView {
    caseSoFar: string;
    phaseLabel: string;
    juryStepStatus: string;
}

function normalize(text: string, maxChars: number): string {
    const compact = text.replace(/\s+/g, ' ').trim();
    if (compact.length <= maxChars) {
        return compact;
    }
    return `${compact.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

export function buildCaseSoFarSummary(
    turns: CourtTurn[],
    recapTurnIds: Iterable<string> | undefined,
    maxChars = 220,
): string {
    const recapSet = new Set(recapTurnIds ?? []);
    const latestRecap = [...turns]
        .reverse()
        .find(turn => recapSet.has(turn.id));

    if (latestRecap?.dialogue) {
        return normalize(latestRecap.dialogue, maxChars);
    }

    const recentTurns = turns.slice(-3);
    if (recentTurns.length === 0) {
        return 'The court has just opened. Waiting for opening statements.';
    }

    const stitched = recentTurns
        .map(turn => `${turn.speaker}: ${turn.dialogue}`)
        .join(' · ');
    return normalize(stitched, maxChars);
}

export function juryStepFromPhase(phase: CourtPhase): string {
    switch (phase) {
        case 'case_prompt':
            return 'Jury pending — court intro in progress';
        case 'openings':
            return 'Jury listening — opening statements';
        case 'witness_exam':
            return 'Jury observing witness examination';
        case 'evidence_reveal':
            return 'Jury reviewing evidence reveal';
        case 'closings':
            return 'Jury preparing for verdict vote';
        case 'verdict_vote':
            return 'Jury voting — verdict poll is live';
        case 'sentence_vote':
            return 'Jury voting — sentence poll is live';
        case 'final_ruling':
            return 'Jury complete — ruling delivered';
        default: {
            const _never: never = phase;
            throw new Error(`Unknown phase: ${String(_never)}`);
        }
    }
}

export function buildCatchupView(input: {
    phase: CourtPhase;
    turns: CourtTurn[];
    recapTurnIds?: Iterable<string>;
}): CatchupView {
    return {
        caseSoFar: buildCaseSoFarSummary(input.turns, input.recapTurnIds),
        phaseLabel: input.phase,
        juryStepStatus: juryStepFromPhase(input.phase),
    };
}
