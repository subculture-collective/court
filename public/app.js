import {
    createStreamState,
    isRecapTurn,
    markRecap,
    resetStreamState,
    shouldAppendTurn,
} from './stream-state.js';

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

    return clip(recent.map(turn => `${turn.speaker}: ${turn.dialogue}`).join(' · '));
}

function updateCatchupPanel(session) {
    const phase = session?.phase;
    const turns = session?.turns ?? [];
    catchupSummaryEl.textContent = summarizeCaseSoFar(turns);
    catchupMetaEl.textContent = phase
        ? `phase: ${phase} · ${juryStepLabel(phase)}`
        : 'phase: idle · Jury pending';
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
    activeSpeakerEl.textContent = `${turn.role} · ${turn.speaker}`;
    pulseActiveSpeaker();
    captionLineEl.textContent = turn.dialogue;
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
        activeSpeakerEl.textContent = 'Waiting for first turn…';
        captionLineEl.textContent = 'Captions will appear here.';
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
};

function connectStream(sessionId, isReconnect = false) {
    if (source) {
        source.close();
        source = null;
    }

    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
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
        const handler = STREAM_EVENT_HANDLERS[payload.type];
        if (!handler) {
            return;
        }

        handler(payload.payload);
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

        activeSession = data.session;
        activeSession.turns = data.session.turns || [];
        sessionMeta.textContent = `${activeSession.id} · ${activeSession.status}`;
        phaseBadge.textContent = `phase: ${activeSession.phase}`;
        feed.innerHTML = '';
        renderTally(verdictTallies, activeSession.metadata.verdictVotes);
        renderTally(sentenceTallies, activeSession.metadata.sentenceVotes);
        renderActions(activeSession);
        updateTimer(
            activeSession.metadata.phaseStartedAt,
            activeSession.metadata.phaseDurationMs,
        );
        updateCatchupPanel(activeSession);
        connectStream(activeSession.id);
        setStatus('Session started. Court is now in session.');
    } finally {
        setStartLoading(false);
    }
};

catchupToggleBtn.onclick = () => {
    setCatchupVisible(!catchupState.visible);
};
