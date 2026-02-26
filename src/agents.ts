import type { AgentConfig, AgentId } from './types.js';

export const AGENTS: Record<AgentId, AgentConfig> = {
    chora: {
        id: 'chora',
        displayName: 'Chora',
        role: 'Analyst',
        description:
            'Makes systems legible. Diagnoses structure, exposes assumptions, traces causality.',
        color: '#b4befe',
    },
    subrosa: {
        id: 'subrosa',
        displayName: 'Subrosa',
        role: 'Protector',
        description:
            'Preserves agency under asymmetry. Evaluates risk, protects optionality, maintains restraint.',
        color: '#f38ba8',
    },
    thaum: {
        id: 'thaum',
        displayName: 'Thaum',
        role: 'Innovator',
        description:
            'Restores motion when thought stalls. Reframes problems, introduces bounded novelty.',
        color: '#cba6f7',
    },
    praxis: {
        id: 'praxis',
        displayName: 'Praxis',
        role: 'Executor',
        description:
            'Ends deliberation responsibly. Translates intent into action and owns consequences.',
        color: '#a6e3a1',
    },
    mux: {
        id: 'mux',
        displayName: 'Mux',
        role: 'Operations',
        description:
            'Operational labor. Drafts, formats, transcribes, and packages outputs.',
        color: '#74c7ec',
    },
    primus: {
        id: 'primus',
        displayName: 'Primus',
        role: 'Sovereign',
        description:
            'Cold strategic leadership. Sets direction and makes final calls under ambiguity.',
        color: '#f5c2e7',
    },
};

export const AGENT_IDS = Object.keys(AGENTS) as AgentId[];

export function isValidAgent(id: string): id is AgentId {
    return id in AGENTS;
}
