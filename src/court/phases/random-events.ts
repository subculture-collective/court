export type EventSpeaker = 'witness' | 'bailiff' | 'judge' | 'opposing_counsel';

export interface RandomEvent {
    id: string;
    probability: number;
    speaker: EventSpeaker;
    userInstruction: string;
}

export const RANDOM_EVENTS: RandomEvent[] = [
    {
        id: 'witness_outburst',
        probability: 0.12,
        speaker: 'witness',
        userInstruction:
            'Have an emotional or bizarre outburst relevant to the case. Stay in character but go off-script in an unexpected way that reveals something about your relationship to the events.',
    },
    {
        id: 'dramatic_revelation',
        probability: 0.08,
        speaker: 'witness',
        userInstruction:
            'Blurt out an unexpected detail that reframes the entire case. Make it dramatic, specific to the case topic, and something neither side was expecting.',
    },
    {
        id: 'bailiff_interruption',
        probability: 0.08,
        speaker: 'bailiff',
        userInstruction:
            'Briefly interrupt proceedings to address a minor courtroom disturbance. Keep it short, procedural, and mildly absurd.',
    },
    {
        id: 'gallery_disruption',
        probability: 0.06,
        speaker: 'judge',
        userInstruction:
            'Restore order after the public gallery disrupts proceedings. Be authoritative and slightly exasperated. One or two sentences.',
    },
    {
        id: 'evidence_challenged',
        probability: 0.10,
        speaker: 'opposing_counsel',
        userInstruction:
            'Challenge the evidentiary basis of the preceding question or answer. Be specific about what you are challenging and why it is inadmissible or misleading.',
    },
];

/**
 * Checks whether a random event fires this round.
 * Accepts an injectable `rng` for deterministic testing.
 * Returns at most one event; returns null if none fire.
 */
export function checkRandomEvent(rng: () => number = Math.random): RandomEvent | null {
    // Shuffle catalogue so higher-probability events don't always win on ties
    const shuffled = [...RANDOM_EVENTS].sort(() => rng() - 0.5);
    for (const event of shuffled) {
        if (rng() < event.probability) {
            return event;
        }
    }
    return null;
}
