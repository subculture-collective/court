import type { CourtPhase, CourtTurn } from '../types.js';

// Max characters for the catch-up summary — fits comfortably in a
// subtitle banner at standard stream resolution (960×540).
export const DEFAULT_CASE_SO_FAR_MAX_CHARS = 220;

// Number of recent turns to stitch when no recap is available
const RECENT_TURNS_COUNT = 3;

export interface CatchupView {
    caseSoFar: string;
    phaseLabel: string;
    juryStepStatus: string;
}

function normalize(text: string, maxChars: number): string {
    // Ensure we always have room for at least one character plus an ellipsis
    const effectiveMax = Math.max(2, maxChars);
    const compact = text.replace(/\s+/g, ' ').trim();
    if (compact.length <= effectiveMax) {
        return compact;
    }
    return `${compact.slice(0, effectiveMax - 1).trimEnd()}…`;
}

export function buildCaseSoFarSummary(
    turns: CourtTurn[],
    recapTurnIds: Iterable<string> | undefined,
    maxChars = DEFAULT_CASE_SO_FAR_MAX_CHARS,
): string {
    const recapSet = new Set(recapTurnIds ?? []);
    const latestRecap = [...turns]
        .reverse()
        .find(turn => recapSet.has(turn.id));

    if (latestRecap?.dialogue) {
        return normalize(latestRecap.dialogue, maxChars);
    }

    const recentTurns = turns.slice(-RECENT_TURNS_COUNT);
    if (recentTurns.length === 0) {
        return 'The court has just opened. Waiting for opening statements.';
    }

    const recentTurnsSummary = recentTurns
        .map(turn => `${turn.speaker}: ${turn.dialogue}`)
        .join(' · ');
    return normalize(recentTurnsSummary, maxChars);
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
