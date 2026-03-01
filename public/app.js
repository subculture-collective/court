import {
    createStreamState,
    isRecapTurn,
    markRecap,
    resetStreamState,
    shouldAppendTurn,
} from './stream-state.js';
import { createCourtRenderer } from './renderer/index.js';

const topicInput = document.getElementById('topic');
const caseTypeSelect = document.getElementById('caseType');
const startBtn = document.getElementById('startBtn');
const feed = document.getElementById('feed');
const phaseBadge = document.getElementById('phaseBadge');
const sessionMeta = document.getElementById('sessionMeta');
const verdictTallies = document.getElementById('verdictTallies');
const sentenceTallies = document.getElementById('sentenceTallies');
const verdictActions = document.getElementById('verdictActions');
const sentenceActions = document.getElementById('sentenceActions');
const verdictStatus = document.getElementById('verdictStatus');
const verdictCountdown = document.getElementById('verdictCountdown');
const verdictError = document.getElementById('verdictError');
const verdictNote = document.getElementById('verdictNote');
const sentenceStatus = document.getElementById('sentenceStatus');
const sentenceCountdown = document.getElementById('sentenceCountdown');
const sentenceError = document.getElementById('sentenceError');
const sentenceNote = document.getElementById('sentenceNote');
const statusEl = document.getElementById('status');
const phaseTimer = document.getElementById('phaseTimer');
const phaseTimerFill = document.getElementById('phaseTimerFill');
const activeSpeakerEl = document.getElementById('activeSpeaker');
const captionLineEl = document.getElementById('captionLine');
const pixiStageHost = document.getElementById('pixiStage');
const captionSkipBtn = document.getElementById('captionSkipBtn');
const captionSkipAllToggle = document.getElementById('captionSkipAll');
const captionTypewriterToggle = document.getElementById(
    'captionTypewriterToggle',
);
const connectionBanner = document.getElementById('connectionBanner');
const catchupToggleBtn = document.getElementById('catchupToggle');
const catchupBody = document.getElementById('catchupBody');
const catchupSummaryEl = document.getElementById('catchupSummary');
const catchupMetaEl = document.getElementById('catchupMeta');

let activeSession = null;
let source = null;
let timerInterval = null;
let voteCountdownInterval = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
/** @type {Awaited<ReturnType<typeof createCourtRenderer>> | null} */
let courtRenderer = null;

const runtimeSearchParams = new URLSearchParams(window.location.search);
const fixtureReplayUrl = runtimeSearchParams.get('replayFixture');
const isFixtureReplayMode =
    typeof fixtureReplayUrl === 'string' && fixtureReplayUrl.length > 0;

const streamState = createStreamState();
const voteState = {
    verdict: {
        isOpen: false,
        closesAt: null,
        hasVoted: false,
        error: '',
    },
    sentence: {
        isOpen: false,
        closesAt: null,
        hasVoted: false,
        error: '',
    },
};

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 10_000;
const CATCHUP_MAX_CHARS = 220;
const TIMER_TICK_MS = 250;
const TYPEWRITER_CHARS_PER_SECOND = 200 / 60; // 200 CPM — matches server-side display pacing

const fixtureReplayState = {
    active: false,
    timers: [],
};

const dialogueTypewriterState = {
    enabled: true,
    skipAll: false,
    skipRequested: false,
    fullText: 'Captions will appear here.',
    speakerLabel: 'Waiting for first turn…',
    frameId: null,
    lineToken: 0,
};

// pixiOverlayState replaced by courtRenderer — see renderer/index.js

const catchupState = {
    visible: true,
    toggles: 0,
    shown: 1,
    hidden: 0,
};

function setStatus(message, type = 'ok') {
    statusEl.textContent = message;
    statusEl.className = type === 'error' ? 'danger' : 'ok';
}

function setConnectionBanner(message) {
    if (!message) {
        connectionBanner.textContent = '';
        connectionBanner.classList.add('hidden');
        return;
    }

    connectionBanner.textContent = message;
    connectionBanner.classList.remove('hidden');
}

function setStartLoading(loading) {
    startBtn.disabled = loading;
    startBtn.classList.toggle('loading', loading);
    startBtn.textContent = loading ? 'Starting…' : 'Start Session';
}

function pulseActiveSpeaker() {
    activeSpeakerEl.classList.remove('speaker-live');
    void activeSpeakerEl.offsetWidth;
    activeSpeakerEl.classList.add('speaker-live');
}

function setCaptionText(text) {
    captionLineEl.textContent = text;

    if (courtRenderer?.ui?.dialogueText) {
        courtRenderer.ui.dialogueText.text = text;
    }
}

function setActiveSpeakerLabel(label, { pulse = false } = {}) {
    activeSpeakerEl.textContent = label;

    if (pulse) {
        pulseActiveSpeaker();
    }

    if (courtRenderer?.ui?.speakerText) {
        courtRenderer.ui.speakerText.text = label;
    }
}

