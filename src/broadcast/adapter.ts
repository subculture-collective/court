/**
 * Broadcast adapter interface for external stream automation hooks.
 *
 * Supports OBS WebSocket, NodeCG, and other broadcast systems.
 * All hooks are fail-safe: errors are logged but never throw.
 */

import type { CourtPhase } from '../types.js';

// ---------------------------------------------------------------------------
// Adapter Interface
// ---------------------------------------------------------------------------

export type BroadcastHookType =
    | 'phase_stinger'
    | 'scene_switch'
    | 'moderation_alert';

export interface PhaseStingerInput {
    phase: CourtPhase;
    sessionId: string;
}

export interface SceneSwitchInput {
    sceneName: string;
    phase: CourtPhase;
    sessionId: string;
}

export interface ModerationAlertInput {
    reason: string;
    phase: CourtPhase;
    sessionId: string;
}

/**
 * Broadcast adapter interface for triggering external stream automation.
 *
 * Implementations must:
 * - Be non-blocking (use async/await responsibly)
 * - Never throw errors (catch and log internally)
 * - Return quickly (< 500ms target for most operations)
 */
export interface BroadcastAdapter {
    readonly provider: string;

    /**
     * Trigger audio stinger or visual cue for phase transitions.
     */
    triggerPhaseStinger(input: PhaseStingerInput): Promise<void>;

    /**
     * Switch OBS/broadcast scene.
     */
    triggerSceneSwitch(input: SceneSwitchInput): Promise<void>;

    /**
     * Alert operator/moderator of flagged content.
     */
    triggerModerationAlert(input: ModerationAlertInput): Promise<void>;
}

// ---------------------------------------------------------------------------
// Noop Adapter (Default)
// ---------------------------------------------------------------------------

export class NoopBroadcastAdapter implements BroadcastAdapter {
    readonly provider = 'noop';

    async triggerPhaseStinger(input: PhaseStingerInput): Promise<void> {
        console.debug(
            `[broadcast:noop] Phase stinger triggered: phase=${input.phase} session=${input.sessionId}`,
        );
    }

    async triggerSceneSwitch(input: SceneSwitchInput): Promise<void> {
        console.debug(
            `[broadcast:noop] Scene switch triggered: scene=${input.sceneName} phase=${input.phase} session=${input.sessionId}`,
        );
    }

    async triggerModerationAlert(input: ModerationAlertInput): Promise<void> {
        console.debug(
            `[broadcast:noop] Moderation alert triggered: reason=${input.reason} phase=${input.phase} session=${input.sessionId}`,
        );
    }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export async function createBroadcastAdapterFromEnv(): Promise<BroadcastAdapter> {
    const provider = process.env.BROADCAST_PROVIDER || 'noop';

    switch (provider) {
        case 'noop':
            return new NoopBroadcastAdapter();

        case 'obs':
            try {
                // Dynamic import to avoid requiring obs-websocket-js as a dependency
                // when not using OBS integration
                const { OBSWebSocketAdapter } =
                    await import('./obs-adapter.js');
                return new OBSWebSocketAdapter();
            } catch (err) {
                console.warn(
                    `[broadcast] Failed to load OBS adapter: ${err}. Using noop.`,
                );
                return new NoopBroadcastAdapter();
            }

        default:
            console.warn(
                `[broadcast] Unknown provider: ${provider}. Using noop.`,
            );
            return new NoopBroadcastAdapter();
    }
}

// ---------------------------------------------------------------------------
// Fail-Safe Wrapper
// ---------------------------------------------------------------------------

/**
 * Execute a broadcast hook with fail-safe error handling.
 *
 * Guarantees:
 * - Never throws errors (catches and logs all failures)
 * - Emits broadcast_hook_triggered or broadcast_hook_failed events
 * - Logs latency metrics
 *
 * @param hookType - Type of broadcast hook being triggered
 * @param hookFn - Async function that executes the hook
 * @param emitEvent - Event emitter callback for telemetry
 */
export async function safeBroadcastHook(
    hookType: BroadcastHookType,
    hookFn: () => Promise<void>,
    emitEvent?: (
        type: 'broadcast_hook_triggered' | 'broadcast_hook_failed',
        payload: Record<string, unknown>,
    ) => void,
): Promise<void> {
    const startTime = Date.now();

    try {
        await hookFn();
        const latencyMs = Date.now() - startTime;

        console.debug(
            `[broadcast] Hook succeeded: type=${hookType} latencyMs=${latencyMs}`,
        );

        if (emitEvent) {
            emitEvent('broadcast_hook_triggered', {
                hookType,
                triggeredAt: new Date().toISOString(),
            });
        }
    } catch (err) {
        const latencyMs = Date.now() - startTime;
        const errorMsg = err instanceof Error ? err.message : String(err);

        console.error(
            `[broadcast] Hook failed: type=${hookType} latencyMs=${latencyMs} error=${errorMsg}`,
        );

        if (emitEvent) {
            emitEvent('broadcast_hook_failed', {
                hookType,
                error: errorMsg,
                failedAt: new Date().toISOString(),
            });
        }

        // Fail-safe: never throw, just log
    }
}
