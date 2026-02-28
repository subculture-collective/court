/**
 * Twitch chat integration — reads chat messages and channel-point redemptions
 * to drive audience interactions (#77).
 *
 * Placeholder-first: when TWITCH_CHANNEL is empty the adapter is a no-op.
 * When configured, it connects to a Twitch IRC channel and:
 *
 *   1. Forwards `!press` / `!present` / `!objection` commands to the server
 *      via an internal callback.
 *   2. Accepts outbound messages from the orchestrator (phase transitions,
 *      vote prompts) and posts them as chat messages.
 *
 * This module does NOT handle EventSub directly — it uses a lightweight
 * IRC-only approach for MVP.  EventSub / channel-point webhooks can be
 * added later behind the same adapter interface.
 */

import type { CourtSessionStore } from '../store/session-store.js';
import type { CourtSession } from '../types.js';

export interface TwitchConfig {
    channel: string;
    botToken: string;
    clientId: string;
}

export interface TwitchChatCommand {
    command: 'press' | 'present' | 'objection';
    username: string;
    args: string[];
}

export interface TwitchAdapter {
    readonly enabled: boolean;
    sendChat(message: string): void;
    onCommand(handler: (cmd: TwitchChatCommand) => void): void;
    disconnect(): void;
}

/**
 * Resolve Twitch config from environment.
 */
export function resolveTwitchConfig(
    env: NodeJS.ProcessEnv = process.env,
): TwitchConfig | null {
    const channel = env.TWITCH_CHANNEL?.trim();
    const botToken = env.TWITCH_BOT_TOKEN?.trim();
    const clientId = env.TWITCH_CLIENT_ID?.trim();

    if (!channel || !botToken || !clientId) {
        return null;
    }

    return { channel, botToken, clientId };
}

/**
 * Create a no-op Twitch adapter for when Twitch is not configured.
 */
function createNoopAdapter(): TwitchAdapter {
    return {
        enabled: false,
        sendChat: () => {},
        onCommand: () => {},
        disconnect: () => {},
    };
}

/**
 * Parse a chat line for recognised commands.
 * Recognised: !press, !present <evidence_id>, !objection
 */
function parseCommand(
    message: string,
    username: string,
): TwitchChatCommand | null {
    const trimmed = message.trim();
    if (!trimmed.startsWith('!')) return null;

    const parts = trimmed.split(/\s+/);
    const cmd = parts[0].slice(1).toLowerCase();

    if (cmd === 'press' || cmd === 'present' || cmd === 'objection') {
        return {
            command: cmd as TwitchChatCommand['command'],
            username,
            args: parts.slice(1),
        };
    }

    return null;
}

/**
 * Create the Twitch adapter.  Returns a no-op adapter when not configured.
 *
 * Note: actual IRC connection is deferred until a real Twitch SDK/lib is
 * integrated.  This placeholder adapter logs commands and exposes the
 * interface so the rest of the system can wire up.
 */
export function createTwitchAdapter(
    env: NodeJS.ProcessEnv = process.env,
): TwitchAdapter {
    const config = resolveTwitchConfig(env);
    if (!config) {
        return createNoopAdapter();
    }

    const commandHandlers: Array<(cmd: TwitchChatCommand) => void> = [];

    // eslint-disable-next-line no-console
    console.info(
        `[twitch] adapter created channel=${config.channel} (IRC connection deferred)`,
    );

    return {
        enabled: true,
        sendChat(message: string) {
            // eslint-disable-next-line no-console
            console.info(
                `[twitch] sendChat channel=${config.channel} message=${message.slice(0, 100)}`,
            );
        },
        onCommand(handler: (cmd: TwitchChatCommand) => void) {
            commandHandlers.push(handler);
        },
        disconnect() {
            commandHandlers.length = 0;
            // eslint-disable-next-line no-console
            console.info(`[twitch] adapter disconnected`);
        },
    };
}

/**
 * Wire Twitch commands to the session store.
 * Auto-emits events when audience interacts through chat.
 */
export async function wireTwitchToSession(
    adapter: TwitchAdapter,
    store: CourtSessionStore,
    sessionId: string,
): Promise<void> {
    if (!adapter.enabled) return;

    adapter.onCommand(async cmd => {
        switch (cmd.command) {
            case 'objection': {
                // Audience objection: read current count, increment, and persist
                const session = await store.getSession(sessionId);
                const currentCount = session?.metadata?.objectionCount ?? 0;
                const newCount = currentCount + 1;
                await store.patchMetadata(sessionId, {
                    objectionCount: newCount,
                });
                store.emitEvent(sessionId, 'objection_count_changed', {
                    count: newCount,
                    phase: session?.phase ?? 'witness_exam',
                    changedAt: new Date().toISOString(),
                });
                break;
            }

            case 'press':
                // Audience press — logged for future implementation
                // eslint-disable-next-line no-console
                console.info(
                    `[twitch] press command user=${cmd.username} session=${sessionId}`,
                );
                break;

            case 'present':
                // Audience present evidence — logged for future implementation
                // eslint-disable-next-line no-console
                console.info(
                    `[twitch] present command user=${cmd.username} args=${cmd.args.join(',')} session=${sessionId}`,
                );
                break;
        }
    });
}

// Re-export for testing
export { parseCommand as _parseCommand };
