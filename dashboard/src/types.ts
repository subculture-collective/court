export type CourtEventType =
    | 'session_created'
    | 'session_started'
    | 'phase_changed'
    | 'turn'
    | 'vote_updated'
    | 'vote_closed'
    | 'witness_response_capped'
    | 'judge_recap_emitted'
    | 'analytics_event'
    | 'moderation_action'
    | 'vote_spam_blocked'
    | 'session_completed'
    | 'session_failed';

export interface CourtEvent {
    id: string;
    sessionId: string;
    type: CourtEventType;
    at: string;
    payload: Record<string, unknown>;
}

export interface SnapshotMessage {
    type: 'snapshot';
    payload: Record<string, unknown>;
}

export type SSEMessage = CourtEvent | SnapshotMessage;

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
