import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { buildFixtureFileName, recordSseFixture } from './sse-fixture.js';

interface CliOptions {
    sessionId: string;
    outPath: string;
    baseUrl: string;
    maxEvents: number;
    durationMs: number;
}

function parsePositiveInteger(value: string, label: string): number {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`${label} must be a positive integer`);
    }
    return parsed;
}

function defaultBaseUrl(): string {
    const port = process.env.PORT ?? '3000';
    return `http://127.0.0.1:${port}`;
}

function parseArgs(argv: string[]): CliOptions {
    let sessionId = '';
    let outPath = '';
    let baseUrl = defaultBaseUrl();
    let maxEvents = 400;
    let durationMs = 90_000;

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];

        if (!token.startsWith('--')) {
            continue;
        }

        const value = argv[index + 1];
        if (value === undefined || value.startsWith('--')) {
            throw new Error(`Missing value for ${token}`);
        }

        switch (token) {
            case '--session':
                sessionId = value;
                break;
            case '--out':
                outPath = value;
                break;
            case '--base':
                baseUrl = value;
                break;
            case '--max-events':
                maxEvents = parsePositiveInteger(value, '--max-events');
                break;
            case '--duration-ms':
                durationMs = parsePositiveInteger(value, '--duration-ms');
                break;
            default:
                throw new Error(`Unknown argument: ${token}`);
        }

        index += 1;
    }

    if (!sessionId) {
        throw new Error('Missing required argument: --session <session-id>');
    }

    const resolvedOutPath =
        outPath ||
        resolve('public', 'fixtures', buildFixtureFileName(sessionId));

    return {
        sessionId,
        outPath: resolve(resolvedOutPath),
        baseUrl,
        maxEvents,
        durationMs,
    };
}

async function main(): Promise<void> {
    const options = parseArgs(process.argv.slice(2));

    // eslint-disable-next-line no-console
    console.log(
        `[sse-fixture] recording session=${options.sessionId} base=${options.baseUrl} maxEvents=${options.maxEvents} durationMs=${options.durationMs}`,
    );

    const fixture = await recordSseFixture({
        sessionId: options.sessionId,
        baseUrl: options.baseUrl,
        maxEvents: options.maxEvents,
        durationMs: options.durationMs,
    });

    await mkdir(dirname(options.outPath), { recursive: true });
    await writeFile(options.outPath, JSON.stringify(fixture, null, 2), 'utf8');

    // eslint-disable-next-line no-console
    console.log(
        `[sse-fixture] wrote ${fixture.events.length} events to ${options.outPath}`,
    );
}

main().catch(error => {
    // eslint-disable-next-line no-console
    console.error(
        `[sse-fixture] failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
});
