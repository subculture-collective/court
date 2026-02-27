import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AGENT_IDS, isValidAgent } from './agents.js';
import { assignCourtRoles } from './court/roles.js';
import { runCourtSession } from './court/orchestrator.js';
import {
    selectNextSafePrompt,
    DEFAULT_ROTATION_CONFIG,
} from './court/prompt-bank.js';
import { moderateContent } from './moderation/content-filter.js';
import {
    CourtNotFoundError,
    CourtValidationError,
    type CourtSessionStore,
    createCourtSessionStore,
} from './store/session-store.js';
import { VoteSpamGuard } from './moderation/vote-spam.js';
import type {
    AgentId,
    CaseType,
    CourtPhase,
    GenreTag,
    PromptBankEntry,
} from './types.js';

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
    details?: Record<string, unknown>,
): Response {
    return res.status(status).json({ code, error, ...(details ?? {}) });
}

function mapSessionMutationError(input: {
    error: unknown;
    validationCode: string;
    fallbackCode: string;
    fallbackMessage: string;
}): {
    status: number;
    code: string;
    message: string;
} {
    const message =
        input.error instanceof Error ? input.error.message : input.fallbackMessage;

    if (input.error instanceof CourtValidationError) {
        return {
            status: 400,
            code: input.validationCode,
            message,
        };
    }

    if (input.error instanceof CourtNotFoundError) {
        return {
            status: 404,
            code: 'SESSION_NOT_FOUND',
            message,
        };
    }

    return {
        status: 500,
        code: input.fallbackCode,
        message,
    };
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
    const parsed = Number.parseInt(value ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

interface SessionRouteDeps {
    store: CourtSessionStore;
    autoRunCourtSession: boolean;
    verdictWindowMs: number;
    sentenceWindowMs: number;
}

function createSessionHandler(deps: SessionRouteDeps) {
    return async (req: Request, res: Response): Promise<Response> => {
        try {
            // Phase 3: Build genre history from recent sessions
            const recentSessions = await deps.store.listSessions();
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
            let selectedPrompt: PromptBankEntry;
            try {
                selectedPrompt = selectNextSafePrompt(genreHistory);
            } catch (error) {
                // eslint-disable-next-line no-console
                console.error(
                    '[server] selectNextSafePrompt failed:',
                    error instanceof Error ? error.message : error,
                );
                return sendError(
                    res,
                    503,
                    'SAFE_PROMPT_UNAVAILABLE',
                    'No safe prompts available',
                );
            }

            const userTopic =
                typeof req.body?.topic === 'string' ? req.body.topic.trim() : '';

            if (userTopic && userTopic.length < 10) {
                return sendError(
                    res,
                    400,
                    'INVALID_TOPIC',
                    'topic must be at least 10 characters',
                );
            }

            if (userTopic) {
                const moderation = moderateContent(userTopic);
                if (moderation.flagged) {
                    return sendError(
                        res,
                        400,
                        'TOPIC_REJECTED',
                        'topic violates safety policy',
                        { reasons: moderation.reasons },
                    );
                }
            }

            const topic = userTopic || selectedPrompt.casePrompt;

            const caseType: CaseType =
                req.body?.caseType === 'civil' ? 'civil'
                : req.body?.caseType === 'criminal' ? 'criminal'
                : selectedPrompt.caseType; // Use selected prompt's case type if not specified

            const participantsInput =
                Array.isArray(req.body?.participants) ? req.body.participants : AGENT_IDS;

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
                : [
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

            const session = await deps.store.createSession({
                topic,
                participants,
                metadata: {
                    mode: 'juryrigged',
                    casePrompt: topic,
                    caseType,
                    sentenceOptions,
                    verdictVoteWindowMs: deps.verdictWindowMs,
                    sentenceVoteWindowMs: deps.sentenceWindowMs,
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

            if (deps.autoRunCourtSession) {
                void runCourtSession(session.id, deps.store);
            }

            return res.status(201).json({ session });
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Failed to create session';
            return sendError(res, 500, 'SESSION_CREATE_FAILED', message);
        }
    };
}

function createVoteHandler(store: CourtSessionStore, voteSpamGuard: VoteSpamGuard) {
    return async (req: Request, res: Response): Promise<Response> => {
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
            return sendError(res, 400, 'MISSING_VOTE_CHOICE', 'choice is required');
        }

        const clientIp = req.ip ?? req.socket.remoteAddress ?? 'unknown';
        const spamDecision = voteSpamGuard.check(
            req.params.id,
            clientIp,
            voteType,
            choice,
        );
        if (!spamDecision.allowed) {
            // eslint-disable-next-line no-console
            console.warn(
                `[vote-spam] blocked ip=${clientIp} session=${req.params.id} reason=${spamDecision.reason ?? 'unknown'}`,
            );
            store.emitEvent(req.params.id, 'vote_spam_blocked', {
                ip: clientIp,
                voteType,
                reason: spamDecision.reason ?? 'unknown',
                retryAfterMs: spamDecision.retryAfterMs,
            });
            const code =
                spamDecision.reason === 'duplicate_vote' ?
                    'VOTE_DUPLICATE'
                :   'VOTE_RATE_LIMITED';
            const errorMessage =
                spamDecision.reason === 'duplicate_vote' ?
                    'Duplicate vote detected. Please wait before retrying.'
                :   'Too many votes. Please slow down.';
            return res.status(429).json({
                code,
                error: errorMessage,
                reason: spamDecision.reason,
                retryAfterMs: spamDecision.retryAfterMs,
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
            const mapped = mapSessionMutationError({
                error,
                validationCode: 'VOTE_REJECTED',
                fallbackCode: 'VOTE_FAILED',
                fallbackMessage: 'Failed to cast vote',
            });
            return sendError(res, mapped.status, mapped.code, mapped.message);
        }
    };
}

function createPhaseHandler(store: CourtSessionStore) {
    return async (req: Request, res: Response): Promise<Response> => {
        const phase = req.body?.phase as CourtPhase;
        const durationMs =
            typeof req.body?.durationMs === 'number' ? req.body.durationMs : undefined;

        if (!validPhases.includes(phase)) {
            return sendError(res, 400, 'INVALID_PHASE', 'invalid phase');
        }

        try {
            const session = await store.setPhase(req.params.id, phase, durationMs);
            return res.json({ session });
        } catch (error) {
            const mapped = mapSessionMutationError({
                error,
                validationCode: 'INVALID_PHASE_TRANSITION',
                fallbackCode: 'PHASE_SET_FAILED',
                fallbackMessage: 'Failed to set phase',
            });
            return sendError(res, mapped.status, mapped.code, mapped.message);
        }
    };
}

function createStreamHandler(store: CourtSessionStore) {
    return async (req: Request, res: Response): Promise<Response | undefined> => {
        const session = await store.getSession(req.params.id);
        if (!session) {
            return sendError(res, 404, 'SESSION_NOT_FOUND', 'Session not found');
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
    };
}

type ExpressApp = ReturnType<typeof express>;

function registerStaticAndSpaRoutes(
    app: ExpressApp,
    dirs: { publicDir: string; dashboardDir: string },
): void {
    // Serve operator dashboard
    app.use('/operator', express.static(dirs.dashboardDir));

    // Serve main public app
    app.use(express.static(dirs.publicDir));

    // Catch-all for operator dashboard (SPA routing)
    app.get('/operator/*', (_req, res) => {
        const indexPath = path.join(dirs.dashboardDir, 'index.html');
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
        res.sendFile(path.join(dirs.publicDir, 'index.html'));
    });
}

function registerApiRoutes(
    app: ExpressApp,
    deps: {
        store: CourtSessionStore;
        voteSpamGuard: VoteSpamGuard;
        autoRunCourtSession: boolean;
        verdictWindowMs: number;
        sentenceWindowMs: number;
    },
): void {
    app.get('/api/health', (_req, res) => {
        res.json({ ok: true, service: 'juryrigged' });
    });

    app.get('/api/court/sessions', async (_req, res) => {
        const sessions = await deps.store.listSessions();
        res.json({ sessions });
    });

    app.get('/api/court/sessions/:id', async (req, res) => {
        const session = await deps.store.getSession(req.params.id);
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

    app.post(
        '/api/court/sessions',
        createSessionHandler({
            store: deps.store,
            autoRunCourtSession: deps.autoRunCourtSession,
            verdictWindowMs: deps.verdictWindowMs,
            sentenceWindowMs: deps.sentenceWindowMs,
        }),
    );

    app.post(
        '/api/court/sessions/:id/vote',
        createVoteHandler(deps.store, deps.voteSpamGuard),
    );

    app.post('/api/court/sessions/:id/phase', createPhaseHandler(deps.store));

    app.get('/api/court/sessions/:id/stream', createStreamHandler(deps.store));
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

    const voteSpamGuard = new VoteSpamGuard({
        maxVotesPerWindow: parsePositiveInt(
            process.env.VOTE_SPAM_MAX_VOTES_PER_WINDOW,
            10,
        ),
        windowMs: parsePositiveInt(process.env.VOTE_SPAM_WINDOW_MS, 60_000),
        duplicateWindowMs: parsePositiveInt(
            process.env.VOTE_SPAM_DUPLICATE_WINDOW_MS,
            5_000,
        ),
    });
    const PRUNE_INTERVAL_MS = 60_000;
    const pruneTimer = setInterval(
        () => voteSpamGuard.prune(),
        PRUNE_INTERVAL_MS,
    );
    pruneTimer.unref();

    app.use(express.json());

    registerApiRoutes(app, {
        store,
        voteSpamGuard,
        autoRunCourtSession,
        verdictWindowMs,
        sentenceWindowMs,
    });

    registerStaticAndSpaRoutes(app, {
        publicDir,
        dashboardDir,
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
        console.log(`JuryRigged running on http://localhost:${port}`);
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
