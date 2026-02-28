/**
 * Curated prompt bank with genre rotation logic.
 *
 * Provides a collection of case prompts organized by genre tags,
 * with deterministic rotation to avoid immediate repeats.
 */

import type {
    GenreTag,
    PromptBankEntry,
    CaseType,
    ModerationReasonCode,
} from '../types.js';
import { moderateContent } from '../moderation/content-filter.js';

// ---------------------------------------------------------------------------
// Prompt Bank
// ---------------------------------------------------------------------------

/**
 * Curated collection of case prompts organized by genre.
 * Each entry includes the full case prompt, case type, and activation flag.
 */
export const PROMPT_BANK: PromptBankEntry[] = [
    // Absurd Civil cases
    {
        id: 'absurd_civil_001',
        genre: 'absurd_civil',
        casePrompt:
            'A person is suing their neighbor for emotional damages after the neighbor trained their parrot to loudly recite Shakespearean insults at predictable hours.',
        caseType: 'civil',
        active: true,
    },
    {
        id: 'absurd_civil_002',
        genre: 'absurd_civil',
        casePrompt:
            'A food critic is suing a restaurant for serving a dish so delicious it caused them to forget how to write negative reviews.',
        caseType: 'civil',
        active: true,
    },
    {
        id: 'absurd_civil_003',
        genre: 'absurd_civil',
        casePrompt:
            'A professional mime is suing their understudy for violating the sacred code of silence by accidentally saying "ouch" during a performance.',
        caseType: 'civil',
        active: true,
    },

    // Cosmic Crime cases
    {
        id: 'cosmic_crime_001',
        genre: 'cosmic_crime',
        casePrompt:
            "A time traveler is accused of stealing their own past self's lunch from the break room refrigerator, creating a paradox.",
        caseType: 'criminal',
        active: true,
    },
    {
        id: 'cosmic_crime_002',
        genre: 'cosmic_crime',
        casePrompt:
            'An alien diplomat is charged with illegally importing forbidden gravity-defying dance moves to Earth nightclubs.',
        caseType: 'criminal',
        active: true,
    },
    {
        id: 'cosmic_crime_003',
        genre: 'cosmic_crime',
        casePrompt:
            'A wizard is accused of enchanting a coffee machine to produce sentient espresso that unionized and demanded benefits.',
        caseType: 'criminal',
        active: true,
    },

    // Workplace Tribunal cases
    {
        id: 'workplace_tribunal_001',
        genre: 'workplace_tribunal',
        casePrompt:
            'An employee is filing a grievance against their manager for mandatory attendance at 6 AM "sunrise gratitude circles" with interpretive dance.',
        caseType: 'civil',
        active: true,
    },
    {
        id: 'workplace_tribunal_002',
        genre: 'workplace_tribunal',
        casePrompt:
            'A programmer is suing their company for forcing them to use Comic Sans in all production code repositories.',
        caseType: 'civil',
        active: true,
    },
    {
        id: 'workplace_tribunal_003',
        genre: 'workplace_tribunal',
        casePrompt:
            'An office worker claims constructive dismissal after their cubicle was relocated to the "inspirational whale sounds meditation zone."',
        caseType: 'civil',
        active: true,
    },

    // Fantasy Court cases
    {
        id: 'fantasy_court_001',
        genre: 'fantasy_court',
        casePrompt:
            'A dragon is accused of insurance fraud for claiming fire damage on their own cave after a particularly enthusiastic sneeze.',
        caseType: 'criminal',
        active: true,
    },
    {
        id: 'fantasy_court_002',
        genre: 'fantasy_court',
        casePrompt:
            'A knight is suing their armor manufacturer for false advertising after the "dragon-proof" plating melted during the first encounter.',
        caseType: 'civil',
        active: true,
    },
    {
        id: 'fantasy_court_003',
        genre: 'fantasy_court',
        casePrompt:
            'A fairy godmother is charged with operating an unlicensed wish-granting business without proper magical permits.',
        caseType: 'criminal',
        active: true,
    },
];

// ---------------------------------------------------------------------------
// Rotation Logic
// ---------------------------------------------------------------------------

/**
 * Default rotation configuration.
 * - minDistance: 2 (genre used at session N cannot appear until session N+2)
 * - maxHistorySize: 10 (track last 10 genres for rotation decisions)
 */
export const DEFAULT_ROTATION_CONFIG = {
    minDistance: 2,
    maxHistorySize: 10,
};

const NO_ACTIVE_PROMPTS_ERROR =
    'No active prompts available in the prompt bank. Check PROMPT_BANK and activeGenres filter.';

function stableHash(input: string): number {
    let hash = 0;
    for (let i = 0; i < input.length; i += 1) {
        hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
    }
    return hash;
}