async function bootstrapCourtRenderer() {
    if (!pixiStageHost) {
        return;
    }

    courtRenderer = await createCourtRenderer(pixiStageHost);

    if (courtRenderer) {
        // Sync initial text state into the renderer overlay
        courtRenderer.update({
            phase: 'idle',
            speakerLabel: activeSpeakerEl.textContent,
            dialogueContent: captionLineEl.textContent,
            nameplate: '',
        });
    }
}

function clearDialogueTypewriter() {
    if (dialogueTypewriterState.frameId !== null) {
        cancelAnimationFrame(dialogueTypewriterState.frameId);
        dialogueTypewriterState.frameId = null;
    }
}

function commitDialogueTypewriterLine() {
    clearDialogueTypewriter();
    dialogueTypewriterState.skipRequested = false;
    setCaptionText(dialogueTypewriterState.fullText);
}

function skipDialogueTypewriter() {
    if (dialogueTypewriterState.frameId === null) {
        return;
    }

    dialogueTypewriterState.skipRequested = true;
}

function startDialogueTypewriter(turn) {
    const dialogue = typeof turn.dialogue === 'string' ? turn.dialogue : '';
    const role = typeof turn.role === 'string' ? turn.role : 'unknown role';
    const speaker =
        typeof turn.speaker === 'string' ? turn.speaker : 'unknown speaker';
    const speakerLabel = `${role} · ${speaker}`;

    dialogueTypewriterState.lineToken += 1;
    const token = dialogueTypewriterState.lineToken;

    dialogueTypewriterState.speakerLabel = speakerLabel;
    dialogueTypewriterState.fullText = dialogue;
    dialogueTypewriterState.skipRequested = false;

    clearDialogueTypewriter();
    setActiveSpeakerLabel(speakerLabel, { pulse: true });

    if (
        dialogueTypewriterState.skipAll ||
        !dialogueTypewriterState.enabled ||
        dialogue.length <= 1
    ) {
        setCaptionText(dialogue);
        return;
    }

    const startedAt = performance.now();
    const tick = timestamp => {
        if (token !== dialogueTypewriterState.lineToken) {
            return;
        }

        if (
            dialogueTypewriterState.skipRequested ||
            dialogueTypewriterState.skipAll
        ) {
            commitDialogueTypewriterLine();
            return;
        }

        const elapsedMs = Math.max(0, timestamp - startedAt);
        const characters = Math.min(
            dialogue.length,
            Math.max(
                1,
                Math.floor((elapsedMs / 1000) * TYPEWRITER_CHARS_PER_SECOND),
            ),
        );

        setCaptionText(dialogue.slice(0, characters));

        if (characters >= dialogue.length) {
            dialogueTypewriterState.frameId = null;
            return;
        }

        dialogueTypewriterState.frameId = requestAnimationFrame(tick);
    };

    setCaptionText('');
    dialogueTypewriterState.frameId = requestAnimationFrame(tick);
}

function renderDialogueControlState() {
    if (captionTypewriterToggle) {
        captionTypewriterToggle.textContent =
            dialogueTypewriterState.enabled ? 'Typewriter: on' : (
                'Typewriter: off'
            );
    }

    if (captionSkipAllToggle) {
        captionSkipAllToggle.checked = dialogueTypewriterState.skipAll;
    }
}

function setTypewriterEnabled(enabled) {
    dialogueTypewriterState.enabled = Boolean(enabled);
    renderDialogueControlState();

    if (!dialogueTypewriterState.enabled) {
        commitDialogueTypewriterLine();
    }
}

function setSkipAllCaptions(enabled) {
    dialogueTypewriterState.skipAll = Boolean(enabled);
    renderDialogueControlState();

    if (dialogueTypewriterState.skipAll) {
        commitDialogueTypewriterLine();
    }
}

function clearFixtureReplayTimers() {
    fixtureReplayState.timers.forEach(timerId => clearTimeout(timerId));
    fixtureReplayState.timers = [];
    fixtureReplayState.active = false;
}

const JURY_STEP_LABELS = Object.freeze({
    case_prompt: 'Jury pending — court intro in progress',
    openings: 'Jury listening — opening statements',
    witness_exam: 'Jury observing witness examination',
    evidence_reveal: 'Jury reviewing evidence reveal',
    closings: 'Jury preparing for verdict vote',
    verdict_vote: 'Jury voting — verdict poll is live',
    sentence_vote: 'Jury voting — sentence poll is live',
    final_ruling: 'Jury complete — ruling delivered',
});

function juryStepLabel(phase) {
    const label = JURY_STEP_LABELS[phase];
    if (label === undefined) {
        throw new Error(`Unknown jury phase: ${String(phase)}`);
    }
    return label;
}

