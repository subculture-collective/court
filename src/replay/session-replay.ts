import { randomUUID } from 'node:crypto';
import { createWriteStream, type WriteStream } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { CourtEvent } from '../types.js';
import type { CourtSessionStore } from '../store/session-store.js';

const DEFAULT_REPLAY_SPEED = 1;
const DEFAULT_RECORDINGS_DIR = 'recordings';

export interface ReplayFrame {
    delayMs: number;
    event: CourtEvent;
}

export interface LoadedReplayRecording {
    filePath: string;
    speed: number;
    events: CourtEvent[];
    frames: ReplayFrame[];
}

interface RecorderState {
    sessionId: string;
    filePath: string;
    stream: WriteStream;
    unsubscribe: () => void;
    closed: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function asCourtEvent(raw: unknown): CourtEvent | undefined {
    if (!isRecord(raw)) return undefined;

    const payload = isRecord(raw.payload) ? raw.payload : {};
    const id = typeof raw.id === 'string' ? raw.id : randomUUID();
    const sessionId =
        typeof raw.sessionId === 'string' ? raw.sessionId.trim() : '';
    const type = typeof raw.type === 'string' ? raw.type.trim() : '';
    const at = typeof raw.at === 'string' ? raw.at : new Date().toISOString();

    if (!sessionId || !type) {
        return undefined;
    }

    return {
        id,
        sessionId,
        type: type as CourtEvent['type'],
        at,
        payload,
    };
}

export function parseReplaySpeed(value: number | string | undefined): number {
    const parsed =
        typeof value === 'number' ? value : Number.parseFloat(value ?? '');
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return DEFAULT_REPLAY_SPEED;
    }
    return parsed;
}

export function resolveRecordingsDir(
    env: NodeJS.ProcessEnv = process.env,
): string {
    const raw = env.RECORDINGS_DIR?.trim();
    return resolve(raw || DEFAULT_RECORDINGS_DIR);
}

export function createSyntheticEvent(input: {
    sessionId: string;
    type: CourtEvent['type'];
    payload: Record<string, unknown>;
    at?: string;
}): CourtEvent {
    return {
        id: randomUUID(),
        sessionId: input.sessionId,
        type: input.type,
        at: input.at ?? new Date().toISOString(),
        payload: structuredClone(input.payload),
    };
}

export async function readEventsFromNdjson(
    filePath: string,
): Promise<CourtEvent[]> {
    const raw = await readFile(filePath, 'utf8');
    const lines = raw
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);

    const events: CourtEvent[] = [];
    for (const line of lines) {
        try {
            const parsed = JSON.parse(line) as unknown;
            const event = asCourtEvent(parsed);
            if (event) {
                events.push(event);
            }
        } catch {
            // Ignore malformed lines to keep replay resilient.
        }
    }

    return events;
}

export function buildReplayFrames(
    events: CourtEvent[],
    speedInput: number | string | undefined,
): ReplayFrame[] {
    const speed = parseReplaySpeed(speedInput);
    const frames: ReplayFrame[] = [];

    let cumulativeDelayMs = 0;
    let previousAtMs: number | undefined;

    for (const event of events) {
        const currentAtMs = Date.parse(event.at);
        const hasCurrentTimestamp = Number.isFinite(currentAtMs);

        if (previousAtMs !== undefined && hasCurrentTimestamp) {
            const diff = Math.max(0, currentAtMs - previousAtMs);
            cumulativeDelayMs += Math.max(0, Math.round(diff / speed));
        }

        if (hasCurrentTimestamp) {
            previousAtMs = currentAtMs;
        }

        frames.push({
            delayMs: cumulativeDelayMs,
            event,
        });
    }

    return frames;
}

export async function loadReplayRecording(input: {
    filePath: string;
    speed?: number | string;
}): Promise<LoadedReplayRecording> {
    const filePath = resolve(input.filePath);
    const events = await readEventsFromNdjson(filePath);
    if (events.length === 0) {
        throw new Error(`Replay file has no readable events: ${filePath}`);
    }

    const speed = parseReplaySpeed(input.speed);
    const frames = buildReplayFrames(events, speed);

    return {
        filePath,
        speed,
        events,
        frames,
    };
}

export function rewriteReplayEventForSession(
    event: CourtEvent,
    sessionId: string,
): CourtEvent {
    const payload = structuredClone(event.payload);

    if (typeof payload['sessionId'] === 'string') {
        payload['sessionId'] = sessionId;
    }

    if (isRecord(payload['turn'])) {
        const turnPayload = payload['turn'];
        if (typeof turnPayload['sessionId'] === 'string') {
            turnPayload['sessionId'] = sessionId;
        }
    }

    return {
        ...event,
        sessionId,
        payload,
    };
}

function writeEventLine(stream: WriteStream, event: CourtEvent): void {
    stream.write(`${JSON.stringify(event)}\n`);
}

async function closeStream(state: RecorderState): Promise<void> {
    if (state.closed) return;
    state.closed = true;
    state.unsubscribe();
    await new Promise<void>(resolve => {
        state.stream.end(() => resolve());
    });
}

export class SessionEventRecorderManager {
    private readonly recorders = new Map<string, RecorderState>();

    constructor(
        private readonly store: CourtSessionStore,
        private readonly recordingsDir = resolveRecordingsDir(),
    ) {}

    async start(input: {
        sessionId: string;
        initialEvents?: CourtEvent[];
    }): Promise<string> {
        const existing = this.recorders.get(input.sessionId);
        if (existing) {
            return existing.filePath;
        }

        const filePath = resolve(
            this.recordingsDir,
            `${input.sessionId}.ndjson`,
        );

        await mkdir(dirname(filePath), { recursive: true });

        const stream = createWriteStream(filePath, {
            flags: 'a',
            encoding: 'utf8',
        });

        await new Promise<void>((resolveReady, rejectReady) => {
            const onOpen = () => {
                stream.off('error', onError);
                resolveReady();
            };
            const onError = (error: Error) => {
                stream.off('open', onOpen);
                rejectReady(error);
            };

            stream.once('open', onOpen);
            stream.once('error', onError);
        });

        const state: RecorderState = {
            sessionId: input.sessionId,
            filePath,
            stream,
            unsubscribe: () => {},
            closed: false,
        };

        const unsubscribe = this.store.subscribe(input.sessionId, event => {
            if (state.closed) {
                return;
            }

            writeEventLine(stream, event);

            if (
                event.type === 'session_completed' ||
                event.type === 'session_failed'
            ) {
                void this.stop(input.sessionId);
            }
        });

        state.unsubscribe = unsubscribe;
        this.recorders.set(input.sessionId, state);

        stream.on('error', error => {
            // eslint-disable-next-line no-console
            console.warn(
                `[replay] recorder stream error session=${input.sessionId} file=${filePath}: ${error instanceof Error ? error.message : String(error)}`,
            );
            void this.stop(input.sessionId);
        });

        for (const event of input.initialEvents ?? []) {
            writeEventLine(stream, event);
        }

        return filePath;
    }

    async stop(sessionId: string): Promise<void> {
        const state = this.recorders.get(sessionId);
        if (!state) return;

        this.recorders.delete(sessionId);
        await closeStream(state);
    }

    async dispose(): Promise<void> {
        const sessionIds = [...this.recorders.keys()];
        for (const sessionId of sessionIds) {
            await this.stop(sessionId);
        }
    }
}
