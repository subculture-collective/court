/**
 * Chat Command Rate Limiting
 *
 * Per-user rate limiting for Twitch chat commands
 * Prevents spam from individual users
 */

export interface CommandRateLimitConfig {
    maxCommandsPerWindow: number;
    windowMs: number;
    duplicateWindowMs: number;
}

export const DEFAULT_COMMAND_RATE_LIMIT: CommandRateLimitConfig = {
    maxCommandsPerWindow: 5, // 5 commands per window per user
    windowMs: 60_000, // 60 seconds
    duplicateWindowMs: 5_000, // 5 seconds for duplicate detection
};

export interface RateLimitDecision {
    allowed: boolean;
    reason?: string;
    retryAfterMs?: number;
}

/**
 * Per-user rate limiter for chat commands
 * Tracks command history per username
 */
export class CommandRateLimiter {
    private userCommands: Map<
        string,
        {
            count: number;
            window: number;
            lastCommand?: string;
            lastCommandTime?: number;
        }
    > = new Map();

    constructor(private config: CommandRateLimitConfig) {}

    /**
     * Check if a command from a user is allowed
     */
    public check(username: string, commandText: string): RateLimitDecision {
        const now = Date.now();
        let entry = this.userCommands.get(username);

        // Initialize or reset if window expired
        if (!entry || now - entry.window > this.config.windowMs) {
            entry = {
                count: 0,
                window: now,
            };
        }

        // Check for duplicate command (exact same message within duplicate window)
        if (
            entry.lastCommand === commandText &&
            entry.lastCommandTime &&
            now - entry.lastCommandTime < this.config.duplicateWindowMs
        ) {
            return {
                allowed: false,
                reason: 'duplicate_command',
                retryAfterMs: this.config.duplicateWindowMs,
            };
        }

        // Check command count in current window
        if (entry.count >= this.config.maxCommandsPerWindow) {
            const windowExpireTime = entry.window + this.config.windowMs;
            const retryAfterMs = Math.max(0, windowExpireTime - now);
            return {
                allowed: false,
                reason: 'rate_limited',
                retryAfterMs,
            };
        }

        // Allow command
        entry.count++;
        entry.lastCommand = commandText;
        entry.lastCommandTime = now;
        this.userCommands.set(username, entry);

        return { allowed: true };
    }

    /**
     * Reset rate limiter for a user (e.g., mods, special cases)
     */
    public reset(username?: string): void {
        if (username) {
            this.userCommands.delete(username);
        } else {
            this.userCommands.clear();
        }
    }

    /**
     * Clean up old entries (call periodically)
     */
    public cleanup(): void {
        const now = Date.now();
        const expired: string[] = [];

        for (const [username, entry] of this.userCommands.entries()) {
            if (now - entry.window > this.config.windowMs * 2) {
                expired.push(username);
            }
        }

        for (const username of expired) {
            this.userCommands.delete(username);
        }
    }
}
