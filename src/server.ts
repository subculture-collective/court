import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AGENT_IDS, isValidAgent } from './agents.js';
import { assignCourtRoles } from './court/roles.js';
import { runCourtSession } from './court/orchestrator.js';
import {
    selectNextPrompt,
    DEFAULT_ROTATION_CONFIG,
} from './court/prompt-bank.js';
import {
    CourtNotFoundError,
    CourtValidationError,
    type CourtSessionStore,
    createCourtSessionStore,
} from './store/session-store.js';
import { VoteSpamGuard } from './moderation/vote-spam.js';
import type { AgentId, CaseType, CourtPhase, GenreTag } from './types.js';

const validPhases: CourtPhase[] = [
    'case_prompt',
    'openings',
    'witness_exam',
    'evidence_reveal',
    'closings',
    'verdict_vote',
    'sentence_vote',
    'final_ruling',
];

function sendError(
    res: Response,
    status: number,
    code: string,
    error: string,
): Response {
    return res.status(status).json({ code, error });
}

export interface CreateServerAppOptions {
    autoRunCourtSession?: boolean;
    store?: CourtSessionStore;
}

export async function createServerApp(
    options: CreateServerAppOptions = {},
): Promise<{
    app: ReturnType<typeof express>;
    store: CourtSessionStore;
    dispose: () => void;
}> {
    const app = express();
    const store = options.store ?? (await createCourtSessionStore());
    const autoRunCourtSession = options.autoRunCourtSession ?? true;

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const publicDir = path.resolve(__dirname, '../public');
    const dashboardDir = path.resolve(__dirname, '../dist/dashboard');

    const verdictWindowMs = Number.parseInt(
        process.env.VERDICT_VOTE_WINDOW_MS ?? '20000',
        10,
    );
    const sentenceWindowMs = Number.parseInt(
        process.env.SENTENCE_VOTE_WINDOW_MS ?? '20000',
        10,
    );

    const voteSpamGuard = new VoteSpamGuard();
    const PRUNE_INTERVAL_MS = 60_000;
    const pruneTimer = setInterval(
        () => voteSpamGuard.prune(),
        PRUNE_INTERVAL_MS,
    );
    pruneTimer.unref();

    app.use(express.json());

    // Serve operator dashboard
    app.use('/operator', express.static(dashboardDir));

    // Serve main public app
    app.use(express.static(publicDir));

    app.get('/api/health', (_req, res) => {
        res.json({ ok: true, service: 'improv-court-poc' });
    });

    app.get('/api/court/sessions', async (_req, res) => {
        const sessions = await store.listSessions();
        res.json({ sessions });
    });

    app.get('/api/court/sessions/:id', async (req, res) => {
        const session = await store.getSession(req.params.id);
        if (!session) {
            return sendError(
                res,
                404,
                'SESSION_NOT_FOUND',
                'Session not found',
            );
        }
        return res.json({ session });
    });

    app.post('/api/court/sessions', async (req, res) => {
        try {
            // Phase 3: Build genre history from recent sessions
            const recentSessions = await store.listSessions();
            const genreHistory: GenreTag[] = recentSessions
                .filter(s => s.metadata.currentGenre)
                .sort(
                    (a, b) =>
                        new Date(a.createdAt).getTime() -
                        new Date(b.createdAt).getTime(),
                )
                .slice(-DEFAULT_ROTATION_CONFIG.maxHistorySize)
                .map(s => s.metadata.currentGenre!)
                .filter(Boolean);

            // Phase 3: Select next prompt from bank using genre rotation
            const selectedPrompt = selectNextPrompt(genreHistory);

            const topic =
                typeof req.body?.topic === 'string' ?
                    req.body.topic.trim()
                :   selectedPrompt.casePrompt; // Use selected prompt if no topic provided

            if (topic.length < 10) {
                return sendError(
                    res,
                    400,
                    'INVALID_TOPIC',
                    'topic must be at least 10 characters',
                );
            }

            const caseType: CaseType =
                req.body?.caseType === 'civil' ? 'civil'
                : req.body?.caseType === 'criminal' ? 'criminal'
                : selectedPrompt.caseType; // Use selected prompt's case type if not specified

            const participantsInput =
                Array.isArray(req.body?.participants) ?
                    req.body.participants
                :   AGENT_IDS;

            const participants = participantsInput.filter(
                (id: string): id is AgentId => isValidAgent(id),
            );

            if (participants.length < 4) {
                return sendError(
                    res,
                    400,
                    'INVALID_PARTICIPANTS',
                    'participants must include at least 4 valid agent IDs',
                );
            }

            const sentenceOptions =
                (
                    Array.isArray(req.body?.sentenceOptions) &&
                    req.body.sentenceOptions.length > 0
                ) ?
                    req.body.sentenceOptions
                        .map((option: unknown) => String(option).trim())
                        .filter(Boolean)
                :   [
                        'Community service in the meme archives',
                        'Banished to the shadow realm',
                        'Mandatory apology haikus',
                        'Ethics training hosted by a raccoon',
                        'Ukulele ankle-monitor probation',
                    ];

            const roleAssignments = assignCourtRoles(participants);

            // Phase 3: Update genre history
            const updatedGenreHistory = [
                ...genreHistory,
                selectedPrompt.genre,
            ].slice(-DEFAULT_ROTATION_CONFIG.maxHistorySize);

            const session = await store.createSession({
                topic,
                participants,
                metadata: {
                    mode: 'improv_court',
                    casePrompt: topic,
                    caseType,
                    sentenceOptions,
                    verdictVoteWindowMs: verdictWindowMs,
                    sentenceVoteWindowMs: sentenceWindowMs,
                    verdictVotes: {},
                    sentenceVotes: {},
                    roleAssignments,
                    // Phase 3: Add genre tracking
                    currentGenre: selectedPrompt.genre,
                    genreHistory: updatedGenreHistory,
                    evidenceCards: [],
                    objectionCount: 0,
                },
            });

            if (autoRunCourtSession) {
                void runCourtSession(session.id, store);
            }

            return res.status(201).json({ session });
        } catch (error) {
            const message =
                error instanceof Error ?
                    error.message
                :   'Failed to create session';
            return sendError(res, 500, 'SESSION_CREATE_FAILED', message);
        }
    });

    app.post('/api/court/sessions/:id/vote', async (req, res) => {
        const voteType = req.body?.type;
        const choice =
            typeof req.body?.choice === 'string' ? req.body.choice.trim() : '';

        if (voteType !== 'verdict' && voteType !== 'sentence') {
            return sendError(
                res,
                400,
                'INVALID_VOTE_TYPE',
                "type must be 'verdict' or 'sentence'",
            );
        }

        if (!choice) {
            return sendError(
                res,
                400,
                'MISSING_VOTE_CHOICE',
                'choice is required',
            );
        }

        const clientIp = req.ip ?? req.socket.remoteAddress ?? 'unknown';
        if (!voteSpamGuard.check(req.params.id, clientIp)) {
            // eslint-disable-next-line no-console
            console.warn(
                `[vote-spam] blocked ip=${clientIp} session=${req.params.id}`,
            );
            store.emitEvent(req.params.id, 'vote_spam_blocked', {
                ip: clientIp,
                voteType,
            });
            return res.status(429).json({
                code: 'VOTE_RATE_LIMITED',
                error: 'Too many votes. Please slow down.',
            });
        }

        try {
            const session = await store.castVote({
                sessionId: req.params.id,
                voteType,
                choice,
            });

            return res.json({
                sessionId: session.id,
                verdictVotes: session.metadata.verdictVotes,
                sentenceVotes: session.metadata.sentenceVotes,
            });
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Failed to cast vote';
            const status =
                error instanceof CourtValidationError ? 400
                : error instanceof CourtNotFoundError ? 404
                : 500;
            const code =
                error instanceof CourtValidationError ? 'VOTE_REJECTED'
                : error instanceof CourtNotFoundError ? 'SESSION_NOT_FOUND'
                : 'VOTE_FAILED';
            return sendError(res, status, code, message);
        }
    });

    app.post('/api/court/sessions/:id/phase', async (req, res) => {
        const phase = req.body?.phase as CourtPhase;
        const durationMs =
            typeof req.body?.durationMs === 'number' ?
                req.body.durationMs
            :   undefined;

        if (!validPhases.includes(phase)) {
            return sendError(res, 400, 'INVALID_PHASE', 'invalid phase');
        }

        try {
            const session = await store.setPhase(
                req.params.id,
                phase,
                durationMs,
            );
            return res.json({ session });
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Failed to set phase';
            const status =
                error instanceof CourtValidationError ? 400
                : error instanceof CourtNotFoundError ? 404
                : 500;
            const code =
                error instanceof CourtValidationError ?
                    'INVALID_PHASE_TRANSITION'
                : error instanceof CourtNotFoundError ? 'SESSION_NOT_FOUND'
                : 'PHASE_SET_FAILED';
            return sendError(res, status, code, message);
        }
    });

    app.get(
        '/api/court/sessions/:id/stream',
        async (req: Request, res: Response) => {
            const session = await store.getSession(req.params.id);
            if (!session) {
                return sendError(
                    res,
                    404,
                    'SESSION_NOT_FOUND',
                    'Session not found',
                );
            }

            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            const send = (event: unknown) => {
                res.write(`data: ${JSON.stringify(event)}\n\n`);
            };

            send({
                type: 'snapshot',
                payload: {
                    session,
                    turns: session.turns,
                    verdictVotes: session.metadata.verdictVotes,
                    sentenceVotes: session.metadata.sentenceVotes,
                    recapTurnIds: session.metadata.recapTurnIds ?? [],
                },
            });

            const unsubscribe = store.subscribe(req.params.id, event => {
                send(event);
            });

            req.on('close', () => {
                unsubscribe();
            });

            return undefined;
        },
    );

    // Catch-all for operator dashboard (SPA routing)
    app.get('/operator/*', (_req, res) => {
        const indexPath = path.join(dashboardDir, 'index.html');
        res.sendFile(indexPath, err => {
            if (err) {
                if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
                    res.status(404).send(
                        'Operator dashboard not found. Run `npm run build:dashboard` first.',
                    );
                } else {
                    res.status(500).send('Failed to load operator dashboard.');
                }
            }
        });
    });

    // Catch-all for main app (SPA routing)
    app.get('*', (_req, res) => {
        res.sendFile(path.join(publicDir, 'index.html'));
    });

    const restartPendingIds = await store.recoverInterruptedSessions();
    if (autoRunCourtSession) {
        for (const sessionId of restartPendingIds) {
            void runCourtSession(sessionId, store);
        }
    }

    return {
        app,
        store,
        dispose: () => {
            clearInterval(pruneTimer);
        },
    };
}

export async function bootstrap(): Promise<void> {
    const { app } = await createServerApp();

    const port = Number.parseInt(process.env.PORT ?? '3000', 10);
    app.listen(port, () => {
        // eslint-disable-next-line no-console
        console.log(`Improv Court POC running on http://localhost:${port}`);
        // eslint-disable-next-line no-console
        console.log(`Operator Dashboard: http://localhost:${port}/operator`);
    });
}

const isMainModule = (() => {
    const entry = process.argv[1];
    if (!entry) return false;
    return path.resolve(entry) === fileURLToPath(import.meta.url);
})();

if (isMainModule) {
    bootstrap().catch(error => {
        // eslint-disable-next-line no-console
        console.error(error);
        process.exit(1);
    });
}
