export type VoteSpamRejectionReason = 'rate_limited' | 'duplicate_vote';

export interface VoteSpamDecision {
    allowed: boolean;
    reason?: VoteSpamRejectionReason;
    retryAfterMs?: number;
}

export interface VoteSpamConfig {
    /** Max votes per IP per session within the time window. */
    maxVotesPerWindow: number;
    /** Time window in milliseconds. */
    windowMs: number;
    /** Duplicate/replay window for identical votes. */
    duplicateWindowMs: number;
}

const DEFAULT_CONFIG: VoteSpamConfig = {
    maxVotesPerWindow: 10,
    windowMs: 60_000,
    duplicateWindowMs: 5_000,
};

type VoteType = 'verdict' | 'sentence';

interface VoteRecord {
    timestamps: number[];
    recentChoices: Map<string, number>;
}

export class VoteSpamGuard {
    private readonly config: VoteSpamConfig;
    /** Map key = `${sessionId}:${ip}:${voteType}` */
    private readonly records = new Map<string, VoteRecord>();

    constructor(config?: Partial<VoteSpamConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    check(
        sessionId: string,
        ip: string,
        voteType: VoteType,
        choice: string,
    ): VoteSpamDecision {
        const key = `${sessionId}:${ip}:${voteType}`;
        const now = Date.now();
        const cutoff = now - this.config.windowMs;
        const duplicateCutoff = now - this.config.duplicateWindowMs;

        let record = this.records.get(key);
        if (!record) {
            record = { timestamps: [], recentChoices: new Map() };
            this.records.set(key, record);
        }

        this.cleanupRecord(record, cutoff, duplicateCutoff);

        const lastChoiceAt = record.recentChoices.get(choice);
        if (lastChoiceAt !== undefined && lastChoiceAt > duplicateCutoff) {
            return {
                allowed: false,
                reason: 'duplicate_vote',
                retryAfterMs: Math.max(
                    0,
                    lastChoiceAt + this.config.duplicateWindowMs - now,
                ),
            };
        }

        if (record.timestamps.length >= this.config.maxVotesPerWindow) {
            const oldest = record.timestamps[0] ?? now;
            return {
                allowed: false,
                reason: 'rate_limited',
                retryAfterMs: Math.max(
                    0,
                    oldest + this.config.windowMs - now,
                ),
            };
        }

        record.timestamps.push(now);
        record.recentChoices.set(choice, now);

        return { allowed: true };
    }

    /**
     * Remove stale entries (call periodically to prevent memory leaks).
     */
    prune(): void {
        const now = Date.now();
        const cutoff = now - this.config.windowMs;
        const duplicateCutoff = now - this.config.duplicateWindowMs;
        for (const [key, record] of this.records) {
            this.cleanupRecord(record, cutoff, duplicateCutoff);
            if (
                record.timestamps.length === 0 &&
                record.recentChoices.size === 0
            ) {
                this.records.delete(key);
            }
        }
    }

    private cleanupRecord(
        record: VoteRecord,
        cutoff: number,
        duplicateCutoff: number,
    ): void {
        record.timestamps = record.timestamps.filter(timestamp => timestamp > cutoff);
        for (const [value, timestamp] of record.recentChoices) {
            if (timestamp <= duplicateCutoff) {
                record.recentChoices.delete(value);
            }
        }
    }
}
