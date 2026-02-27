import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import postgres, { type Sql } from 'postgres';
import type {
    AgentId,
    CaseType,
    CourtEvent,
    CourtPhase,
    CourtRole,
    CourtSession,
    CourtSessionMetadata,
    CourtTurn,
} from '../types.js';
import { runMigrations } from '../db/migrations.js';

export class CourtValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CourtValidationError';
    }
}

export class CourtNotFoundError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CourtNotFoundError';
    }
}

function deepCopy<T>(value: T): T {
    return structuredClone(value);
}

const PHASE_SEQUENCE: CourtPhase[] = [
    'case_prompt',
    'openings',
    'witness_exam',
    'evidence_reveal',
    'closings',
    'verdict_vote',
    'sentence_vote',
    'final_ruling',
];

function phaseIndex(phase: CourtPhase): number {
    return PHASE_SEQUENCE.indexOf(phase);
}

function assertValidPhaseTransition(current: CourtPhase, next: CourtPhase): void {
    const currentIndex = phaseIndex(current);
    const nextIndex = phaseIndex(next);
    if (currentIndex === -1) {
        throw new CourtValidationError(`Unknown current phase: ${current}`);
    }
    if (nextIndex === -1) {
        throw new CourtValidationError(`Unknown next phase: ${next}`);
    }
    const isNoop = currentIndex === nextIndex;
    const isForwardStep = nextIndex === currentIndex + 1;
    const skipEvidenceReveal =
        current === 'witness_exam' && next === 'closings';
    if (!isNoop && !isForwardStep && !skipEvidenceReveal) {
        throw new CourtValidationError(
            `Invalid phase transition: ${current} -> ${next}`,
        );
    }
}

function allowedVerdictChoices(caseType: CaseType): string[] {
    return caseType === 'civil' ?
            ['liable', 'not_liable']
        :   ['guilty', 'not_guilty'];
}

function pollTypeForPhase(phase: CourtPhase): 'verdict' | 'sentence' | undefined {
    if (phase === 'verdict_vote') return 'verdict';
    if (phase === 'sentence_vote') return 'sentence';
    return undefined;
}

export interface CourtSessionStore {
    createSession(input: {
        topic: string;
        participants: AgentId[];
        metadata: CourtSessionMetadata;
    }): Promise<CourtSession>;
    listSessions(): Promise<CourtSession[]>;
    getSession(sessionId: string): Promise<CourtSession | undefined>;
    startSession(sessionId: string): Promise<CourtSession>;
    setPhase(
        sessionId: string,
        phase: CourtPhase,
        phaseDurationMs?: number,
    ): Promise<CourtSession>;
    addTurn(input: {
        sessionId: string;
        speaker: AgentId;
        role: CourtRole;
        phase: CourtPhase;
        dialogue: string;
        moderationResult?: {
            flagged: boolean;
            reasons: string[];
        };
    }): Promise<CourtTurn>;
    castVote(input: {
        sessionId: string;
        voteType: 'verdict' | 'sentence';
        choice: string;
    }): Promise<CourtSession>;
    recordFinalRuling(input: {
        sessionId: string;
        verdict: string;
        sentence: string;
    }): Promise<CourtSession>;
    completeSession(sessionId: string): Promise<CourtSession>;
    failSession(sessionId: string, reason: string): Promise<CourtSession>;
    recoverInterruptedSessions(): Promise<string[]>;
    subscribe(
        sessionId: string,
        handler: (event: CourtEvent) => void,
    ): () => void;
    emitEvent(
        sessionId: string,
        type: CourtEvent['type'],
        payload: Record<string, unknown>,
    ): void;
}

class InMemoryCourtSessionStore implements CourtSessionStore {
    private readonly sessions = new Map<string, CourtSession>();
    private readonly eventEmitter = new EventEmitter();

