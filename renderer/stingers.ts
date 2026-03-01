/**
 * Composite Effect Stingers
 *
 * Named timelines that compose primitives from EffectsCueSystem
 * into memorable moments like "OBJECTION!" stinger from Ace Attorney
 */

import { EffectsCueSystem } from './effects.js';

export type StingerName =
    | 'objection'
    | 'hold_it'
    | 'present'
    | 'guilty_verdict'
    | 'not_guilty_verdict';

export interface StingerDefinition {
    name: StingerName;
    steps: StingerStep[];
}

export interface StingerStep {
    delayMs: number;
    action: 'sfx' | 'flash' | 'shake' | 'freeze' | 'stamp' | 'pause';
    params?: Record<string, any>;
}

/**
 * Predefined stinger timelines
 */
export const STINGER_DEFINITIONS: Record<StingerName, StingerDefinition> = {
    objection: {
        name: 'objection',
        steps: [
            // t=0ms: SFX + white flash
            { delayMs: 0, action: 'sfx', params: { name: 'objection' } },
            { delayMs: 0, action: 'flash', params: { durationMs: 120 } },

            // t=80ms: stamp "OBJECTION!"
            {
                delayMs: 80,
                action: 'stamp',
                params: { text: 'OBJECTION!', durationMs: 1200 },
            },

            // t=120ms: camera shake
            {
                delayMs: 120,
                action: 'shake',
                params: { intensity: 12, durationMs: 300 },
            },
        ],
    },

    hold_it: {
        name: 'hold_it',
        steps: [
            // t=0ms: SFX + white flash
            { delayMs: 0, action: 'sfx', params: { name: 'hold_it' } },
            { delayMs: 0, action: 'flash', params: { durationMs: 100 } },

            // t=70ms: stamp "HOLD IT!"
            {
                delayMs: 70,
                action: 'stamp',
                params: { text: 'HOLD IT!', durationMs: 1000 },
            },

            // t=100ms: camera shake (less intense than objection)
            {
                delayMs: 100,
                action: 'shake',
                params: { intensity: 8, durationMs: 250 },
            },
        ],
    },

    present: {
        name: 'present',
        steps: [
            // t=0ms: SFX
            { delayMs: 0, action: 'sfx', params: { name: 'dramatic_sting' } },

            // t=50ms: white flash
            { delayMs: 50, action: 'flash', params: { durationMs: 150 } },

            // t=100ms: stamp "PRESENT!"
            {
                delayMs: 100,
                action: 'stamp',
                params: { text: 'PRESENT!', durationMs: 1200 },
            },

            // t=120ms: shake
            {
                delayMs: 120,
                action: 'shake',
                params: { intensity: 10, durationMs: 280 },
            },
        ],
    },

    guilty_verdict: {
        name: 'guilty_verdict',
        steps: [
            // t=0ms: Gavel sound
            { delayMs: 0, action: 'sfx', params: { name: 'gavel' } },

            // t=40ms: Red flash (moderate)
            { delayMs: 40, action: 'flash', params: { durationMs: 100 } },

            // t=80ms: stamp "GUILTY"
            {
                delayMs: 80,
                action: 'stamp',
                params: { text: 'GUILTY', durationMs: 2000 },
            },

            // t=100ms: shake (strong for guilty verdict)
            {
                delayMs: 100,
                action: 'shake',
                params: { intensity: 15, durationMs: 400 },
            },
        ],
    },

    not_guilty_verdict: {
        name: 'not_guilty_verdict',
        steps: [
            // t=0ms: Gavel sound
            { delayMs: 0, action: 'sfx', params: { name: 'gavel' } },

            // t=40ms: Blue/white flash
            { delayMs: 40, action: 'flash', params: { durationMs: 100 } },

            // t=80ms: stamp "NOT GUILTY"
            {
                delayMs: 80,
                action: 'stamp',
                params: { text: 'NOT GUILTY', durationMs: 2000 },
            },

            // t=100ms: lighter shake
            {
                delayMs: 100,
                action: 'shake',
                params: { intensity: 10, durationMs: 300 },
            },
        ],
    },
};

/**
 * Stinger executor
 * Runs a named stinger timeline with correct timing
 */
export class StingerExecutor {
    private effects: EffectsCueSystem;

    constructor(effects: EffectsCueSystem) {
        this.effects = effects;
    }

    /**
     * Run a named stinger
     * Returns promise that resolves when stinger completes
     */
    public async runStinger(stingerName: StingerName): Promise<void> {
        const definition = STINGER_DEFINITIONS[stingerName];
        if (!definition) {
            console.warn(`Unknown stinger: ${stingerName}`);
            return;
        }

        // Execute all steps with delays
        const promises: Promise<void>[] = [];

        for (const step of definition.steps) {
            promises.push(
                new Promise<void>(resolve => {
                    setTimeout(() => {
                        this.executeStep(step).finally(resolve);
                    }, step.delayMs);
                }),
            );
        }

        // Wait for all steps to complete
        // The longest step determines total stinger duration
        await Promise.all(promises);
    }

    /**
     * Execute a single stinger step
     */
    private async executeStep(step: StingerStep): Promise<void> {
        try {
            switch (step.action) {
                case 'sfx':
                    this.effects.playSfx(step.params?.name || 'default');
                    break;

                case 'flash':
                    return this.effects.flashWhite(
                        step.params?.durationMs || 100,
                    );

                case 'shake':
                    return this.effects.shake(
                        step.params?.intensity || 10,
                        step.params?.durationMs || 200,
                    );

                case 'freeze':
                    return this.effects.freezeFrame(
                        step.params?.durationMs || 100,
                    );

                case 'stamp':
                    return this.effects.stamp(
                        step.params?.text || 'STAMP',
                        step.params?.durationMs || 1000,
                    );

                case 'pause':
                    // Simple delay
                    return new Promise(resolve => {
                        setTimeout(resolve, step.params?.durationMs || 100);
                    });

                default:
                    console.warn(`Unknown stinger action: ${step.action}`);
            }
        } catch (err) {
            console.error(`Error executing stinger step: ${step.action}`, err);
        }
    }
}

/**
 * Global stinger executor
 */
let globalExecutor: StingerExecutor | null = null;

export function initStingerExecutor(
    effects: EffectsCueSystem,
): StingerExecutor {
    if (globalExecutor) {
        console.warn('Stinger executor already initialized');
        return globalExecutor;
    }

    globalExecutor = new StingerExecutor(effects);
    return globalExecutor;
}

export function getStingerExecutor(): StingerExecutor | null {
    return globalExecutor;
}
