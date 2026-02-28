import {
    Counter,
    Gauge,
    Histogram,
    Registry,
    collectDefaultMetrics,
} from 'prom-client';
import {
    CourtNotFoundError,
    CourtValidationError,
    type CourtSessionStore,
} from './store/session-store.js';
import type { CourtPhase, SessionStatus } from './types.js';

export const metricsRegistry = new Registry();

collectDefaultMetrics({
    register: metricsRegistry,
    prefix: 'juryrigged_',
});

const appInfo = new Gauge({
    name: 'juryrigged_app_info',
    help: 'Static metadata about the JuryRigged runtime',
    labelNames: ['service', 'version'],
    registers: [metricsRegistry],
});

const sessionLifecycleTotal = new Counter({
    name: 'juryrigged_session_lifecycle_total',
    help: 'Total number of JuryRigged session lifecycle events',
    labelNames: ['event'],
    registers: [metricsRegistry],
});

const sessionsByStatus = new Gauge({
    name: 'juryrigged_sessions_status',
    help: 'Current number of sessions grouped by status',
    labelNames: ['status'],
    registers: [metricsRegistry],
});

const phaseTransitionsTotal = new Counter({
    name: 'juryrigged_phase_transitions_total',
    help: 'Total number of successful phase transitions',
    labelNames: ['phase'],
    registers: [metricsRegistry],
});

const phaseTransitionRejectionsTotal = new Counter({
    name: 'juryrigged_phase_transition_rejections_total',
    help: 'Total number of rejected phase transitions',
    labelNames: ['reason'],
    registers: [metricsRegistry],
});

const sessionStoreErrorsTotal = new Counter({
    name: 'juryrigged_session_store_errors_total',
    help: 'Total number of store-level operation errors',
    labelNames: ['operation', 'error_type'],
    registers: [metricsRegistry],
});

const votesCastTotal = new Counter({
    name: 'juryrigged_votes_cast_total',
    help: 'Total number of accepted jury votes',
    labelNames: ['vote_type'],
    registers: [metricsRegistry],
});

const votesRejectedTotal = new Counter({
    name: 'juryrigged_votes_rejected_total',
    help: 'Total number of rejected jury vote attempts',
    labelNames: ['vote_type', 'reason'],
    registers: [metricsRegistry],
});

const voteCastDurationSeconds = new Histogram({
    name: 'juryrigged_vote_cast_duration_seconds',
    help: 'Latency of accepted vote submissions',
    labelNames: ['vote_type'],
    buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [metricsRegistry],
});

const sseConnectionsTotal = new Counter({
    name: 'juryrigged_sse_connections_total',
    help: 'Total number of SSE stream connections opened',
    registers: [metricsRegistry],
});

const sseConnectionsActive = new Gauge({
    name: 'juryrigged_sse_connections_active',
    help: 'Current number of active SSE stream connections',
    registers: [metricsRegistry],
});

const sseDisconnectsTotal = new Counter({
    name: 'juryrigged_sse_disconnects_total',
    help: 'Total number of SSE disconnections by reason',
    labelNames: ['reason'],
    registers: [metricsRegistry],
});

const sseEventsSentTotal = new Counter({
    name: 'juryrigged_sse_events_sent_total',
    help: 'Total number of SSE events sent to clients',
    labelNames: ['event_type'],
    registers: [metricsRegistry],
});

const sseConnectionDurationSeconds = new Histogram({
    name: 'juryrigged_sse_connection_duration_seconds',
    help: 'Duration of SSE client connections in seconds',
    buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 120, 300, 600, 1800],
    registers: [metricsRegistry],
});

const SESSION_STATUSES: SessionStatus[] = [
    'pending',
    'running',
    'completed',
    'failed',
];

function sanitizeLabel(value: string, fallback = 'unknown'): string {
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    return trimmed.toLowerCase().replace(/[^a-z0-9_:-]/g, '_').slice(0, 64);
}

function classifyErrorType(error: unknown): string {
    if (error instanceof CourtValidationError) return 'validation';
    if (error instanceof CourtNotFoundError) return 'not_found';
    if (error instanceof Error) return sanitizeLabel(error.name, 'error');
    return 'unknown';
}

function logMetricsError(context: string, error: unknown): void {
    // eslint-disable-next-line no-console
    console.error(
        `[metrics] ${context}:`,
        error instanceof Error ? error.message : error,
    );
}

export function elapsedSecondsSince(startedAt: bigint): number {
    return Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
}

export function recordVoteCast(
    voteType: 'verdict' | 'sentence',
    durationSeconds: number,
): void {
    votesCastTotal.inc({ vote_type: voteType });
    voteCastDurationSeconds.observe({ vote_type: voteType }, durationSeconds);
}

export function recordVoteRejected(voteType: string, reason: string): void {
    votesRejectedTotal.inc({
        vote_type: sanitizeLabel(voteType, 'unknown'),
        reason: sanitizeLabel(reason, 'unknown'),
    });
}

export function recordSseConnectionOpened(): bigint {
    sseConnectionsTotal.inc();
    sseConnectionsActive.inc();
    return process.hrtime.bigint();
}

