export interface CourtEvent {
    type: string;
    timestamp: string;
    sessionId?: string;
    phase?: string;
    speaker?: string;
    content?: string;
    voterId?: string;
    vote?: string;
    // Phase 3 additions
    evidenceId?: string;
    evidenceText?: string;
    revealedAt?: string;
    count?: number;
    changedAt?: string;
    [key: string]: unknown;
}

// Phase 3 payload types
export interface EvidenceRevealedPayload {
    evidenceId: string;
    evidenceText: string;
    phase: string;
    revealedAt: string;
}

export interface ObjectionCountChangedPayload {
    count: number;
    phase: string;
    changedAt: string;
}

export interface SessionSnapshot {
    sessionId: string;
    phase: string;
    transcript: TranscriptEntry[];
    votes: Record<string, VoteCount>;
    recapCount: number;
    witnessCaps: {
        witness1: number;
        witness2: number;
    };
    config: {
        maxWitnessStatements: number;
        recapInterval: number;
    };
}

export interface TranscriptEntry {
    speaker: string;
    content: string;
    timestamp: string;
    isRecap?: boolean;
}

export interface VoteCount {
    guilty: number;
    innocent: number;
    total: number;
}
