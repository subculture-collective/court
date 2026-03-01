/**
 * Twitch Chat Bot Integration
 *
 * IRC client for reading chat commands and EventSub webhook for channel point redemptions.
 * Commands are forwarded to court API endpoints. Runs in noop mode when credentials absent.
 */

import type { EventEmitter } from 'events';
import {
    CommandRateLimiter,
    DEFAULT_COMMAND_RATE_LIMIT,
} from './command-rate-limit.js';

export interface BotConfig {
    channel: string;
    botToken: string;
    clientId: string;
    clientSecret: string;
    apiBaseUrl: string;
}

export interface ParsedCommand {
    action: 'press' | 'present' | 'vote' | 'sentence';
    username: string;
    timestamp: number;
    params?: Record<string, any>;
}

export interface RedemptionEvent {
    type: 'objection' | 'hold_it' | 'order_in_court';
    username: string;
    rewardId: string;
    timestamp: number;
}

/**
 * Main Twitch bot class
 * Handles IRC chat commands and EventSub redemptions
 */
export class TwitchBot {
    private config: BotConfig | null;
    private isActive: boolean = false;
    private eventEmitter: EventEmitter | null = null;
    private commandRateLimiter: CommandRateLimiter;

    constructor(config?: BotConfig) {
        // Initialize rate limiter regardless of config
        this.commandRateLimiter = new CommandRateLimiter(
            DEFAULT_COMMAND_RATE_LIMIT,
        );

        // Graceful noop mode if credentials missing
        if (!config || !this.hasRequiredEnvVars()) {
            console.log(
                'Twitch bot disabled: missing credentials. Set TWITCH_CHANNEL, TWITCH_BOT_TOKEN, TWITCH_CLIENT_ID.',
            );
            this.config = null;
            this.isActive = false;
            return;
        }

        this.config = config;
    }

    private hasRequiredEnvVars(): boolean {
        return !!(
            process.env.TWITCH_CHANNEL &&
            process.env.TWITCH_BOT_TOKEN &&
            process.env.TWITCH_CLIENT_ID &&
            process.env.TWITCH_CLIENT_SECRET
        );
    }

    /**
     * Initialize bot: connect to IRC and register EventSub
     */
    public async start(): Promise<void> {
        if (!this.config || !this.isActive) {
            return;
        }

        console.log(`[Twitch Bot] Starting bot for ${this.config.channel}`);

        try {
            await this.connectIRC();
            console.log('[Twitch Bot] IRC connected');

            await this.registerEventSub();
            console.log('[Twitch Bot] EventSub registered');

            this.isActive = true;
        } catch (err) {
            console.error('[Twitch Bot] Failed to start:', err);
            this.isActive = false;
        }
    }

    /**
     * Connect to Twitch IRC
     * Stub implementation — will use tmi.js
     */
    private async connectIRC(): Promise<void> {
        // Will be implemented with tmi.js
        // For now, stub
        console.log('[Twitch Bot] IRC connection stub');
    }

    /**
     * Register WebSocket subscription for channel point redemptions
     * Stub implementation — will use EventSub client
     */
    private async registerEventSub(): Promise<void> {
        // Will be implemented with EventSub API
        // For now, stub
        console.log('[Twitch Bot] EventSub registration stub');
    }

    /**
     * Handle incoming chat command
     * Returns parsed command or null if invalid
     */
    public parseCommand(
        message: string,
        username: string,
    ): ParsedCommand | null {
        // Check rate limit first
        const rateLimitCheck = this.commandRateLimiter.check(username, message);
        if (!rateLimitCheck.allowed) {
            console.warn(
                `[Twitch Bot] Command rate limited for ${username}: ${rateLimitCheck.reason}`,
            );
            return null;
        }

        // Will delegate to commands.ts parser
        // For now, stub
        console.log(`[Twitch Bot] Parsed command from ${username}: ${message}`);
        return null;
    }

    /**
     * Get the command rate limiter (for testing or external access)
     */
    public getCommandRateLimiter(): CommandRateLimiter {
        return this.commandRateLimiter;
    }

    /**
     * Handle channel point redemption
     */
    public handleRedemption(event: RedemptionEvent): void {
        // Will be implemented
        console.log(
            `[Twitch Bot] Redemption: ${event.type} by ${event.username}`,
        );
    }

    /**
     * Stop bot and disconnect
     */
    public async stop(): Promise<void> {
        if (!this.isActive) {
            return;
        }

        console.log('[Twitch Bot] Stopping bot');
        this.isActive = false;
        // Cleanup: disconnect IRC, unregister EventSub
    }

    public isRunning(): boolean {
        return this.isActive;
    }
}

/**
 * Global bot instance
 */
let globalBot: TwitchBot | null = null;

export function initTwitchBot(config?: BotConfig): TwitchBot {
    if (globalBot) {
        console.warn(
            'Twitch bot already initialized, returning existing instance',
        );
        return globalBot;
    }

    // Initialize from env vars if not provided
    const finalConfig: BotConfig | undefined = config || {
        channel: process.env.TWITCH_CHANNEL || '',
        botToken: process.env.TWITCH_BOT_TOKEN || '',
        clientId: process.env.TWITCH_CLIENT_ID || '',
        clientSecret: process.env.TWITCH_CLIENT_SECRET || '',
        apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:3000',
    };

    globalBot = new TwitchBot(finalConfig);
    return globalBot;
}

export function getTwitchBot(): TwitchBot | null {
    return globalBot;
}

export function destroyTwitchBot(): void {
    if (globalBot) {
        globalBot.stop();
        globalBot = null;
    }
}