function summarizeCaseSoFar(turns) {
    const orderedTurns = Array.isArray(turns) ? turns : [];
    const latestRecap = [...orderedTurns]
        .reverse()
        .find(turn => isRecapTurn(streamState, turn.id));

    const toCompact = text => text.replace(/\s+/g, ' ').trim();
    const clip = text => {
        const maxChars = CATCHUP_MAX_CHARS;
        const compact = toCompact(text);
        if (compact.length <= maxChars) return compact;
        return `${compact.slice(0, maxChars - 1).trimEnd()}…`;
    };

    if (latestRecap?.dialogue) {
        return clip(latestRecap.dialogue);
    }

    const recent = orderedTurns.slice(-3);
    if (recent.length === 0) {
        return 'The court has just opened. Waiting for opening statements.';
    }

    return clip(
        recent.map(turn => `${turn.speaker}: ${turn.dialogue}`).join(' · '),
    );
}

function updateCatchupPanel(session) {
    const phase = session?.phase;
    const turns = session?.turns ?? [];
    catchupSummaryEl.textContent = summarizeCaseSoFar(turns);
    catchupMetaEl.textContent =
        phase ?
            `phase: ${phase} · ${juryStepLabel(phase)}`
        :   'phase: idle · Jury pending';
}

function recordCatchupToggleTelemetry(visible, reason) {
    catchupState.toggles += 1;
    if (visible) {
        catchupState.shown += 1;
    } else {
        catchupState.hidden += 1;
    }

    // Aggregate-only telemetry: no user/session identifiers.
    // eslint-disable-next-line no-console
    console.info(
        `[telemetry] catchup_panel_visibility reason=${reason} toggles=${catchupState.toggles} shown=${catchupState.shown} hidden=${catchupState.hidden} phase=${activeSession?.phase ?? 'idle'}`,
    );
}

function setCatchupVisible(visible, reason = 'manual') {
    catchupState.visible = Boolean(visible);
    catchupBody.classList.toggle('hidden', !catchupState.visible);
    catchupToggleBtn.textContent = catchupState.visible ? 'Hide' : 'Show';
    catchupToggleBtn.setAttribute(
        'aria-expanded',
        String(catchupState.visible),
    );
    recordCatchupToggleTelemetry(catchupState.visible, reason);
}

function appendTurn(turn, { recap = false } = {}) {
    const item = document.createElement('div');
    item.className = 'turn';
    item.dataset.turnId = turn.id;
    if (recap) {
        item.classList.add('recap');
    }

    const meta = document.createElement('div');
    meta.className = 'meta';

    const turnNumber = document.createElement('span');
    turnNumber.className = 'turn-number';
    turnNumber.textContent = `#${turn.turnNumber + 1}`;

    const roleBadge = document.createElement('span');
    roleBadge.className = 'role-badge';
    roleBadge.textContent = turn.role;

    const speakerName = document.createElement('span');
    speakerName.className = 'speaker';
    speakerName.textContent = turn.speaker;

    const phaseLabel = document.createElement('span');
    phaseLabel.className = 'phase-label';
    phaseLabel.textContent = turn.phase;

    meta.append(turnNumber, roleBadge, speakerName, phaseLabel);

    const body = document.createElement('div');
    body.className = 'body';
    body.textContent = turn.dialogue;

    item.append(meta, body);
    feed.appendChild(item);
    feed.scrollTop = feed.scrollHeight;
    startDialogueTypewriter(turn);
}

function markTurnRecap(turnId) {
    const target = feed.querySelector(`[data-turn-id="${turnId}"]`);
    if (target) {
        target.classList.add('recap');
    }
}

function renderTally(container, map) {
    container.innerHTML = '';
    const entries = Object.entries(map || {});
    const totalVotes = entries.reduce(
        (sum, [, count]) => sum + Number(count),
        0,
    );
    if (entries.length === 0) {
        const row = document.createElement('div');
        row.className = 'vote-row';
        row.textContent = 'No votes yet';
        container.appendChild(row);
        return;
    }

    for (const [choice, count] of entries) {
        const row = document.createElement('div');
        row.className = 'vote-row';
        const ratio = totalVotes > 0 ? Number(count) / totalVotes : 0;
        const percent = Math.round(ratio * 100);
        row.textContent = `${choice}: ${count} (${percent}%)`;
        const bar = document.createElement('div');
        bar.className = 'vote-bar';
        const fill = document.createElement('div');
        fill.className = 'vote-bar-fill';
        fill.style.width = `${percent}%`;
        bar.appendChild(fill);
        row.appendChild(bar);
        container.appendChild(row);
    }
}