    async createSession(input: {
        topic: string;
        participants: AgentId[];
        metadata: CourtSessionMetadata;
    }): Promise<CourtSession> {
        const session: CourtSession = {
            id: randomUUID(),
            topic: input.topic,
            status: 'pending',
            participants: deepCopy(input.participants),
            phase: 'case_prompt',
            turnCount: 0,
            turns: [],
            metadata: deepCopy(input.metadata),
            createdAt: new Date().toISOString(),
        };

        this.sessions.set(session.id, session);
        this.publish({
            sessionId: session.id,
            type: 'session_created',
            payload: { session: deepCopy(session) },
        });

        return deepCopy(session);
    }

    async listSessions(): Promise<CourtSession[]> {
        const sorted = [...this.sessions.values()].sort((a, b) =>
            a.createdAt < b.createdAt ? 1 : -1,
        );
        return deepCopy(sorted);
    }

    async getSession(sessionId: string): Promise<CourtSession | undefined> {
        const session = this.sessions.get(sessionId);
        return session ? deepCopy(session) : undefined;
    }

    async startSession(sessionId: string): Promise<CourtSession> {
        const session = this.mustGet(sessionId);
        session.status = 'running';
        session.startedAt = new Date().toISOString();

        this.publish({
            sessionId,
            type: 'session_started',
            payload: { sessionId, startedAt: session.startedAt },
        });

        return deepCopy(session);
    }

    async setPhase(
        sessionId: string,
        phase: CourtPhase,
        phaseDurationMs?: number,
    ): Promise<CourtSession> {
        const session = this.mustGet(sessionId);
        const previousPhase = session.phase;
        assertValidPhaseTransition(session.phase, phase);
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

        const closingPoll = pollTypeForPhase(previousPhase);
        if (closingPoll && previousPhase !== phase) {
            this.publish({
                sessionId,
                type: 'analytics_event',
                payload: {
                    name: 'poll_closed',
                    pollType: closingPoll,
                    phase,
                },
            });
        }

        const openingPoll = pollTypeForPhase(phase);
        if (openingPoll && previousPhase !== phase) {
            this.publish({
                sessionId,
                type: 'analytics_event',
                payload: {
                    name: 'poll_started',
                    pollType: openingPoll,
                    phase,
                },
            });
        }

        return deepCopy(session);
    }

    async addTurn(input: {
        sessionId: string;
        speaker: AgentId;
        role: CourtRole;
        phase: CourtPhase;
        dialogue: string;
        moderationResult?: {
            flagged: boolean;
            reasons: string[];
        };
    }): Promise<CourtTurn> {
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

        if (input.moderationResult?.flagged) {
            this.publish({
                sessionId: input.sessionId,
                type: 'moderation_action',
                payload: {
                    turnId: turn.id,
                    speaker: input.speaker,
                    reasons: input.moderationResult.reasons,
                    phase: input.phase,
                },
            });
        }

        return deepCopy(turn);
    }

    async castVote(input: {
        sessionId: string;
        voteType: 'verdict' | 'sentence';
        choice: string;
    }): Promise<CourtSession> {
        const session = this.mustGet(input.sessionId);
        if (
            (input.voteType === 'verdict' && session.phase !== 'verdict_vote') ||
            (input.voteType === 'sentence' && session.phase !== 'sentence_vote')
        ) {
            throw new CourtValidationError(
                `Cannot cast ${input.voteType} vote during phase ${session.phase}`,
            );
        }

        if (input.voteType === 'verdict') {
            const validChoices = allowedVerdictChoices(session.metadata.caseType);
            if (!validChoices.includes(input.choice)) {
                throw new CourtValidationError(
                    `Invalid verdict choice: ${input.choice}. Valid choices: ${validChoices.join(', ')}`,
                );
            }
        } else if (!session.metadata.sentenceOptions.includes(input.choice)) {
            throw new CourtValidationError(
                `Invalid sentence choice: ${input.choice}. Valid choices: ${session.metadata.sentenceOptions.join(', ')}`,
            );
        }

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
        this.publish({
            sessionId: input.sessionId,
            type: 'analytics_event',
            payload: {
                name: 'vote_completed',
                pollType: input.voteType,
                choice: input.choice,
            },
        });

        return deepCopy(session);
    }

