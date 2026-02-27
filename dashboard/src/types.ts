export type CourtEventType =
    | 'session_created'
    | 'session_started'
    | 'phase_changed'
    | 'turn'
    | 'vote_updated'
    | 'vote_closed'
    | 'witness_response_capped'
    | 'judge_recap_emitted'
    | 'token_budget_applied'
    | 'session_token_estimate'
    | 'analytics_event'
    | 'moderation_action'
    | 'vote_spam_blocked'
    | 'session_completed'
    | 'session_failed'
    | 'broadcast_hook_triggered'
    | 'broadcast_hook_failed'
    | 'evidence_revealed'
    | 'objection_count_changed';

export interface CourtEvent {
    id: string;
    sessionId: string;
    type: CourtEventType;
    at: string;
    payload: Record<string, unknown>;

    // Compatibility aliases used by Phase 3 dashboard widgets.
    timestamp?: string;
    phase?: string;
    speaker?: string;
    content?: string;
    voterId?: string;
    vote?: string;
    evidenceId?: string;
    evidenceText?: string;
    revealedAt?: string;
    count?: number;
    changedAt?: string;
    [key: string]: unknown;
}

export interface SnapshotMessage {
    type: 'snapshot';
    payload: Record<string, unknown>;
}

export type SSEMessage = CourtEvent | SnapshotMessage;

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
