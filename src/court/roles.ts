import { AGENT_IDS, AGENTS } from '../agents.js';
import type { AgentId, CourtRoleAssignments, RoleArchetype } from '../types.js';

function shuffle<T>(arr: T[]): T[] {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

function buildArchetypePool(archetype: RoleArchetype, source: AgentId[]): AgentId[] {
    return source.filter(id => AGENTS[id].roleArchetypes.includes(archetype));
}

function pickOne(pool: AgentId[], used: Set<AgentId>): AgentId {
    const available = shuffle(pool).filter(id => !used.has(id));
    if (available.length === 0) {
        const fallback = AGENT_IDS.find(id => !used.has(id));
        if (!fallback) throw new Error('Roster exhausted — not enough characters for all roles');
        used.add(fallback);
        return fallback;
    }
    used.add(available[0]);
    return available[0];
}

function pickMany(pool: AgentId[], used: Set<AgentId>, max: number): AgentId[] {
    const available = shuffle(pool).filter(id => !used.has(id));
    const picks = available.slice(0, max);
    for (const id of picks) used.add(id);
    return picks;
}

function assignFromPool(source: AgentId[]): CourtRoleAssignments {
    const used = new Set<AgentId>();
    const judge = pickOne(buildArchetypePool('judge', source), used);
    const prosecutor = pickOne(buildArchetypePool('prosecutor', source), used);
    const defense = pickOne(buildArchetypePool('defense', source), used);
    const bailiff = pickOne(buildArchetypePool('bailiff', source), used);
    const witnesses = pickMany(buildArchetypePool('witness', source), used, 3);
    return { judge, prosecutor, defense, witnesses, bailiff };
}

export function assignCourtRoles(participants?: AgentId[]): CourtRoleAssignments {
    return assignFromPool(participants ?? AGENT_IDS);
}

export function participantsFromRoleAssignments(ra: CourtRoleAssignments): AgentId[] {
    return [ra.judge, ra.prosecutor, ra.defense, ra.bailiff, ...ra.witnesses];
}