    async recordFinalRuling(input: {
        sessionId: string;
        verdict: string;
        sentence: string;
    }): Promise<CourtSession> {
        const session = this.mustGet(input.sessionId);
        session.metadata.finalRuling = {
            verdict: input.verdict,
            sentence: input.sentence,
            decidedAt: new Date().toISOString(),
        };
        return deepCopy(session);
    }

    async completeSession(sessionId: string): Promise<CourtSession> {
        const session = this.mustGet(sessionId);
        session.status = 'completed';
        session.completedAt = new Date().toISOString();

        this.publish({
            sessionId,
            type: 'session_completed',
            payload: { sessionId, completedAt: session.completedAt },
        });

        return deepCopy(session);
    }

    async failSession(
        sessionId: string,
        reason: string,
    ): Promise<CourtSession> {
        const session = this.mustGet(sessionId);
        session.status = 'failed';
        session.failureReason = reason;
        session.completedAt = new Date().toISOString();

        this.publish({
            sessionId,
            type: 'session_failed',
            payload: { sessionId, reason, completedAt: session.completedAt },
        });

        return deepCopy(session);
    }

    async recoverInterruptedSessions(): Promise<string[]> {
        return [];
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

    emitEvent(
        sessionId: string,
        type: CourtEvent['type'],
        payload: Record<string, unknown>,
    ): void {
        this.publish({ sessionId, type, payload });
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
            throw new CourtNotFoundError(`Session not found: ${sessionId}`);
        }
        return session;
    }

    private channel(sessionId: string): string {
        return `session:${sessionId}`;
    }
}

interface SessionRow {
    id: string;
    topic: string;
    status: CourtSession['status'];
    participants: AgentId[];
    phase: CourtPhase;
    turn_count: number;
    metadata: CourtSessionMetadata;
    failure_reason: string | null;
    created_at: Date | string;
    started_at: Date | string | null;
    completed_at: Date | string | null;
}

interface TurnRow {
    id: string;
    session_id: string;
    turn_number: number;
    speaker: AgentId;
    role: CourtRole;
    phase: CourtPhase;
    dialogue: string;
    created_at: Date | string;
}

class PostgresCourtSessionStore implements CourtSessionStore {
    private readonly eventEmitter = new EventEmitter();

    constructor(private readonly db: Sql) {}

    static async create(
        databaseUrl: string,
    ): Promise<PostgresCourtSessionStore> {
        const db = postgres(databaseUrl, { max: 10 });
        await runMigrations(db);
        return new PostgresCourtSessionStore(db);
    }

    async createSession(input: {
        topic: string;
        participants: AgentId[];
        metadata: CourtSessionMetadata;
    }): Promise<CourtSession> {
        const sessionId = randomUUID();

        const [row] = await this.db<SessionRow[]>`
            INSERT INTO court_sessions (
                id,
                topic,
                status,
                participants,
                phase,
                turn_count,
                metadata
            ) VALUES (
                ${sessionId},
                ${input.topic},
                'pending',
                ${this.db.json(input.participants)},
                'case_prompt',
                0,
                ${this.db.json(input.metadata as any)}
            )
            RETURNING *
        `;

        const session = this.mapSession(row, []);
        this.publish({
            sessionId,
            type: 'session_created',
            payload: { session },
        });

        return session;
    }

    async listSessions(): Promise<CourtSession[]> {
        const rows = await this.db<SessionRow[]>`
            SELECT *
            FROM court_sessions
            ORDER BY created_at DESC
        `;

        const sessions = await Promise.all(
            rows.map(async row => {
                const turns = await this.fetchTurns(row.id);
                return this.mapSession(row, turns);
            }),
        );

        return sessions;
    }

    async getSession(sessionId: string): Promise<CourtSession | undefined> {
        const [row] = await this.db<SessionRow[]>`
            SELECT *
            FROM court_sessions
            WHERE id = ${sessionId}
            LIMIT 1
        `;

        if (!row) return undefined;

        const turns = await this.fetchTurns(sessionId);
        return this.mapSession(row, turns);
    }