async function castVote(type, choice) {
    if (!activeSession) return;
    voteState[type].error = '';
    renderVoteMeta();

    const res = await fetch(`/api/court/sessions/${activeSession.id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, choice }),
    });

    if (!res.ok) {
        const err = await res.json();
        voteState[type].error = err.error || 'Vote failed';
        renderVoteMeta();
        return;
    }

    const data = await res.json();
    renderTally(verdictTallies, data.verdictVotes);
    renderTally(sentenceTallies, data.sentenceVotes);
    voteState[type].hasVoted = true;
    renderActions(activeSession);
    renderVoteMeta();
    setStatus('Vote recorded.');
}

function renderActions(session) {
    verdictActions.innerHTML = '';
    sentenceActions.innerHTML = '';

    const verdictOptions =
        session.metadata.caseType === 'civil' ?
            ['liable', 'not_liable']
        :   ['guilty', 'not_guilty'];

    for (const option of verdictOptions) {
        const button = document.createElement('button');
        button.textContent = option;
        button.onclick = () => castVote('verdict', option);
        button.disabled =
            session.phase !== 'verdict_vote' ||
            !voteState.verdict.isOpen ||
            voteState.verdict.hasVoted;
        verdictActions.appendChild(button);
    }

    for (const option of session.metadata.sentenceOptions) {
        const button = document.createElement('button');
        button.textContent = option;
        button.onclick = () => castVote('sentence', option);
        button.disabled =
            session.phase !== 'sentence_vote' ||
            !voteState.sentence.isOpen ||
            voteState.sentence.hasVoted;
        sentenceActions.appendChild(button);
    }
}

function resetVoteState() {
    voteState.verdict.isOpen = false;
    voteState.verdict.closesAt = null;
    voteState.verdict.hasVoted = false;
    voteState.verdict.error = '';
    voteState.sentence.isOpen = false;
    voteState.sentence.closesAt = null;
    voteState.sentence.hasVoted = false;
    voteState.sentence.error = '';
}

function formatCountdown(ms) {
    if (ms <= 0) return '00:00';
    const minutes = Math.floor(ms / 60000)
        .toString()
        .padStart(2, '0');
    const seconds = Math.floor((ms % 60000) / 1000)
        .toString()
        .padStart(2, '0');
    return `${minutes}:${seconds}`;
}

function renderVoteMeta() {
    verdictStatus.textContent = voteState.verdict.isOpen ? 'Open' : 'Closed';
    verdictStatus.className = `badge ${voteState.verdict.isOpen ? 'ok' : ''}`;
    verdictError.textContent = voteState.verdict.error || '';
    verdictNote.textContent =
        voteState.verdict.hasVoted ? 'Your vote is in.' : '';

    sentenceStatus.textContent = voteState.sentence.isOpen ? 'Open' : 'Closed';
    sentenceStatus.className = `badge ${voteState.sentence.isOpen ? 'ok' : ''}`;
    sentenceError.textContent = voteState.sentence.error || '';
    sentenceNote.textContent =
        voteState.sentence.hasVoted ? 'Your vote is in.' : '';
}

function updateVoteCountdowns() {
    const now = Date.now();
    const verdictCloseAt = voteState.verdict.closesAt;
    const sentenceCloseAt = voteState.sentence.closesAt;

    if (verdictCloseAt) {
        const remaining = Math.max(0, verdictCloseAt - now);
        verdictCountdown.textContent = formatCountdown(remaining);
        if (remaining === 0 && voteState.verdict.isOpen) {
            voteState.verdict.isOpen = false;
            if (activeSession) {
                renderActions(activeSession);
            }
            renderVoteMeta();
        }
    } else {
        verdictCountdown.textContent = '--:--';
    }

    if (sentenceCloseAt) {
        const remaining = Math.max(0, sentenceCloseAt - now);
        sentenceCountdown.textContent = formatCountdown(remaining);
        if (remaining === 0 && voteState.sentence.isOpen) {
            voteState.sentence.isOpen = false;
            if (activeSession) {
                renderActions(activeSession);
            }
            renderVoteMeta();
        }
    } else {
        sentenceCountdown.textContent = '--:--';
    }
}

function startVoteCountdowns() {
    if (voteCountdownInterval) {
        clearInterval(voteCountdownInterval);
    }
    updateVoteCountdowns();
    voteCountdownInterval = setInterval(updateVoteCountdowns, TIMER_TICK_MS);
}

function openVoteWindow(type, phaseStartedAt, phaseDurationMs) {
    if (!phaseStartedAt || !phaseDurationMs) {
        return;
    }
    const start = Date.parse(phaseStartedAt);
    voteState[type].isOpen = true;
    voteState[type].hasVoted = false;
    voteState[type].error = '';
    voteState[type].closesAt = start + phaseDurationMs;
    renderVoteMeta();
    startVoteCountdowns();
}

function closeVoteWindow(type, closedAt) {
    voteState[type].isOpen = false;
    voteState[type].closesAt = closedAt ? Date.parse(closedAt) : null;
    renderVoteMeta();
}

function updateTimer(phaseStartedAt, phaseDurationMs) {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }

    if (!phaseStartedAt || !phaseDurationMs) {
        phaseTimer.textContent = '--:--';
        phaseTimerFill.style.width = '0%';
        return;
    }

    const started = Date.parse(phaseStartedAt);
    const tick = () => {
        const elapsed = Date.now() - started;
        const remaining = Math.max(0, phaseDurationMs - elapsed);
        const progressRatio = Math.min(1, elapsed / phaseDurationMs);
        phaseTimerFill.style.width = `${Math.round(progressRatio * 100)}%`;
        const minutes = Math.floor(remaining / 60000)
            .toString()
            .padStart(2, '0');
        const seconds = Math.floor((remaining % 60000) / 1000)
            .toString()
            .padStart(2, '0');
        phaseTimer.textContent = `${minutes}:${seconds}`;
        if (remaining <= 0 && timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    };

    tick();
    timerInterval = setInterval(tick, TIMER_TICK_MS);
}

function scheduleReconnect(sessionId) {
    if (isFixtureReplayMode) {
        return;
    }

    if (reconnectTimer || !activeSession || activeSession.id !== sessionId) {
        return;
    }

    const delayMs = Math.min(
        RECONNECT_MAX_MS,
        RECONNECT_BASE_MS * 2 ** reconnectAttempts,
    );
    reconnectAttempts += 1;

    setConnectionBanner(
        `Stream disconnected. Reconnecting in ${Math.ceil(delayMs / 1000)}s (attempt ${reconnectAttempts})…`,
    );
    // eslint-disable-next-line no-console
    console.info(
        `[sse] reconnect_attempt session=${sessionId} attempt=${reconnectAttempts} delayMs=${delayMs}`,
    );

    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connectStream(sessionId, true);
    }, delayMs);
}

function handleSnapshotEvent(snapshotPayload) {
    const { session, turns, verdictVotes, sentenceVotes } = snapshotPayload;
    activeSession = session;
    activeSession.turns = turns;
    phaseBadge.textContent = `phase: ${session.phase}`;
    sessionMeta.textContent = `${session.id} · ${session.status}`;
    updateTimer(
        session.metadata.phaseStartedAt,
        session.metadata.phaseDurationMs,
    );
    updateCatchupPanel(activeSession);

    feed.innerHTML = '';
    resetStreamState(streamState, snapshotPayload);
    turns.forEach(turn => {
        appendTurn(turn, {
            recap: isRecapTurn(streamState, turn.id),
        });
    });
    if (turns.length === 0) {
        setActiveSpeakerLabel('Waiting for first turn…');
        dialogueTypewriterState.fullText = 'Captions will appear here.';
        setCaptionText(dialogueTypewriterState.fullText);
    }
    renderTally(verdictTallies, verdictVotes);
    renderTally(sentenceTallies, sentenceVotes);
    resetVoteState();
    if (session.phase === 'verdict_vote') {
        openVoteWindow(
            'verdict',
            session.metadata.phaseStartedAt,
            session.metadata.phaseDurationMs,
        );
    }
    if (session.phase === 'sentence_vote') {
        openVoteWindow(
            'sentence',
            session.metadata.phaseStartedAt,
            session.metadata.phaseDurationMs,
        );
    }
    renderActions(session);
    renderVoteMeta();
    syncRendererState();
}

function handleTurnEvent(turnPayload) {
    const turn = turnPayload.turn;
    if (!shouldAppendTurn(streamState, turn)) {
        return;
    }
    if (activeSession) {
        activeSession.turns = activeSession.turns || [];
        activeSession.turns.push(turn);
    }
    appendTurn(turn, {
        recap: isRecapTurn(streamState, turn.id),
    });
    updateCatchupPanel(activeSession);
    syncRendererState();
}

function handleJudgeRecapEvent(recapPayload) {
    markRecap(streamState, recapPayload.turnId);
    markTurnRecap(recapPayload.turnId);
    updateCatchupPanel(activeSession);
}

function handlePhaseChangedEvent(phasePayload) {
    if (activeSession) {
        activeSession.phase = phasePayload.phase;
        activeSession.metadata.phaseStartedAt = phasePayload.phaseStartedAt;
        activeSession.metadata.phaseDurationMs = phasePayload.phaseDurationMs;
        renderActions(activeSession);
    }
    phaseBadge.textContent = `phase: ${phasePayload.phase}`;
    updateTimer(phasePayload.phaseStartedAt, phasePayload.phaseDurationMs);
    updateCatchupPanel(activeSession);
    syncRendererState();
    if (phasePayload.phase === 'verdict_vote') {
        openVoteWindow(
            'verdict',
            phasePayload.phaseStartedAt,
            phasePayload.phaseDurationMs,
        );
    }
    if (phasePayload.phase === 'sentence_vote') {
        openVoteWindow(
            'sentence',
            phasePayload.phaseStartedAt,
            phasePayload.phaseDurationMs,
        );
    }
}

function handleVoteUpdatedEvent(votePayload) {
    renderTally(verdictTallies, votePayload.verdictVotes);
    renderTally(sentenceTallies, votePayload.sentenceVotes);
}

function handleVoteClosedEvent(voteClosedPayload) {
    const voteTotal = Object.values(voteClosedPayload.votes || {}).reduce(
        (sum, count) => sum + Number(count),
        0,
    );
    setStatus(
        `${voteClosedPayload.pollType} poll closed with ${voteTotal} vote${voteTotal === 1 ? '' : 's'}.`,
    );
    closeVoteWindow(voteClosedPayload.pollType, voteClosedPayload.closedAt);
    if (activeSession) {
        renderActions(activeSession);
    }
}

function handleSessionCompletedEvent() {
    setStatus('Session complete. Verdict delivered.');
    updateTimer();
    voteState.verdict.isOpen = false;
    voteState.sentence.isOpen = false;
    renderVoteMeta();
}

function handleSessionFailedEvent(failedPayload) {
    setStatus(`Session failed: ${failedPayload.reason}`, 'error');
    updateTimer();
}

function handleAnalyticsEvent(analyticsPayload) {
    if (analyticsPayload.name === 'poll_started') {
        setStatus(`${analyticsPayload.pollType} poll started.`);
    }
    if (analyticsPayload.name === 'poll_closed') {
        setStatus(`${analyticsPayload.pollType} poll closed.`);
    }
}

/**
 * Handle render_directive SSE events — forward to the PixiJS renderer.
 */
function handleRenderDirectiveEvent(directivePayload) {
    if (!courtRenderer?.applyDirective) {
        return;
    }
    const directive = directivePayload.directive;
    if (directive && typeof directive === 'object') {
        courtRenderer.applyDirective(directive);
    }
}

/**
 * Handle evidence_revealed SSE events — add card to the renderer tray.
 */
function handleEvidenceRevealedEvent(evidencePayload) {
    if (!courtRenderer?.evidence) {
        return;
    }
    const evidenceId = evidencePayload.evidenceId;
    const evidenceText = evidencePayload.evidenceText;
    if (typeof evidenceId === 'string' && typeof evidenceText === 'string') {
        courtRenderer.evidence.addCard({ id: evidenceId, text: evidenceText });
    }
}

/**
 * Push the current overlay state into the PixiJS renderer (if active).
 * Extracts role names from the session role assignments when available.
 */
function syncRendererState() {
    if (!courtRenderer) {
        return;
    }

    const lastTurn =
        activeSession?.turns?.length > 0 ?
            activeSession.turns[activeSession.turns.length - 1]
        :   null;

    const roleNames = {};
    const assignments = activeSession?.metadata?.roleAssignments;
    if (assignments && typeof assignments === 'object') {
        for (const [role, name] of Object.entries(assignments)) {
            if (typeof name === 'string') {
                roleNames[role] = name;
            }
        }
    }

    // Avoid skipping the typewriter animation: during an active animation,
    // prefer the currently visible caption text over fullText.
    let dialogueContent = dialogueTypewriterState.fullText;
    if (dialogueTypewriterState.frameId !== null) {
        const captionLineEl = document.querySelector('.caption-line');
        if (captionLineEl && typeof captionLineEl.textContent === 'string') {
            dialogueContent = captionLineEl.textContent;
        }
    }

    courtRenderer.update({
        phase: activeSession?.phase ?? 'idle',
        activeSpeakerRole: lastTurn?.role ?? null,
        roleNames,
        speakerLabel: dialogueTypewriterState.speakerLabel,
        dialogueContent,
        nameplate: lastTurn ? `${lastTurn.role} · ${lastTurn.speaker}` : '',
    });
}

const STREAM_EVENT_HANDLERS = {
    snapshot: handleSnapshotEvent,
    turn: handleTurnEvent,
    judge_recap_emitted: handleJudgeRecapEvent,
    phase_changed: handlePhaseChangedEvent,
    vote_updated: handleVoteUpdatedEvent,
    vote_closed: handleVoteClosedEvent,
    session_completed: handleSessionCompletedEvent,
    session_failed: handleSessionFailedEvent,
    analytics_event: handleAnalyticsEvent,
    render_directive: handleRenderDirectiveEvent,
    evidence_revealed: handleEvidenceRevealedEvent,
};

function dispatchStreamPayload(message) {
    if (!message || typeof message !== 'object') {
        return;
    }

    const type = typeof message.type === 'string' ? message.type : null;
    if (!type) {
        return;
    }

    const handler = STREAM_EVENT_HANDLERS[type];
    if (!handler) {
        return;
    }

    const payload =
        message.payload && typeof message.payload === 'object' ?
            message.payload
        :   {};

    handler(payload);
}

function readFixtureMessages(fixturePayload) {
    const rawEvents =
        Array.isArray(fixturePayload?.events) ? fixturePayload.events : [];

    return rawEvents
        .map(event => {
            const offsetMs = Number(event?.offsetMs);
            const delayMs =
                Number.isFinite(offsetMs) ? Math.max(0, offsetMs) : 0;
            const message =
                event?.message && typeof event.message === 'object' ?
                    event.message
                :   event;
            return { delayMs, message };
        })
        .filter(entry => entry.message && typeof entry.message === 'object');
}

async function fetchFixturePayload() {
    if (!fixtureReplayUrl) {
        throw new Error('Missing replayFixture URL');
    }

    const response = await fetch(fixtureReplayUrl, { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(
            `fixture fetch failed with ${response.status} ${response.statusText}`,
        );
    }

    return await response.json();
}

function buildFixtureSessionFromSnapshot(fixturePayload) {
    const replayMessages = readFixtureMessages(fixturePayload);
    const snapshotEnvelope = replayMessages
        .map(entry => entry.message)
        .find(message => message?.type === 'snapshot');

    const snapshotPayload =
        snapshotEnvelope && typeof snapshotEnvelope.payload === 'object' ?
            snapshotEnvelope.payload
        :   null;

    if (
        !snapshotPayload?.session ||
        typeof snapshotPayload.session !== 'object'
    ) {
        return null;
    }

    const session = snapshotPayload.session;
    const metadata =
        typeof session.metadata === 'object' && session.metadata !== null ?
            session.metadata
        :   {};

    return {
        ...session,
        turns:
            Array.isArray(snapshotPayload.turns) ? snapshotPayload.turns : [],
        metadata: {
            ...metadata,
            verdictVotes:
                snapshotPayload.verdictVotes ?? metadata.verdictVotes ?? {},
            sentenceVotes:
                snapshotPayload.sentenceVotes ?? metadata.sentenceVotes ?? {},
            recapTurnIds:
                snapshotPayload.recapTurnIds ?? metadata.recapTurnIds ?? [],
        },
    };
}

async function replayFixtureSession(sessionId) {
    if (!isFixtureReplayMode || !fixtureReplayUrl) {
        return;
    }

    clearFixtureReplayTimers();

    try {
        const fixturePayload = await fetchFixturePayload();
        const fixtureSessionId =
            typeof fixturePayload?.sessionId === 'string' ?
                fixturePayload.sessionId
            :   null;

        if (fixtureSessionId && fixtureSessionId !== sessionId) {
            setStatus(
                `Fixture replay session mismatch: expected ${sessionId.slice(0, 8)}, got ${fixtureSessionId.slice(0, 8)}.`,
                'error',
            );
        }

        const replayMessages = readFixtureMessages(fixturePayload);
        if (replayMessages.length === 0) {
            setStatus(
                'Fixture loaded, but no replay events were found.',
                'error',
            );
            return;
        }

        fixtureReplayState.active = true;
        setConnectionBanner(
            'Fixture replay mode active. Live SSE is disabled.',
        );
        setStatus(`Replaying fixture (${replayMessages.length} events).`);

        replayMessages.forEach(({ delayMs, message }, index) => {
            const timerId = setTimeout(() => {
                dispatchStreamPayload(message);

                if (index === replayMessages.length - 1) {
                    fixtureReplayState.active = false;
                    setStatus('Fixture replay finished.');
                }
            }, delayMs);

            fixtureReplayState.timers.push(timerId);
        });
    } catch (error) {
        fixtureReplayState.active = false;
        setStatus(
            `Fixture replay failed: ${error instanceof Error ? error.message : String(error)}`,
            'error',
        );
    }
}

async function hydrateFromFixtureReplay() {
    if (!isFixtureReplayMode) {
        return false;
    }

    try {
        const fixturePayload = await fetchFixturePayload();
        const fixtureSession = buildFixtureSessionFromSnapshot(fixturePayload);

        if (!fixtureSession?.id) {
            throw new Error(
                'fixture does not contain a valid snapshot session',
            );
        }

        hydrateSession(
            fixtureSession,
            'Loaded fixture snapshot. Replaying recorded stream.',
        );
        return true;
    } catch (error) {
        setStatus(
            `Failed to hydrate fixture replay: ${error instanceof Error ? error.message : String(error)}`,
            'error',
        );
        return false;
    }
}

function connectStream(sessionId, isReconnect = false) {
    if (source) {
        source.close();
        source = null;
    }

    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }

    if (isFixtureReplayMode) {
        void replayFixtureSession(sessionId);
        return;
    }

    source = new EventSource(`/api/court/sessions/${sessionId}/stream`);

    source.onopen = () => {
        reconnectAttempts = 0;
        setConnectionBanner('');
        if (isReconnect) {
            setStatus('Stream reconnected. Live updates resumed.');
        }
    };

    source.onmessage = event => {
        const payload = JSON.parse(event.data);
        dispatchStreamPayload(payload);
    };

    source.onerror = () => {
        setStatus('Stream disconnected. Attempting reconnect…', 'error');
        if (source) {
            source.close();
            source = null;
        }
        scheduleReconnect(sessionId);
    };
}

function hydrateSession(session, statusMessage) {
    clearFixtureReplayTimers();
    activeSession = session;
    activeSession.turns = session.turns || [];

    sessionMeta.textContent = `${activeSession.id} · ${activeSession.status}`;
    phaseBadge.textContent = `phase: ${activeSession.phase}`;

    feed.innerHTML = '';
    resetStreamState(streamState, {
        turns: activeSession.turns,
        recapTurnIds: activeSession.metadata.recapTurnIds ?? [],
    });

    activeSession.turns.forEach(turn => {
        appendTurn(turn, {
            recap: isRecapTurn(streamState, turn.id),
        });
    });

    if (activeSession.turns.length === 0) {
        setActiveSpeakerLabel('Waiting for first turn…');
        dialogueTypewriterState.fullText = 'Captions will appear here.';
        setCaptionText(dialogueTypewriterState.fullText);
    }

    renderTally(verdictTallies, activeSession.metadata.verdictVotes);
    renderTally(sentenceTallies, activeSession.metadata.sentenceVotes);

    resetVoteState();
    if (activeSession.phase === 'verdict_vote') {
        openVoteWindow(
            'verdict',
            activeSession.metadata.phaseStartedAt,
            activeSession.metadata.phaseDurationMs,
        );
    }

    if (activeSession.phase === 'sentence_vote') {
        openVoteWindow(
            'sentence',
            activeSession.metadata.phaseStartedAt,
            activeSession.metadata.phaseDurationMs,
        );
    }

    renderActions(activeSession);
    renderVoteMeta();
    updateTimer(
        activeSession.metadata.phaseStartedAt,
        activeSession.metadata.phaseDurationMs,
    );
    updateCatchupPanel(activeSession);
    connectStream(activeSession.id);

    setStatus(statusMessage);
}

startBtn.onclick = async () => {
    const topic = topicInput.value.trim();
    const caseType = caseTypeSelect.value;

    if (topic.length < 10) {
        setStatus('Topic must be at least 10 characters.', 'error');
        return;
    }

    setStartLoading(true);
    setStatus('Creating session...');
    setConnectionBanner('');

    try {
        const res = await fetch('/api/court/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic, caseType }),
        });

        const data = await res.json();

        if (!res.ok) {
            setStatus(data.error || 'Failed to start session', 'error');
            return;
        }

        hydrateSession(
            data.session,
            'Session started. Court is now in session.',
        );
    } finally {
        setStartLoading(false);
    }
};

async function connectLatestSession() {
    try {
        const response = await fetch('/api/court/sessions');
        if (!response.ok) {
            if (isFixtureReplayMode) {
                await hydrateFromFixtureReplay();
            }
            return;
        }

        const data = await response.json();
        const sessions = Array.isArray(data.sessions) ? data.sessions : [];
        if (sessions.length === 0) {
            if (isFixtureReplayMode) {
                const hydrated = await hydrateFromFixtureReplay();
                if (!hydrated) {
                    setStatus(
                        'No active session and fixture replay failed.',
                        'error',
                    );
                }
            } else {
                setStatus('No active session. Start one to begin.');
            }
            return;
        }

        const selectedSession =
            sessions.find(session => session?.status === 'running') ??
            sessions[0];
        const selectedSessionId = selectedSession?.id;
        if (!selectedSessionId) {
            return;
        }

        const sessionResponse = await fetch(
            `/api/court/sessions/${selectedSessionId}`,
        );
        if (!sessionResponse.ok) {
            return;
        }

        const sessionData = await sessionResponse.json();
        if (!sessionData?.session) {
            return;
        }

        const statusMessage =
            sessionData.session.status === 'running' ?
                'Connected to live session.'
            :   'Loaded latest session snapshot.';
        hydrateSession(sessionData.session, statusMessage);
    } catch (error) {
        if (isFixtureReplayMode) {
            const hydrated = await hydrateFromFixtureReplay();
            if (hydrated) {
                return;
            }
        }

        // eslint-disable-next-line no-console
        console.warn(
            'Failed to auto-attach latest session:',
            error instanceof Error ? error.message : error,
        );
    }
}

catchupToggleBtn.onclick = () => {
    setCatchupVisible(!catchupState.visible);
};

function isEditableElementFocused() {
    const focused = document.activeElement;
    if (!focused) {
        return false;
    }

    const tag = focused.tagName;
    return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        focused.isContentEditable
    );
}

if (captionSkipBtn) {
    captionSkipBtn.onclick = () => {
        skipDialogueTypewriter();
    };
}

if (captionSkipAllToggle) {
    captionSkipAllToggle.onchange = event => {
        const nextChecked = Boolean(event.target?.checked);
        setSkipAllCaptions(nextChecked);
    };
}

if (captionTypewriterToggle) {
    captionTypewriterToggle.onclick = () => {
        setTypewriterEnabled(!dialogueTypewriterState.enabled);
    };
}

document.addEventListener('keydown', event => {
    if (isEditableElementFocused()) {
        return;
    }

    if (event.key === 'Escape' || event.key === 'Enter') {
        event.preventDefault();
        skipDialogueTypewriter();
    }
});

renderDialogueControlState();
dialogueTypewriterState.fullText = captionLineEl.textContent;
setActiveSpeakerLabel(activeSpeakerEl.textContent);
setCaptionText(dialogueTypewriterState.fullText);

if (isFixtureReplayMode) {
    setConnectionBanner(
        `Fixture replay mode enabled (${fixtureReplayUrl}). Live SSE disabled.`,
    );
}

void bootstrapCourtRenderer();
void connectLatestSession();