function getActivePromptCandidates(activeGenres?: GenreTag[]): PromptBankEntry[] {
    let candidates = PROMPT_BANK.filter(prompt => prompt.active);

    if (activeGenres && activeGenres.length > 0) {
        candidates = candidates.filter(prompt =>
            activeGenres.includes(prompt.genre),
        );
    }

    if (candidates.length === 0) {
        throw new Error(NO_ACTIVE_PROMPTS_ERROR);
    }

    return candidates;
}

function selectWithGenreRotation(rotationInput: {
    candidates: PromptBankEntry[];
    genreHistory: GenreTag[];
    minDistance: number;
    depletedPoolWarning: string;
}): PromptBankEntry {
    const recentGenres = new Set(
        rotationInput.genreHistory.slice(-rotationInput.minDistance).filter(Boolean),
    );

    let availablePrompts = rotationInput.candidates.filter(
        prompt => !recentGenres.has(prompt.genre),
    );

    if (availablePrompts.length === 0) {
        console.warn(rotationInput.depletedPoolWarning);
        availablePrompts = rotationInput.candidates;
    }

    const sortedPrompts = [...availablePrompts].sort((a, b) =>
        a.id.localeCompare(b.id),
    );
    const seed = stableHash(
        `${rotationInput.genreHistory.join('|')}|${sortedPrompts.map(prompt => prompt.id).join('|')}`,
    );

    return sortedPrompts[seed % sortedPrompts.length];
}

/**
 * Selects the next prompt from the bank, avoiding genres that violate
 * the minimum distance constraint.
 *
 * @param genreHistory - Array of recently used genres (most recent last)
 * @param activeGenres - Optional filter to restrict to specific genres
 * @param minDistance - Minimum sessions before genre can repeat (default: 2)
 * @returns Selected prompt entry
 * @deprecated Prefer selectNextSafePrompt for runtime usage.
 */
export function selectNextPrompt(
    genreHistory: GenreTag[] = [],
    activeGenres?: GenreTag[],
    minDistance: number = DEFAULT_ROTATION_CONFIG.minDistance,
): PromptBankEntry {
    return selectNextSafePrompt(genreHistory, activeGenres, minDistance, () => true);
}

export interface PromptSafetyResult {
    allowed: boolean;
    reasons: ModerationReasonCode[];
}

/**
 * Safety screen hook for prompt validation.
 * Checks prompts against the moderation pipeline.
 */
export function screenPromptForSession(
    prompt: PromptBankEntry,
): PromptSafetyResult {
    const moderation = moderateContent(prompt.casePrompt);
    return {
        allowed: !moderation.flagged,
        reasons: moderation.reasons,
    };
}

/**
 * Selects the next safe prompt from the bank, avoiding unsafe prompts.
 * Uses deterministic rotation and falls back to any safe prompt if needed.
 *
 * @param genreHistory - Array of recently used genres (most recent last)
 * @param activeGenres - Optional filter to restrict to specific genres
 * @param minDistance - Minimum sessions before genre can repeat
 * @param filter - Optional predicate applied to candidates (default: safety screen)
 */
export function selectNextSafePrompt(
    genreHistory: GenreTag[] = [],
    activeGenres?: GenreTag[],
    minDistance: number = DEFAULT_ROTATION_CONFIG.minDistance,
    filter: (candidate: PromptBankEntry) => boolean = candidate =>
        screenPromptForSession(candidate).allowed,
): PromptBankEntry {
    const candidates = getActivePromptCandidates(activeGenres);

    const filteredCandidates = candidates.filter(filter);

    if (filteredCandidates.length === 0) {
        throw new Error('No safe prompts available in the prompt bank.');
    }

    return selectWithGenreRotation({
        candidates: filteredCandidates,
        genreHistory,
        minDistance,
        depletedPoolWarning: `[prompt-bank] All safe genres recently used (history=${genreHistory.join(',')}). Allowing any safe genre.`,
    });
}

/**
 * Returns true if the prompt is active and passes moderation checks.
 */
export function validatePromptForSession(prompt: PromptBankEntry): boolean {
    return prompt.active && screenPromptForSession(prompt).allowed;
}

/**
 * Gets all unique genres currently in the active prompt bank.
 * Useful for UI genre selectors and analytics.
 */
export function getAvailableGenres(): GenreTag[] {
    const genres = new Set(PROMPT_BANK.filter(p => p.active).map(p => p.genre));
    return Array.from(genres);
}

/**
 * Gets all prompts for a specific genre.
 */
export function getPromptsByGenre(genre: GenreTag): PromptBankEntry[] {
    return PROMPT_BANK.filter(p => p.active && p.genre === genre);
}