    async startSession(sessionId: string): Promise<CourtSession> {
        const [row] = await this.db<SessionRow[]>`
            UPDATE court_sessions
            SET status = 'running',
                started_at = COALESCE(started_at, NOW())
            WHERE id = ${sessionId}
            RETURNING *
        `;

        if (!row) {
            throw new CourtNotFoundError(`Session not found: ${sessionId}`);
        }

        const turns = await this.fetchTurns(sessionId);
        const session = this.mapSession(row, turns);

        this.publish({
            sessionId,
            type: 'session_started',
            payload: { sessionId, startedAt: session.startedAt },
        });

        return session;
    }

    async setPhase(
        sessionId: string,
        phase: CourtPhase,
        phaseDurationMs?: number,
    ): Promise<CourtSession> {
        const result = await this.db.begin(async (tx: any) => {
            const [current] = await tx<SessionRow[]>`
                SELECT *
                FROM court_sessions
                WHERE id = ${sessionId}
                FOR UPDATE
            `;

            if (!current) {
                throw new CourtNotFoundError(`Session not found: ${sessionId}`);
            }
            assertValidPhaseTransition(current.phase, phase);

            const metadata = {
                ...(current.metadata ?? {}),
            } as CourtSessionMetadata;
            metadata.phaseStartedAt = new Date().toISOString();
            if (phaseDurationMs != null) {
                metadata.phaseDurationMs = phaseDurationMs;
            }

            const [updated] = await tx<SessionRow[]>`
                UPDATE court_sessions
                SET phase = ${phase},
                    metadata = ${tx.json(metadata as unknown as Record<string, unknown>)}
                WHERE id = ${sessionId}
                RETURNING *
            `;

            return {
                updated,
                previousPhase: current.phase,
            };
        });

        const turns = await this.fetchTurns(sessionId);
        const session = this.mapSession(result.updated, turns);

        this.publish({
            sessionId,
            type: 'phase_changed',
            payload: {
                phase,
                phaseStartedAt: session.metadata.phaseStartedAt,
                phaseDurationMs: session.metadata.phaseDurationMs,
            },
        });

        const closingPoll = pollTypeForPhase(result.previousPhase);
        if (closingPoll && result.previousPhase !== phase) {
            this.publish({
                sessionId,
                type: 'analytics_event',
                payload: {
                    name: 'poll_closed',
                    pollType: closingPoll,
                    phase,
                },
            });
        }

        const openingPoll = pollTypeForPhase(phase);
        if (openingPoll && result.previousPhase !== phase) {
            this.publish({
                sessionId,
                type: 'analytics_event',
                payload: {
                    name: 'poll_started',
                    pollType: openingPoll,
                    phase,
                },
            });
        }

        return session;
    }

    async addTurn(input: {
        sessionId: string;
        speaker: AgentId;
        role: CourtRole;
        phase: CourtPhase;
        dialogue: string;
        moderationResult?: {
            flagged: boolean;
            reasons: string[];
        };
    }): Promise<CourtTurn> {
        const turn = await this.db.begin(async (tx: any) => {
            const [session] = await tx<SessionRow[]>`
                SELECT id, turn_count
                FROM court_sessions
                WHERE id = ${input.sessionId}
                FOR UPDATE
            `;

            if (!session) {
                throw new CourtNotFoundError(
                    `Session not found: ${input.sessionId}`,
                );
            }

            const turnId = randomUUID();
            const turnNumber = session.turn_count;
            const createdAt = new Date().toISOString();

            await tx`
                INSERT INTO court_turns (
                    id,
                    session_id,
                    turn_number,
                    speaker,
                    role,
                    phase,
                    dialogue,
                    created_at
                ) VALUES (
                    ${turnId},
                    ${input.sessionId},
                    ${turnNumber},
                    ${input.speaker},
                    ${input.role},
                    ${input.phase},
                    ${input.dialogue},
                    ${createdAt}
                )
            `;

            await tx`
                UPDATE court_sessions
                SET turn_count = turn_count + 1
                WHERE id = ${input.sessionId}
            `;

            return {
                id: turnId,
                sessionId: input.sessionId,
                turnNumber,
                speaker: input.speaker,
                role: input.role,
                phase: input.phase,
                dialogue: input.dialogue,
                createdAt,
            } satisfies CourtTurn;
        });

        this.publish({
            sessionId: input.sessionId,
            type: 'turn',
            payload: { turn },
        });

        if (input.moderationResult?.flagged) {
            this.publish({
                sessionId: input.sessionId,
                type: 'moderation_action',
                payload: {
                    turnId: turn.id,
                    speaker: input.speaker,
                    reasons: input.moderationResult.reasons,
                    phase: input.phase,
                },
            });
        }

        return turn;
    }

