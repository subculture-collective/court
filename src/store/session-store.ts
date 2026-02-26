import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type {
    AgentId,
    CourtEvent,
    CourtPhase,
    CourtRole,
    CourtSession,
    CourtSessionMetadata,
    CourtTurn,
} from '../types.js';

export class CourtSessionStore {
    private readonly sessions = new Map<string, CourtSession>();
    private readonly eventEmitter = new EventEmitter();

    createSession(input: {
        topic: string;
        participants: AgentId[];
        metadata: CourtSessionMetadata;
    }): CourtSession {
        const session: CourtSession = {
            id: randomUUID(),
            topic: input.topic,
            status: 'pending',
            participants: input.participants,
            phase: 'case_prompt',
            turnCount: 0,
            turns: [],
            metadata: input.metadata,
            createdAt: new Date().toISOString(),
        };

        this.sessions.set(session.id, session);
        this.publish({
            sessionId: session.id,
            type: 'session_created',
            payload: { session },
        });

        return session;
    }

    listSessions(): CourtSession[] {
        return [...this.sessions.values()].sort((a, b) =>
            a.createdAt < b.createdAt ? 1 : -1,
        );
    }

    getSession(sessionId: string): CourtSession | undefined {
        return this.sessions.get(sessionId);
    }

    startSession(sessionId: string): CourtSession {
        const session = this.mustGet(sessionId);
        session.status = 'running';
        session.startedAt = new Date().toISOString();

        this.publish({
            sessionId,
            type: 'session_started',
            payload: { sessionId, startedAt: session.startedAt },
        });

        return session;
    }

    setPhase(sessionId: string, phase: CourtPhase, phaseDurationMs?: number): CourtSession {
        const session = this.mustGet(sessionId);
        session.phase = phase;
        session.metadata.phaseStartedAt = new Date().toISOString();

        if (phaseDurationMs != null) {
            session.metadata.phaseDurationMs = phaseDurationMs;
        }

        this.publish({
            sessionId,
            type: 'phase_changed',
            payload: {
                phase,
                phaseStartedAt: session.metadata.phaseStartedAt,
                phaseDurationMs: session.metadata.phaseDurationMs,
            },
        });

        return session;
    }

    addTurn(input: {
        sessionId: string;
        speaker: AgentId;
        role: CourtRole;
        phase: CourtPhase;
        dialogue: string;
    }): CourtTurn {
        const session = this.mustGet(input.sessionId);

        const turn: CourtTurn = {
            id: randomUUID(),
            sessionId: input.sessionId,
            turnNumber: session.turns.length,
            speaker: input.speaker,
            role: input.role,
            phase: input.phase,
            dialogue: input.dialogue,
            createdAt: new Date().toISOString(),
        };

        session.turns.push(turn);
        session.turnCount = session.turns.length;

        this.publish({
            sessionId: input.sessionId,
            type: 'turn',
            payload: { turn },
        });

        return turn;
    }

    castVote(input: {
        sessionId: string;
        voteType: 'verdict' | 'sentence';
        choice: string;
    }): CourtSession {
        const session = this.mustGet(input.sessionId);

        if (input.voteType === 'verdict') {
            session.metadata.verdictVotes[input.choice] =
                (session.metadata.verdictVotes[input.choice] ?? 0) + 1;
        } else {
            session.metadata.sentenceVotes[input.choice] =
                (session.metadata.sentenceVotes[input.choice] ?? 0) + 1;
        }

        this.publish({
            sessionId: input.sessionId,
            type: 'vote_updated',
            payload: {
                voteType: input.voteType,
                choice: input.choice,
                verdictVotes: session.metadata.verdictVotes,
                sentenceVotes: session.metadata.sentenceVotes,
            },
        });

        return session;
    }

    completeSession(sessionId: string): CourtSession {
        const session = this.mustGet(sessionId);
        session.status = 'completed';
        session.completedAt = new Date().toISOString();

        this.publish({
            sessionId,
            type: 'session_completed',
            payload: { sessionId, completedAt: session.completedAt },
        });

        return session;
    }

    failSession(sessionId: string, reason: string): CourtSession {
        const session = this.mustGet(sessionId);
        session.status = 'failed';
        session.failureReason = reason;
        session.completedAt = new Date().toISOString();

        this.publish({
            sessionId,
            type: 'session_failed',
            payload: { sessionId, reason, completedAt: session.completedAt },
        });

        return session;
    }

    subscribe(
        sessionId: string,
        handler: (event: CourtEvent) => void,
    ): () => void {
        const channel = this.channel(sessionId);
        this.eventEmitter.on(channel, handler);

        return () => {
            this.eventEmitter.off(channel, handler);
        };
    }

    private publish(input: {
        sessionId: string;
        type: CourtEvent['type'];
        payload: Record<string, unknown>;
    }): void {
        const event: CourtEvent = {
            id: randomUUID(),
            sessionId: input.sessionId,
            type: input.type,
            at: new Date().toISOString(),
            payload: input.payload,
        };

        this.eventEmitter.emit(this.channel(input.sessionId), event);
    }

    private mustGet(sessionId: string): CourtSession {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
        }
        return session;
    }

    private channel(sessionId: string): string {
        return `session:${sessionId}`;
    }
}
