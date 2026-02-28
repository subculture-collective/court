import type { AgentId, CourtTurn } from '../types.js';

function recencyPenalty(
    agent: AgentId,
    speakCounts: Record<AgentId, number>,
    totalTurns: number,
): number {
    if (totalTurns === 0) return 0;
    const count = speakCounts[agent] ?? 0;
    return count / totalTurns;
}

export function selectFirstSpeaker(
    participants: AgentId[],
    coordinator: AgentId,
): AgentId {
    if (participants.includes(coordinator)) {
        return coordinator;
    }
    return participants[Math.floor(Math.random() * participants.length)];
}

export function selectNextSpeaker(context: {
    participants: AgentId[];
    lastSpeaker: AgentId;
    history: CourtTurn[];
}): AgentId {
    const { participants, lastSpeaker, history } = context;

    const speakCounts = Object.fromEntries(
        participants.map(participant => [participant, 0]),
    ) as Record<AgentId, number>;

    for (const turn of history) {
        speakCounts[turn.speaker] = (speakCounts[turn.speaker] ?? 0) + 1;
    }

    // Tuning: how much having spoken recently reduces selection probability
    const RECENCY_PENALTY_WEIGHT = 0.5;
    // Tuning: random jitter range to prevent deterministic speaker ordering
    const SELECTION_JITTER_RANGE = 0.4;

    const weights = participants.map(agent => {
        if (agent === lastSpeaker) return 0;

        let weight = 1;
        weight -= recencyPenalty(agent, speakCounts, history.length) * RECENCY_PENALTY_WEIGHT;
        weight += Math.random() * SELECTION_JITTER_RANGE - SELECTION_JITTER_RANGE / 2;

        return Math.max(0, weight);
    });

    const total = weights.reduce((sum, weight) => sum + weight, 0);
    if (total <= 0) {
        const candidates = participants.filter(agent => agent !== lastSpeaker);
        return candidates[Math.floor(Math.random() * candidates.length)];
    }

    let random = Math.random() * total;
    for (let i = 0; i < participants.length; i++) {
        random -= weights[i];
        if (random <= 0) return participants[i];
    }

    return participants[participants.length - 1];
}