    async castVote(input: {
        sessionId: string;
        voteType: 'verdict' | 'sentence';
        choice: string;
    }): Promise<CourtSession> {
        const row = await this.db.begin(async (tx: any) => {
            const [current] = await tx<SessionRow[]>`
                SELECT *
                FROM court_sessions
                WHERE id = ${input.sessionId}
                FOR UPDATE
            `;

            if (!current) {
                throw new CourtNotFoundError(
                    `Session not found: ${input.sessionId}`,
                );
            }

            const metadata = {
                ...(current.metadata ?? {}),
            } as CourtSessionMetadata;
            metadata.verdictVotes ??= {};
            metadata.sentenceVotes ??= {};
            if (
                (input.voteType === 'verdict' &&
                    current.phase !== 'verdict_vote') ||
                (input.voteType === 'sentence' &&
                    current.phase !== 'sentence_vote')
            ) {
                throw new CourtValidationError(
                    `Cannot cast ${input.voteType} vote during phase ${current.phase}`,
                );
            }

            if (input.voteType === 'verdict') {
                const validChoices = allowedVerdictChoices(metadata.caseType);
                if (!validChoices.includes(input.choice)) {
                    throw new CourtValidationError(
                        `Invalid verdict choice: ${input.choice}. Valid choices: ${validChoices.join(', ')}`,
                    );
                }
                metadata.verdictVotes[input.choice] =
                    (metadata.verdictVotes[input.choice] ?? 0) + 1;
            } else {
                if (!metadata.sentenceOptions.includes(input.choice)) {
                    throw new CourtValidationError(
                        `Invalid sentence choice: ${input.choice}. Valid choices: ${metadata.sentenceOptions.join(', ')}`,
                    );
                }
                metadata.sentenceVotes[input.choice] =
                    (metadata.sentenceVotes[input.choice] ?? 0) + 1;
            }

            const [updated] = await tx<SessionRow[]>`
                UPDATE court_sessions
                SET metadata = ${tx.json(metadata as unknown as Record<string, unknown>)}
                WHERE id = ${input.sessionId}
                RETURNING *
            `;

            return updated;
        });

        const turns = await this.fetchTurns(input.sessionId);
        const session = this.mapSession(row, turns);

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
        this.publish({
            sessionId: input.sessionId,
            type: 'analytics_event',
            payload: {
                name: 'vote_completed',
                pollType: input.voteType,
                choice: input.choice,
            },
        });

        return session;
    }

    async recordFinalRuling(input: {
        sessionId: string;
        verdict: string;
        sentence: string;
    }): Promise<CourtSession> {
        const row = await this.db.begin(async (tx: any) => {
            const [current] = await tx<SessionRow[]>`
                SELECT *
                FROM court_sessions
                WHERE id = ${input.sessionId}
                FOR UPDATE
            `;

            if (!current) {
                throw new CourtNotFoundError(
                    `Session not found: ${input.sessionId}`,
                );
            }

            const metadata = {
                ...(current.metadata ?? {}),
            } as CourtSessionMetadata;
            metadata.finalRuling = {
                verdict: input.verdict,
                sentence: input.sentence,
                decidedAt: new Date().toISOString(),
            };

            const [updated] = await tx<SessionRow[]>`
                UPDATE court_sessions
                SET metadata = ${tx.json(metadata as unknown as Record<string, unknown>)}
                WHERE id = ${input.sessionId}
                RETURNING *
            `;

            return updated;
        });

        const turns = await this.fetchTurns(input.sessionId);
        return this.mapSession(row, turns);
    }

