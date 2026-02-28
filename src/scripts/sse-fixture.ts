import { setTimeout as delay } from 'node:timers/promises';

export interface RecordedSseEvent {
    offsetMs: number;
    message: Record<string, unknown>;
}

export interface SseReplayFixture {
    version: 1;
    sessionId: string;
    sourceUrl: string;
    recordedAt: string;
    events: RecordedSseEvent[];
}

export interface RecordSseFixtureOptions {
    sessionId: string;
    baseUrl: string;
    maxEvents?: number;
    durationMs?: number;
    fetchImpl?: typeof fetch;
}

export interface SseDataParser {
    push: (chunk: string) => void;
    flush: () => void;
}

function normalizeLineBreaks(input: string): string {
    return input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function createSseDataParser(
    onData: (data: string) => void,
): SseDataParser {
    let buffer = '';
    let dataLines: string[] = [];

    const dispatchIfReady = () => {
        if (dataLines.length === 0) {
            return;
        }

        onData(dataLines.join('\n'));
        dataLines = [];
    };

    const processLine = (line: string) => {
        if (line.length === 0) {
            dispatchIfReady();
            return;
        }

        if (!line.startsWith('data:')) {
            return;
        }

        dataLines.push(line.slice(5).trimStart());
    };

    return {
        push(chunk: string) {
            if (!chunk) {
                return;
            }

            buffer += normalizeLineBreaks(chunk);

            while (true) {
                const lineBreakIndex = buffer.indexOf('\n');
                if (lineBreakIndex === -1) {
                    return;
                }

                const line = buffer.slice(0, lineBreakIndex);
                buffer = buffer.slice(lineBreakIndex + 1);
                processLine(line);
            }
        },

        flush() {
            if (buffer.length > 0) {
                processLine(buffer);
                buffer = '';
            }

            dispatchIfReady();
        },
    };
}

function toSourceUrl(baseUrl: string, sessionId: string): string {
    const trimmed = baseUrl.replace(/\/+$/, '');
    return `${trimmed}/api/court/sessions/${encodeURIComponent(sessionId)}/stream`;
}

function asPositiveInteger(
    value: number | undefined,
    fallback: number,
): number {
    if (!Number.isFinite(value)) {
        return fallback;
    }

    const parsed = Math.floor(value ?? fallback);
    return parsed > 0 ? parsed : fallback;
}

export async function recordSseFixture(
    options: RecordSseFixtureOptions,
): Promise<SseReplayFixture> {
    const fetchImpl = options.fetchImpl ?? fetch;
    const maxEvents = asPositiveInteger(options.maxEvents, 400);
    const durationMs = asPositiveInteger(options.durationMs, 90_000);
    const sourceUrl = toSourceUrl(options.baseUrl, options.sessionId);

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), durationMs);

    const response = await fetchImpl(sourceUrl, {
        headers: { Accept: 'text/event-stream' },
        signal: abortController.signal,
    });

    if (!response.ok) {
        clearTimeout(timeout);
        throw new Error(
            `SSE stream request failed with ${response.status} ${response.statusText}`,
        );
    }

    if (!response.body) {
        clearTimeout(timeout);
        throw new Error('SSE response does not expose a readable body stream');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const startedAt = Date.now();
    const events: RecordedSseEvent[] = [];

    const parser = createSseDataParser(data => {
        if (events.length >= maxEvents) {
            return;
        }

        try {
            const parsed = JSON.parse(data) as Record<string, unknown>;
            events.push({
                offsetMs: Math.max(0, Date.now() - startedAt),
                message: parsed,
            });
        } catch {
            // Ignore malformed data lines while recording; fixture consumers only
            // care about valid JSON event envelopes.
        }
    });

    try {
        while (events.length < maxEvents) {
            const { done, value } = await reader.read();

            if (done) {
                break;
            }

            parser.push(decoder.decode(value, { stream: true }));

            // Yield to event loop for long-running recordings.
            await delay(0);
        }
    } catch (error) {
        if (!(error instanceof Error && error.name === 'AbortError')) {
            throw error;
        }
    } finally {
        abortController.abort();
        clearTimeout(timeout);
        parser.flush();
        reader.releaseLock();
    }

    return {
        version: 1,
        sessionId: options.sessionId,
        sourceUrl,
        recordedAt: new Date().toISOString(),
        events,
    };
}

export function buildFixtureFileName(
    sessionId: string,
    timestamp = Date.now(),
): string {
    const safeSessionId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `sse-${safeSessionId}-${timestamp}.json`;
}
