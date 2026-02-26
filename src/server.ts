import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AGENT_IDS, isValidAgent } from './agents.js';
import { assignCourtRoles } from './court/roles.js';
import { runCourtSession } from './court/orchestrator.js';
import { CourtSessionStore } from './store/session-store.js';
import type { AgentId, CaseType, CourtPhase } from './types.js';

const app = express();
const store = new CourtSessionStore();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '../public');

const verdictWindowMs = Number.parseInt(
    process.env.VERDICT_VOTE_WINDOW_MS ?? '20000',
    10,
);
const sentenceWindowMs = Number.parseInt(
    process.env.SENTENCE_VOTE_WINDOW_MS ?? '20000',
    10,
);

app.use(express.json());
app.use(express.static(publicDir));

app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'improv-court-poc' });
});

app.get('/api/court/sessions', (_req, res) => {
    res.json({ sessions: store.listSessions() });
});

app.get('/api/court/sessions/:id', (req, res) => {
    const session = store.getSession(req.params.id);
    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }
    return res.json({ session });
});

app.post('/api/court/sessions', async (req, res) => {
    try {
        const topic =
            typeof req.body?.topic === 'string' ? req.body.topic.trim() : '';

        if (topic.length < 10) {
            return res
                .status(400)
                .json({ error: 'topic must be at least 10 characters' });
        }

        const caseType: CaseType =
            req.body?.caseType === 'civil' ? 'civil' : 'criminal';

        const participantsInput =
            Array.isArray(req.body?.participants) ?
                req.body.participants
            :   AGENT_IDS;

        const participants = participantsInput.filter((id: string): id is AgentId =>
            isValidAgent(id),
        );

        if (participants.length < 4) {
            return res.status(400).json({
                error: 'participants must include at least 4 valid agent IDs',
            });
        }

        const sentenceOptions =
            Array.isArray(req.body?.sentenceOptions) &&
            req.body.sentenceOptions.length > 0 ?
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

        const session = store.createSession({
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
            },
        });

        void runCourtSession(session.id, store);

        return res.status(201).json({ session });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : 'Failed to create session';
        return res.status(500).json({ error: message });
    }
});

app.post('/api/court/sessions/:id/vote', (req, res) => {
    const voteType = req.body?.type;
    const choice =
        typeof req.body?.choice === 'string' ? req.body.choice.trim() : '';

    if (voteType !== 'verdict' && voteType !== 'sentence') {
        return res
            .status(400)
            .json({ error: "type must be 'verdict' or 'sentence'" });
    }

    if (!choice) {
        return res.status(400).json({ error: 'choice is required' });
    }

    try {
        const session = store.castVote({
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
        return res.status(404).json({ error: message });
    }
});

app.post('/api/court/sessions/:id/phase', (req, res) => {
    const phase = req.body?.phase as CourtPhase;
    const durationMs =
        typeof req.body?.durationMs === 'number' ? req.body.durationMs : undefined;

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

    if (!validPhases.includes(phase)) {
        return res.status(400).json({ error: 'invalid phase' });
    }

    try {
        const session = store.setPhase(req.params.id, phase, durationMs);
        return res.json({ session });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : 'Failed to set phase';
        return res.status(404).json({ error: message });
    }
});

app.get('/api/court/sessions/:id/stream', (req: Request, res: Response) => {
    const session = store.getSession(req.params.id);
    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
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
        },
    });

    const unsubscribe = store.subscribe(req.params.id, event => {
        send(event);
    });

    req.on('close', () => {
        unsubscribe();
    });

    return undefined;
});

app.get('*', (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
});

const port = Number.parseInt(process.env.PORT ?? '3001', 10);
app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Improv Court POC running on http://localhost:${port}`);
});
