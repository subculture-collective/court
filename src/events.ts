/**
 * Typed payload interfaces for every CourtEvent type.
 *
 * Each interface represents the *required* fields for that event's payload.
 * Use `assertEventPayload` to validate a raw `CourtEvent` at runtime.
 */

import type { CourtEvent, CourtPhase } from './types.js';

// ---------------------------------------------------------------------------
// Payload interfaces
// ---------------------------------------------------------------------------

export interface SessionCreatedPayload {
    sessionId: string;
}

export interface SessionStartedPayload {
    sessionId: string;
    startedAt: string; // ISO 8601
}

export interface PhaseChangedPayload {
    phase: CourtPhase;
    phaseStartedAt: string; // ISO 8601
    phaseDurationMs?: number;
}

export interface TurnPayload {
    turn: {
        id: string;
        sessionId: string;
        turnNumber: number;
        speaker: string;
        role: string;
        phase: CourtPhase;
        dialogue: string;
        createdAt: string;
    };
}

export interface VoteUpdatedPayload {
    voteType: 'verdict' | 'sentence';
    choice: string;
    verdictVotes: Record<string, number>;
    sentenceVotes: Record<string, number>;
}

export interface VoteClosedPayload {
    pollType: 'verdict' | 'sentence';
    closedAt: string; // ISO 8601
    votes: Record<string, number>;
    nextPhase: CourtPhase;
}

export interface WitnessResponseCappedPayload {
    turnId: string;
    speaker: string;
    phase: CourtPhase;
    originalLength: number;
    truncatedLength: number;
    reason: 'tokens' | 'seconds';
}

export interface JudgeRecapEmittedPayload {
    turnId: string;
    phase: CourtPhase;
    cycleNumber: number;
}

export type AnalyticsEventName =
    | 'poll_started'
    | 'vote_completed'
    | 'poll_closed';

export interface AnalyticsEventPayload {
    name: AnalyticsEventName;
    pollType: 'verdict' | 'sentence';
    phase?: CourtPhase;
    choice?: string;
}

export interface ModerationActionPayload {
    turnId: string;
    speaker: string;
    reasons: string[];
    phase: CourtPhase;
}

export interface VoteSpamBlockedPayload {
    ip: string;
    voteType: 'verdict' | 'sentence';
}

export interface SessionCompletedPayload {
    sessionId: string;
    completedAt: string; // ISO 8601
}

export interface SessionFailedPayload {
    sessionId: string;
    reason: string;
    completedAt: string; // ISO 8601
}

// ---------------------------------------------------------------------------
// Shape guard
// ---------------------------------------------------------------------------

function hasStringKeys(
    payload: Record<string, unknown>,
    keys: string[],
): boolean {
    return keys.every(k => typeof payload[k] === 'string');
}

function hasObjectKey(payload: Record<string, unknown>, key: string): boolean {
    return (
        payload[key] !== null &&
        typeof payload[key] === 'object' &&
        !Array.isArray(payload[key])
    );
}

/**
 * Asserts that `event.payload` contains the required fields for the given
 * event type.  Throws a `TypeError` with a descriptive message on failure.
 */
export function assertEventPayload(event: CourtEvent): void {
    const { type, payload } = event;

    switch (type) {
        case 'session_created':
            if (typeof payload['sessionId'] !== 'string') {
                throw new TypeError(
                    `session_created payload missing required string field: sessionId`,
                );
            }
            break;

        case 'session_started':
            if (!hasStringKeys(payload, ['sessionId', 'startedAt'])) {
                throw new TypeError(
                    `session_started payload missing required string fields: sessionId, startedAt`,
                );
            }
            break;

        case 'phase_changed':
            if (!hasStringKeys(payload, ['phase', 'phaseStartedAt'])) {
                throw new TypeError(
                    `phase_changed payload missing required string fields: phase, phaseStartedAt`,
                );
            }
            break;

        case 'turn':
            if (!hasObjectKey(payload, 'turn')) {
                throw new TypeError(
                    `turn payload missing required object field: turn`,
                );
            }
            break;

        case 'vote_updated':
            if (
                !hasStringKeys(payload, ['voteType', 'choice']) ||
                !hasObjectKey(payload, 'verdictVotes') ||
                !hasObjectKey(payload, 'sentenceVotes')
            ) {
                throw new TypeError(
                    `vote_updated payload missing required fields: voteType, choice, verdictVotes, sentenceVotes`,
                );
            }
            break;

        case 'vote_closed':
            if (
                !hasStringKeys(payload, [
                    'pollType',
                    'closedAt',
                    'nextPhase',
                ]) ||
                !hasObjectKey(payload, 'votes')
            ) {
                throw new TypeError(
                    `vote_closed payload missing required fields: pollType, closedAt, votes, nextPhase`,
                );
            }
            break;

        case 'witness_response_capped':
            if (
                !hasStringKeys(payload, [
                    'turnId',
                    'speaker',
                    'phase',
                    'reason',
                ]) ||
                typeof payload['originalLength'] !== 'number' ||
                typeof payload['truncatedLength'] !== 'number'
            ) {
                throw new TypeError(
                    `witness_response_capped payload missing required fields: turnId, speaker, phase, originalLength, truncatedLength, reason`,
                );
            }
            break;

        case 'judge_recap_emitted':
            if (
                !hasStringKeys(payload, ['turnId', 'phase']) ||
                typeof payload['cycleNumber'] !== 'number'
            ) {
                throw new TypeError(
                    `judge_recap_emitted payload missing required fields: turnId, phase, cycleNumber`,
                );
            }
            break;

        case 'analytics_event':
            if (!hasStringKeys(payload, ['name', 'pollType'])) {
                throw new TypeError(
                    `analytics_event payload missing required string fields: name, pollType`,
                );
            }
            break;

        case 'moderation_action':
            if (
                !hasStringKeys(payload, ['turnId', 'speaker', 'phase']) ||
                !Array.isArray(payload['reasons'])
            ) {
                throw new TypeError(
                    `moderation_action payload missing required fields: turnId, speaker, reasons, phase`,
                );
            }
            break;

        case 'vote_spam_blocked':
            if (!hasStringKeys(payload, ['ip', 'voteType'])) {
                throw new TypeError(
                    `vote_spam_blocked payload missing required string fields: ip, voteType`,
                );
            }
            break;

        case 'session_completed':
            if (!hasStringKeys(payload, ['sessionId', 'completedAt'])) {
                throw new TypeError(
                    `session_completed payload missing required string fields: sessionId, completedAt`,
                );
            }
            break;

        case 'session_failed':
            if (
                !hasStringKeys(payload, ['sessionId', 'reason', 'completedAt'])
            ) {
                throw new TypeError(
                    `session_failed payload missing required string fields: sessionId, reason, completedAt`,
                );
            }
            break;

        default: {
            const _exhaustive: never = type;
            throw new TypeError(`Unknown event type: ${String(_exhaustive)}`);
        }
    }
}
