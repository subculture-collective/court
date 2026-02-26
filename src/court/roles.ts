import type { AgentId, CourtRoleAssignments } from '../types.js';

function uniqueOrder(ids: AgentId[]): AgentId[] {
    return [...new Set(ids)];
}

function pickPreferred(
    preferred: AgentId,
    pool: AgentId[],
    used: Set<AgentId>,
): AgentId {
    if (pool.includes(preferred) && !used.has(preferred)) {
        used.add(preferred);
        return preferred;
    }

    const fallback = pool.find(agentId => !used.has(agentId)) ?? pool[0];
    used.add(fallback);
    return fallback;
}

export function assignCourtRoles(
    participants: AgentId[],
): CourtRoleAssignments {
    const pool = uniqueOrder(participants);
    const used = new Set<AgentId>();

    const judge = pickPreferred('primus', pool, used);
    const bailiff = pickPreferred('mux', pool, used);
    const prosecutor = pickPreferred('subrosa', pool, used);
    const defense = pickPreferred('chora', pool, used);

    const witnesses = pool.filter(agentId => !used.has(agentId)).slice(0, 3);

    return {
        judge,
        prosecutor,
        defense,
        witnesses,
        bailiff,
    };
}
