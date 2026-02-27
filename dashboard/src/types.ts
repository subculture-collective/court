export interface CourtEvent {
    type: string;
    timestamp: string;
    sessionId?: string;
    phase?: string;
    speaker?: string;
    content?: string;
    voterId?: string;
    vote?: string;
    [key: string]: unknown;
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
