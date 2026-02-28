import type { SessionSnapshot, TranscriptEntry, VoteCount } from './types';

const DEFAULT_MAX_WITNESS_STATEMENTS = 3;
const DEFAULT_RECAP_INTERVAL = 2;

type UnknownRecord = Record<string, unknown>;

interface SessionSnapshotInput {
    session: unknown;
    turns?: unknown;
    recapTurnIds?: unknown;
}

function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): UnknownRecord {
    return isRecord(value) ? value : {};
}

function asString(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown, fallback = 0): number {
    return typeof value === 'number' && Number.isFinite(value) ?
            value
        :   fallback;
}

function asPositiveNumber(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ?
            value
        :   fallback;
}

function asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.filter((item): item is string => typeof item === 'string');
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
