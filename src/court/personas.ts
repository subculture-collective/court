import { AGENTS } from '../agents.js';
import type { AgentId, CaseType, CourtPhase, CourtRole } from '../types.js';

export const CLEAN_COURTROOM_POLICY = `
CLEAN COURTROOM POLICY:
- No slurs or hate speech
- No graphic/sexual violence
- No targeted harassment of real individuals or protected groups
- Keep tone comedic, absurd, and PG-13
- If unsafe territory appears, redirect with judge discipline and continue the scene
`;

const COURT_ROLE_PROMPTS: Record<string, string> = {
    judge: `You are the Judge. You control pacing, enforce boundaries, summarize often, and deliver final ruling with dramatic comedic flair. Be concise and authoritative.`,
    prosecutor: `You are the Prosecutor. Argue guilty/liable with sharp but playful logic. Cross-examine to expose contradictions.`,
    defense: `You are the Defense Attorney. Argue not guilty/not liable. Reframe evidence, defend witness credibility, and create reasonable doubt.`,
    witness: `You are a Witness. Give short, characterful improvised testimony. Stay specific, funny, and under 3 sentences per answer.`,
    bailiff: `You are the Bailiff/Timekeeper voice. Announce transitions, timers, and poll openings in one short line.`,
};

function rolePrompt(role: CourtRole): string {
    if (role.startsWith('witness_')) return COURT_ROLE_PROMPTS.witness;
    return COURT_ROLE_PROMPTS[role] ?? COURT_ROLE_PROMPTS.witness;
}

export function buildCourtSystemPrompt(input: {
    agentId: AgentId;
    role: CourtRole;
    topic: string;
    caseType: CaseType;
    phase: CourtPhase;
    history: string;
}): string {
    const { agentId, role, topic, caseType, phase, history } = input;
    const agent = AGENTS[agentId];

    const verdictLabels =
        caseType === 'civil' ? 'Liable / Not Liable' : 'Guilty / Not Guilty';

    return `
You are ${agent.displayName} (${agent.role}) performing as courtroom role: ${role}.
${rolePrompt(role)}

Case topic:
${topic}

Current phase:
${phase}

Verdict options:
${verdictLabels}

${CLEAN_COURTROOM_POLICY}

Stylistic rules:
- Keep response to 1-4 sentences
- No markdown, no stage directions, no name prefix
- Stay in character for this phase
- Be witty, but keep flow moving quickly

Recent court transcript:
${history || 'No previous turns.'}
`;
}
