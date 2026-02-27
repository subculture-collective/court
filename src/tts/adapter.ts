import type { CourtPhase } from '../types.js';

export interface SpeakCueInput {
    sessionId: string;
    phase: CourtPhase;
    text: string;
}

export interface SpeakVerdictInput {
    sessionId: string;
    verdict: string;
    sentence: string;
}

export interface SpeakRecapInput {
    sessionId: string;
    phase: CourtPhase;
    text: string;
}

export interface TTSAdapter {
    readonly provider: string;
    speakCue(input: SpeakCueInput): Promise<void>;
    speakVerdict(input: SpeakVerdictInput): Promise<void>;
    speakRecap(input: SpeakRecapInput): Promise<void>;
}

export class NoopTTSAdapter implements TTSAdapter {
    readonly provider = 'noop';

    async speakCue(_input: SpeakCueInput): Promise<void> {
        return;
    }

    async speakVerdict(_input: SpeakVerdictInput): Promise<void> {
        return;
    }

    async speakRecap(_input: SpeakRecapInput): Promise<void> {
        return;
    }
}

export interface MockTTSAdapterOptions {
    failOn?: Array<'speakCue' | 'speakVerdict' | 'speakRecap'>;
}

export class MockTTSAdapter implements TTSAdapter {
    readonly provider = 'mock';
    readonly calls: Array<
        | { method: 'speakCue'; input: SpeakCueInput }
        | { method: 'speakVerdict'; input: SpeakVerdictInput }
        | { method: 'speakRecap'; input: SpeakRecapInput }
    > = [];

    private readonly failOn: Set<'speakCue' | 'speakVerdict' | 'speakRecap'>;

    constructor(options: MockTTSAdapterOptions = {}) {
        this.failOn = new Set(options.failOn ?? []);
    }

    async speakCue(input: SpeakCueInput): Promise<void> {
        this.calls.push({ method: 'speakCue', input });
        if (this.failOn.has('speakCue')) {
            throw new Error('mock speakCue failure');
        }
    }

    async speakVerdict(input: SpeakVerdictInput): Promise<void> {
        this.calls.push({ method: 'speakVerdict', input });
        if (this.failOn.has('speakVerdict')) {
            throw new Error('mock speakVerdict failure');
        }
    }

    async speakRecap(input: SpeakRecapInput): Promise<void> {
        this.calls.push({ method: 'speakRecap', input });
        if (this.failOn.has('speakRecap')) {
            throw new Error('mock speakRecap failure');
        }
    }
}

export function createTTSAdapterFromEnv(): TTSAdapter {
    const provider = (process.env.TTS_PROVIDER ?? 'noop').trim().toLowerCase();

    switch (provider) {
        case 'noop':
            return new NoopTTSAdapter();
        case 'mock':
            return new MockTTSAdapter();
        default:
            // eslint-disable-next-line no-console
            console.warn(
                `[tts] Unknown TTS_PROVIDER=${provider}; falling back to noop adapter`,
            );
            return new NoopTTSAdapter();
    }
}