export function recordSseEventSent(eventType: string): void {
    sseEventsSentTotal.inc({ event_type: sanitizeLabel(eventType) });
}

export function recordSseConnectionClosed(
    openedAt: bigint,
    reason: string,
): void {
    sseConnectionsActive.dec();
    sseDisconnectsTotal.inc({ reason: sanitizeLabel(reason) });
    sseConnectionDurationSeconds.observe(elapsedSecondsSince(openedAt));
}

async function syncSessionStatusGauges(store: CourtSessionStore): Promise<void> {
    const sessions = await store.listSessions();
    const counts = new Map<SessionStatus, number>(
        SESSION_STATUSES.map(status => [status, 0]),
    );

    for (const session of sessions) {
        const current = counts.get(session.status) ?? 0;
        counts.set(session.status, current + 1);
    }

    for (const status of SESSION_STATUSES) {
        sessionsByStatus.set({ status }, counts.get(status) ?? 0);
    }
}

export function instrumentCourtSessionStore(
    baseStore: CourtSessionStore,
): CourtSessionStore {
    let syncInFlight: Promise<void> | undefined;

    const scheduleSessionStatusSync = (): void => {
        if (syncInFlight) return;

        syncInFlight = syncSessionStatusGauges(baseStore)
            .catch(error => {
                logMetricsError('syncSessionStatusGauges failed', error);
            })
            .finally(() => {
                syncInFlight = undefined;
            });
    };

    const recordStoreError = (operation: string, error: unknown): void => {
        sessionStoreErrorsTotal.inc({
            operation,
            error_type: classifyErrorType(error),
        });
    };

    scheduleSessionStatusSync();

    return {
        async createSession(input) {
            try {
                const session = await baseStore.createSession(input);
                sessionLifecycleTotal.inc({ event: 'created' });
                scheduleSessionStatusSync();
                return session;
            } catch (error) {
                recordStoreError('create_session', error);
                throw error;
            }
        },

        async listSessions() {
            try {
                return await baseStore.listSessions();
            } catch (error) {
                recordStoreError('list_sessions', error);
                throw error;
            }
        },

        async getSession(sessionId) {
            try {
                return await baseStore.getSession(sessionId);
            } catch (error) {
                recordStoreError('get_session', error);
                throw error;
            }
        },

        async startSession(sessionId) {
            try {
                const session = await baseStore.startSession(sessionId);
                sessionLifecycleTotal.inc({ event: 'started' });
                scheduleSessionStatusSync();
                return session;
            } catch (error) {
                recordStoreError('start_session', error);
                throw error;
            }
        },

        async setPhase(sessionId, phase, phaseDurationMs) {
            try {
                const session = await baseStore.setPhase(
                    sessionId,
                    phase,
                    phaseDurationMs,
                );
                phaseTransitionsTotal.inc({ phase });
                return session;
            } catch (error) {
                phaseTransitionRejectionsTotal.inc({
                    reason: classifyErrorType(error),
                });
                recordStoreError('set_phase', error);
                throw error;
            }
        },

        async addTurn(input) {
            try {
                return await baseStore.addTurn(input);
            } catch (error) {
                recordStoreError('add_turn', error);
                throw error;
            }
        },

        async castVote(input) {
            try {
                return await baseStore.castVote(input);
            } catch (error) {
                recordStoreError('cast_vote', error);
                throw error;
            }
        },

        async recordFinalRuling(input) {
            try {
                return await baseStore.recordFinalRuling(input);
            } catch (error) {
                recordStoreError('record_final_ruling', error);
                throw error;
            }
        },

        async recordRecap(input) {
            try {
                await baseStore.recordRecap(input);
            } catch (error) {
                recordStoreError('record_recap', error);
                throw error;
            }
        },

        async completeSession(sessionId) {
            try {
                const session = await baseStore.completeSession(sessionId);
                sessionLifecycleTotal.inc({ event: 'completed' });
                scheduleSessionStatusSync();
                return session;
            } catch (error) {
                recordStoreError('complete_session', error);
                throw error;
            }
        },

        async failSession(sessionId, reason) {
            try {
                const session = await baseStore.failSession(sessionId, reason);
                sessionLifecycleTotal.inc({ event: 'failed' });
                scheduleSessionStatusSync();
                return session;
            } catch (error) {
                recordStoreError('fail_session', error);
                throw error;
            }
        },

        async recoverInterruptedSessions() {
            try {
                const ids = await baseStore.recoverInterruptedSessions();
                scheduleSessionStatusSync();
                return ids;
            } catch (error) {
                recordStoreError('recover_interrupted_sessions', error);
                throw error;
            }
        },

        subscribe(sessionId, handler) {
            return baseStore.subscribe(sessionId, handler);
        },

        emitEvent(sessionId, type, payload) {
            baseStore.emitEvent(sessionId, type, payload);
        },
    };
}

appInfo.set(
    {
        service: 'juryrigged',
        version: process.env.npm_package_version ?? 'unknown',
    },
    1,
);

export async function renderMetrics(): Promise<string> {
    return metricsRegistry.metrics();
}

export const metricsContentType = metricsRegistry.contentType;