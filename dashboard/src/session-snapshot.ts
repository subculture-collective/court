import type {
    CourtEvent,
    SessionSnapshot,
    TranscriptEntry,
    VoteCount,
} from './types';
import {
    asNumber,
    asPositiveNumber,
    asRecord,
    asString,
    asStringArray,
    isRecord,
} from './utils/payload-guards';
import type { UnknownRecord } from './utils/payload-guards';

const DEFAULT_MAX_WITNESS_STATEMENTS = 3;
const DEFAULT_RECAP_INTERVAL = 2;

interface SessionSnapshotInput {
    session: unknown;
    turns?: unknown;
    recapTurnIds?: unknown;
}

function buildTranscript(
    turnsInput: unknown,
    recapTurnIds: Set<string>,
): TranscriptEntry[] {
    if (!Array.isArray(turnsInput)) {
        return [];
    }

    const transcript: TranscriptEntry[] = [];

    for (const turn of turnsInput) {
        if (!isRecord(turn)) {
            continue;
        }

        const turnId = asString(turn.id);
        const speaker = asString(turn.speaker) ?? 'Unknown';
        const content = asString(turn.dialogue) ?? asString(turn.content) ?? '';
        const timestamp =
            asString(turn.createdAt) ??
            asString(turn.at) ??
            new Date().toISOString();

        transcript.push({
            turnId: turnId ?? undefined,
            speaker,
            content,
            timestamp,
            isRecap: turnId ? recapTurnIds.has(turnId) : false,
        });
    }

    return transcript;
}

function buildVerdictVotes(metadata: UnknownRecord): VoteCount {
    const verdictVotes = asRecord(metadata.verdictVotes);
    const guilty = asNumber(verdictVotes.guilty);
    const innocent =
        asNumber(verdictVotes.not_guilty) || asNumber(verdictVotes.not_liable);
    const total = Object.values(verdictVotes).reduce(
        (sum, value) => sum + asNumber(value),
        0,
    );

    return {
        guilty,
        innocent,
        total,
    };
}

function buildWitnessCaps(
    metadata: UnknownRecord,
): SessionSnapshot['witnessCaps'] {
    const witnessCaps = asRecord(metadata.witnessCaps);

    return {
        witness1: asNumber(witnessCaps.witness1),
        witness2: asNumber(witnessCaps.witness2),
    };
}

function buildConfig(metadata: UnknownRecord): SessionSnapshot['config'] {
    return {
        maxWitnessStatements: asPositiveNumber(
            metadata.maxWitnessStatements,
            DEFAULT_MAX_WITNESS_STATEMENTS,
        ),
        recapInterval: asPositiveNumber(
            metadata.recapInterval,
            DEFAULT_RECAP_INTERVAL,
        ),
    };
}

export function mapSessionToSnapshot(
    input: SessionSnapshotInput,
): SessionSnapshot | null {
    const session = asRecord(input.session);
    const sessionId = asString(session.id);
    const phase = asString(session.phase);

    if (!sessionId || !phase) {
        return null;
    }

    const metadata = asRecord(session.metadata);
    const recapTurnIds = new Set(
        asStringArray(input.recapTurnIds ?? metadata.recapTurnIds),
    );
    const turns = input.turns ?? session.turns ?? [];

    return {
        sessionId,
        phase,
        transcript: buildTranscript(turns, recapTurnIds),
        votes: {
            verdict: buildVerdictVotes(metadata),
        },
        recapCount: recapTurnIds.size,
        witnessCaps: buildWitnessCaps(metadata),
        config: buildConfig(metadata),
    };
}

function buildVerdictVotesFromPayload(rawVotes: unknown): VoteCount {
    const votes = asRecord(rawVotes);
    const directGuilty = asNumber(votes.guilty);
    const civilGuilty = asNumber(votes.liable);
    const guilty = directGuilty > 0 ? directGuilty : civilGuilty;
    const innocent =
        asNumber(votes.not_guilty) > 0 ?
            asNumber(votes.not_guilty)
        :   asNumber(votes.not_liable);
    const total = Object.values(votes).reduce(
        (sum, value) => sum + asNumber(value),
        0,
    );
    return { guilty, innocent, total };
}

export function applyEventToSnapshot(
    current: SessionSnapshot | null,
    event: CourtEvent,
): SessionSnapshot | null {
    if (!current || current.sessionId !== event.sessionId) {
        return current;
    }

    const payload = asRecord(event.payload);

    switch (event.type) {
        case 'phase_changed': {
            const phase = asString(payload.phase);
            if (!phase) return current;
            return { ...current, phase };
        }

        case 'turn': {
            const turn = asRecord(payload.turn);
            const turnId = asString(turn.id);
            const speaker = asString(turn.speaker) ?? 'Unknown';
            const content =
                asString(turn.dialogue) ?? asString(turn.content) ?? '';

            if (
                turnId &&
                current.transcript.some(entry => entry.turnId === turnId)
            ) {
                return current;
            }

            const timestamp =
                asString(turn.createdAt) ?? asString(turn.at) ?? event.at;

            return {
                ...current,
                transcript: [
                    ...current.transcript,
                    {
                        turnId: turnId ?? undefined,
                        speaker,
                        content,
                        timestamp,
                        isRecap: false,
                    },
                ],
            };
        }

        case 'judge_recap_emitted': {
            const turnId = asString(payload.turnId);
            if (!turnId) return current;

            let didMarkRecap = false;
            const transcript = current.transcript.map(entry => {
                if (entry.turnId !== turnId || entry.isRecap) return entry;
                didMarkRecap = true;
                return { ...entry, isRecap: true };
            });

            if (!didMarkRecap) return current;

            const recapCount = transcript.reduce(
                (sum, entry) => sum + (entry.isRecap ? 1 : 0),
                0,
            );
            return { ...current, transcript, recapCount };
        }

        case 'vote_updated': {
            return {
                ...current,
                votes: {
                    ...current.votes,
                    verdict: buildVerdictVotesFromPayload(payload.verdictVotes),
                },
            };
        }

        default:
            return current;
    }
}
