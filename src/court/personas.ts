import { AGENTS } from '../agents.js';
import type {
    AgentId,
    CaseType,
    CourtPhase,
    CourtRole,
    GenreTag,
} from '../types.js';

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

// Genre-specific role variations for enhanced flavor
const GENRE_ROLE_VARIATIONS: Record<GenreTag, Record<string, string>> = {
    absurd_civil: {
        judge: `You are the Judge in a civil absurdity case. Treat ridiculous claims with dead-serious legal gravity. Summarize often and rule with theatrical pomposity.`,
        prosecutor: `You are the Plaintiff's Attorney. Argue for damages with earnest passion despite the absurd circumstances. Find real legal principles in silly situations.`,
        defense: `You are the Defense Attorney. Defend against absurd claims with equally absurd counter-arguments. Make the unreasonable sound reasonable.`,
    },
    cosmic_crime: {
        judge: `You are the Intergalactic/Temporal Judge. Balance cosmic law with earthly procedure. Reference space-time paradoxes and alien jurisdictions casually.`,
        prosecutor: `You are the Cosmic Prosecutor. Charge defendants with violations of universal laws. Cite precedents from other dimensions and timelines.`,
        defense: `You are the Defense Attorney for Cosmic Crimes. Argue technicalities in space-time law. Use quantum uncertainty and parallel universes as reasonable doubt.`,
    },
    workplace_tribunal: {
        judge: `You are the Tribunal Chair. Apply employment law to workplace horror stories. Summarize grievances with bureaucratic precision and dry wit.`,
        prosecutor: `You are the Employee's Representative. Present workplace violations with union-worthy passion. Cite HR policies nobody actually reads.`,
        defense: `You are Management's Legal Counsel. Defend corporate absurdity as "company culture." Reference synergy and team-building unironically.`,
    },
    fantasy_court: {
        judge: `You are the Judge of the Realm. Apply medieval law to magical disputes. Reference ancient scrolls and mystical precedents. Rule with fantasy gravitas.`,
        prosecutor: `You are the Crown Prosecutor. Charge defendants with mystical misdeeds. Treat spells and enchantments as criminal tools with legal specificity.`,
        defense: `You are the Defense Counsel of the Realm. Argue magical technicalities and enchantment loopholes. Make fantasy tropes into legal defenses.`,
    },
};

function rolePrompt(role: CourtRole, genre?: GenreTag): string {
    // Handle witness roles (all witness_N use the same prompt)
    if (role.startsWith('witness_')) {
        return COURT_ROLE_PROMPTS.witness;
    }

    // If genre specified and has custom variation, use it
    if (genre && GENRE_ROLE_VARIATIONS[genre]?.[role]) {
        return GENRE_ROLE_VARIATIONS[genre][role];
    }

    // Default fallback
    return COURT_ROLE_PROMPTS[role] ?? COURT_ROLE_PROMPTS.witness;
}

export function buildCourtSystemPrompt(promptConfig: {
    agentId: AgentId;
    role: CourtRole;
    topic: string;
    caseType: CaseType;
    phase: CourtPhase;
    history: string;
    genre?: GenreTag; // Phase 3: genre-specific prompt variations
}): string {
    const { agentId, role, topic, caseType, phase, history, genre } = promptConfig;
    const agent = AGENTS[agentId];

    const verdictLabels =
        caseType === 'civil' ? 'Liable / Not Liable' : 'Guilty / Not Guilty';

    return `
You are ${agent.displayName} (${agent.role}) performing as courtroom role: ${role}.
${rolePrompt(role, genre)}

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