    async completeSession(sessionId: string): Promise<CourtSession> {
        const [row] = await this.db<SessionRow[]>`
            UPDATE court_sessions
            SET status = 'completed',
                completed_at = NOW()
            WHERE id = ${sessionId}
            RETURNING *
        `;

        if (!row) {
            throw new CourtNotFoundError(`Session not found: ${sessionId}`);
        }

        const turns = await this.fetchTurns(sessionId);
        const session = this.mapSession(row, turns);

        this.publish({
            sessionId,
            type: 'session_completed',
            payload: { sessionId, completedAt: session.completedAt },
        });

        return session;
    }

    async failSession(
        sessionId: string,
        reason: string,
    ): Promise<CourtSession> {
        const [row] = await this.db<SessionRow[]>`
            UPDATE court_sessions
            SET status = 'failed',
                failure_reason = ${reason},
                completed_at = NOW()
            WHERE id = ${sessionId}
            RETURNING *
        `;

        if (!row) {
            throw new CourtNotFoundError(`Session not found: ${sessionId}`);
        }

        const turns = await this.fetchTurns(sessionId);
        const session = this.mapSession(row, turns);

        this.publish({
            sessionId,
            type: 'session_failed',
            payload: { sessionId, reason, completedAt: session.completedAt },
        });

        return session;
    }

    async recoverInterruptedSessions(): Promise<string[]> {
        await this.db`
            UPDATE court_sessions
            SET status = 'failed',
                failure_reason = COALESCE(failure_reason, 'Interrupted by server restart'),
                completed_at = COALESCE(completed_at, NOW())
            WHERE status = 'running'
        `;

        const rows = await this.db<Array<{ id: string }>>`
            SELECT id
            FROM court_sessions
            WHERE status = 'pending'
            ORDER BY created_at ASC
        `;

        return rows.map(row => row.id);
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

    emitEvent(
        sessionId: string,
        type: CourtEvent['type'],
        payload: Record<string, unknown>,
    ): void {
        this.publish({ sessionId, type, payload });
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
            payload: deepCopy(input.payload),
        };

        this.eventEmitter.emit(this.channel(input.sessionId), event);
    }

    private async fetchTurns(sessionId: string): Promise<CourtTurn[]> {
        const rows = await this.db<TurnRow[]>`
            SELECT *
            FROM court_turns
            WHERE session_id = ${sessionId}
            ORDER BY turn_number ASC
        `;

        return rows.map(row => ({
            id: row.id,
            sessionId: row.session_id,
            turnNumber: row.turn_number,
            speaker: row.speaker,
            role: row.role,
            phase: row.phase,
            dialogue: row.dialogue,
            createdAt: this.mustIso(row.created_at),
        }));
    }

    private mapSession(row: SessionRow, turns: CourtTurn[]): CourtSession {
        return {
            id: row.id,
            topic: row.topic,
            status: row.status,
            participants: (row.participants ?? []) as AgentId[],
            phase: row.phase,
            turnCount: row.turn_count,
            turns,
            metadata: row.metadata,
            failureReason: row.failure_reason ?? undefined,
            createdAt: this.mustIso(row.created_at),
            startedAt: this.optionalIso(row.started_at),
            completedAt: this.optionalIso(row.completed_at),
        };
    }

    private mustIso(value: Date | string | null): string {
        if (!value) {
            throw new Error('Expected timestamp value to be non-null');
        }
        return typeof value === 'string' ?
                new Date(value).toISOString()
            :   value.toISOString();
    }

    private optionalIso(value: Date | string | null): string | undefined {
        if (!value) return undefined;
        return typeof value === 'string' ?
                new Date(value).toISOString()
            :   value.toISOString();
    }

    private channel(sessionId: string): string {
        return `session:${sessionId}`;
    }
}

export async function createCourtSessionStore(): Promise<CourtSessionStore> {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (!databaseUrl) {
        // eslint-disable-next-line no-console
        console.warn(
            'DATABASE_URL is not set; using in-memory session store. Data will not survive restarts.',
        );
        return new InMemoryCourtSessionStore();
    }

    return PostgresCourtSessionStore.create(databaseUrl);
}
