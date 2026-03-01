/**
 * Render Directive Consumer
 *
 * Consumes render directives from turn events via SSE stream
 * and triggers corresponding effects in the renderer
 */

import { EffectsCueSystem } from './effects.js';
import { StingerExecutor } from './stingers.js';

export interface RenderDirective {
    sfx?: string[];
    fx?: Array<{
        type: 'flash' | 'shake' | 'freeze' | 'hit_stop';
        params?: Record<string, any>;
    }>;
    stinger?: string;
}

/**
 * Handles execution of render directives
 */
export class RenderDirectiveHandler {
    private effects: EffectsCueSystem;
    private stingers: StingerExecutor;

    constructor(effects: EffectsCueSystem, stingers: StingerExecutor) {
        this.effects = effects;
        this.stingers = stingers;
    }

    /**
     * Process render directives from a turn event
     */
    public async handle(directive: RenderDirective | undefined): Promise<void> {
        if (!directive) {
            return;
        }

        const promises: Promise<void>[] = [];

        // Execute SFX
        if (directive.sfx) {
            for (const sfxName of directive.sfx) {
                this.effects.playSfx(sfxName);
            }
        }

        // Execute individual effects
        if (directive.fx) {
            for (const fx of directive.fx) {
                const promise = this.executeFx(fx);
                if (promise) {
                    promises.push(promise);
                }
            }
        }

        // Execute composite stinger (overrides individual effects)
        if (directive.stinger) {
            try {
                const stingerName = directive.stinger as any;
                await this.stingers.runStinger(stingerName);
            } catch (err) {
                console.error('Failed to run stinger:', err);
            }
        }

        // Wait for all effects to complete
        await Promise.all(promises);
    }

    /**
     * Execute a single FX directive
     */
    private executeFx(fx: {
        type: 'flash' | 'shake' | 'freeze' | 'hit_stop';
        params?: Record<string, any>;
    }): Promise<void> | undefined {
        const { type, params = {} } = fx;

        switch (type) {
            case 'flash':
                return this.effects.flashWhite(params.durationMs || 120);

            case 'shake':
                return this.effects.shake(
                    params.intensity || 10,
                    params.durationMs || 200,
                );

            case 'freeze':
                return this.effects.freezeFrame(params.durationMs || 100);

            case 'hit_stop':
                return this.effects.hitStop(params.durationMs || 50);

            default:
                console.warn(`Unknown FX type: ${type}`);
                return undefined;
        }
    }
}
