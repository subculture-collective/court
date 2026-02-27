export type AgentId =
    | 'chora'
    | 'subrosa'
    | 'thaum'
    | 'praxis'
    | 'mux'
    | 'primus';

export interface AgentConfig {
    id: AgentId;
    displayName: string;
    role: string;
    description: string;
    color: string;
}

export type CaseType = 'criminal' | 'civil';

export type CourtRole =
    | 'judge'
    | 'prosecutor'
    | 'defense'
    | 'witness_1'
    | 'witness_2'
    | 'witness_3'
    | 'bailiff';

export type CourtPhase =
    | 'case_prompt'
    | 'openings'
    | 'witness_exam'
    | 'evidence_reveal'
    | 'closings'
    | 'verdict_vote'
    | 'sentence_vote'
    | 'final_ruling';

export type SessionStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface CourtRoleAssignments {
    judge: AgentId;
    prosecutor: AgentId;
    defense: AgentId;
    witnesses: AgentId[];
    bailiff: AgentId;
}

export interface CourtTurn {
    id: string;
    sessionId: string;
    turnNumber: number;
    speaker: AgentId;
    role: CourtRole;
    phase: CourtPhase;
    dialogue: string;
    createdAt: string;
}

export interface CourtSessionMetadata {
    mode: 'improv_court';
    casePrompt: string;
    caseType: CaseType;
    sentenceOptions: string[];
    phaseStartedAt?: string;
    phaseDurationMs?: number;
    verdictVoteWindowMs: number;
    sentenceVoteWindowMs: number;
    verdictVotes: Record<string, number>;
    sentenceVotes: Record<string, number>;
    finalRuling?: {
        verdict: string;
        sentence: string;
        decidedAt: string;
    };
    roleAssignments: CourtRoleAssignments;
}

export interface CourtSession {
    id: string;
    topic: string;
    status: SessionStatus;
    participants: AgentId[];
    phase: CourtPhase;
    turnCount: number;
    turns: CourtTurn[];
    metadata: CourtSessionMetadata;
    createdAt: string;
    startedAt?: string;
    completedAt?: string;
    failureReason?: string;
}

export type CourtEventType =
    | 'session_created'
    | 'session_started'
    | 'phase_changed'
    | 'turn'
    | 'vote_updated'
    | 'session_completed'
    | 'session_failed';

export interface CourtEvent {
    id: string;
    sessionId: string;
    type: CourtEventType;
    at: string;
    payload: Record<string, unknown>;
}

export interface LLMMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface LLMGenerateOptions {
    messages: LLMMessage[];
    model?: string;
    temperature?: number;
    maxTokens?: number;
}
