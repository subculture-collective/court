/**
 * OBS WebSocket adapter for broadcast automation.
 *
 * Connects to OBS Studio via WebSocket 5.x protocol.
 * Requires obs-websocket-js package to be installed.
 *
 * Configuration via environment variables:
 * - OBS_WEBSOCKET_URL: WebSocket URL (default: ws://localhost:4455)
 * - OBS_WEBSOCKET_PASSWORD: Authentication password
 */

import type {
    BroadcastAdapter,
    PhaseStingerInput,
    SceneSwitchInput,
    ModerationAlertInput,
} from './adapter.js';

/**
 * OBS WebSocket adapter implementation.
 *
 * Phase stingers are triggered by sending custom events to OBS.
 * Scene switches use the SetCurrentProgramScene command.
 * Moderation alerts can trigger a visual indicator or scene overlay.
 *
 * Note: This is a simplified implementation. Full production version
 * would use the obs-websocket-js library for robust connection management.
 */
export class OBSWebSocketAdapter implements BroadcastAdapter {
    readonly provider = 'obs';
    private connected = false;
    private url: string;
    private password?: string;

    constructor(url?: string, password?: string) {
        this.url =
            url || process.env.OBS_WEBSOCKET_URL || 'ws://localhost:4455';
        this.password = password || process.env.OBS_WEBSOCKET_PASSWORD;
    }

    /**
     * Trigger phase stinger by sending custom event to OBS.
     * In production, this could trigger a media source or audio file.
     */
    async triggerPhaseStinger(input: PhaseStingerInput): Promise<void> {
        try {
            console.info(
                `[broadcast:obs] Triggering phase stinger: phase=${input.phase} session=${input.sessionId}`,
            );

            // TODO: Implement actual OBS WebSocket call
            // await this.sendCommand('TriggerStudioModeTransition', { /* ... */ });
            // or
            // await this.sendCommand('TriggerMediaInput', { inputName: `stinger_${input.phase}` });

            // For now, just log
            console.debug(
                `[broadcast:obs] Would trigger OBS stinger for phase: ${input.phase}`,
            );
        } catch (err) {
            console.error(
                `[broadcast:obs] Failed to trigger phase stinger: ${err}`,
            );
            // Fail-safe: never throw
        }
    }

    /**
     * Switch OBS scene using SetCurrentProgramScene command.
     */
    async triggerSceneSwitch(input: SceneSwitchInput): Promise<void> {
        try {
            console.info(
                `[broadcast:obs] Switching scene: scene=${input.sceneName} phase=${input.phase} session=${input.sessionId}`,
            );

            // TODO: Implement actual OBS WebSocket call
            // await this.sendCommand('SetCurrentProgramScene', { sceneName: input.sceneName });

            // For now, just log
            console.debug(
                `[broadcast:obs] Would switch to scene: ${input.sceneName}`,
            );
        } catch (err) {
            console.error(`[broadcast:obs] Failed to switch scene: ${err}`);
            // Fail-safe: never throw
        }
    }

    /**
     * Trigger moderation alert in OBS (e.g., show warning overlay).
     */
    async triggerModerationAlert(input: ModerationAlertInput): Promise<void> {
        try {
            console.info(
                `[broadcast:obs] Moderation alert: reason=${input.reason} phase=${input.phase} session=${input.sessionId}`,
            );

            // TODO: Implement actual OBS WebSocket call
            // await this.sendCommand('SetInputSettings', {
            //     inputName: 'moderation_alert',
            //     inputSettings: { visible: true, text: input.reason }
            // });

            // For now, just log
            console.debug(
                `[broadcast:obs] Would trigger moderation alert: ${input.reason}`,
            );
        } catch (err) {
            console.error(
                `[broadcast:obs] Failed to trigger moderation alert: ${err}`,
            );
            // Fail-safe: never throw
        }
    }

    /**
     * Placeholder for OBS WebSocket command sending.
     * Production implementation would use obs-websocket-js library.
     */
    private async sendCommand(
        requestType: string,
        requestData: Record<string, unknown>,
    ): Promise<void> {
        // TODO: Implement actual WebSocket connection and command sending
        // This would use obs-websocket-js:
        //
        // import OBSWebSocket from 'obs-websocket-js';
        // const obs = new OBSWebSocket();
        // await obs.connect(this.url, this.password);
        // await obs.call(requestType, requestData);
        // await obs.disconnect();

        console.debug(
            `[broadcast:obs] Would send OBS command: ${requestType}`,
            requestData,
        );
    }
}
