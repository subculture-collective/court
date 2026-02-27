export interface VoteSpamConfig {
    /** Max votes per IP per session within the time window. */
    maxVotesPerWindow: number;
    /** Time window in milliseconds. */
    windowMs: number;
}

const DEFAULT_CONFIG: VoteSpamConfig = {
    maxVotesPerWindow: 10,
    windowMs: 60_000,
};

interface VoteRecord {
    timestamps: number[];
}

export class VoteSpamGuard {
    private readonly config: VoteSpamConfig;
    /** Map key = `${sessionId}:${ip}` */
    private readonly records = new Map<string, VoteRecord>();

    constructor(config?: Partial<VoteSpamConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Returns `true` if the vote should be allowed, `false` if it is spam.
     */
    check(sessionId: string, ip: string): boolean {
        const key = `${sessionId}:${ip}`;
        const now = Date.now();
        const cutoff = now - this.config.windowMs;

        let record = this.records.get(key);
        if (!record) {
            record = { timestamps: [] };
            this.records.set(key, record);
        }

        record.timestamps = record.timestamps.filter(t => t > cutoff);

        if (record.timestamps.length >= this.config.maxVotesPerWindow) {
            return false;
        }

        record.timestamps.push(now);
        return true;
    }

    /**
     * Remove stale entries (call periodically to prevent memory leaks).
     */
    prune(): void {
        const now = Date.now();
        const cutoff = now - this.config.windowMs;
        for (const [key, record] of this.records) {
            record.timestamps = record.timestamps.filter(t => t > cutoff);
            if (record.timestamps.length === 0) {
                this.records.delete(key);
            }
        }
    }
}
