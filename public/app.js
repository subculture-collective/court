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
    voteCountdownInterval = setInterval(updateVoteCountdowns, 250);
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
    timerInterval = setInterval(tick, 250);
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

        if (payload.type === 'snapshot') {
            const { session, turns, verdictVotes, sentenceVotes } =
                payload.payload;
            activeSession = session;
            phaseBadge.textContent = `phase: ${session.phase}`;
            sessionMeta.textContent = `${session.id} · ${session.status}`;
            updateTimer(
                session.metadata.phaseStartedAt,
                session.metadata.phaseDurationMs,
            );

            feed.innerHTML = '';
            resetStreamState(streamState, payload.payload);
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
            return;
        }

        if (payload.type === 'turn') {
            const turn = payload.payload.turn;
            if (!shouldAppendTurn(streamState, turn)) {
                return;
            }
            appendTurn(turn, {
                recap: isRecapTurn(streamState, turn.id),
            });
            return;
        }

        if (payload.type === 'judge_recap_emitted') {
            markRecap(streamState, payload.payload.turnId);
            markTurnRecap(payload.payload.turnId);
            return;
        }

        if (payload.type === 'phase_changed') {
            if (activeSession) {
                activeSession.phase = payload.payload.phase;
                activeSession.metadata.phaseStartedAt =
                    payload.payload.phaseStartedAt;
                activeSession.metadata.phaseDurationMs =
                    payload.payload.phaseDurationMs;
                renderActions(activeSession);
            }
            phaseBadge.textContent = `phase: ${payload.payload.phase}`;
            updateTimer(
                payload.payload.phaseStartedAt,
                payload.payload.phaseDurationMs,
            );
            if (payload.payload.phase === 'verdict_vote') {
                openVoteWindow(
                    'verdict',
                    payload.payload.phaseStartedAt,
                    payload.payload.phaseDurationMs,
                );
            }
            if (payload.payload.phase === 'sentence_vote') {
                openVoteWindow(
                    'sentence',
                    payload.payload.phaseStartedAt,
                    payload.payload.phaseDurationMs,
                );
            }
            return;
        }

        if (payload.type === 'vote_updated') {
            renderTally(verdictTallies, payload.payload.verdictVotes);
            renderTally(sentenceTallies, payload.payload.sentenceVotes);
            return;
        }

        if (payload.type === 'vote_closed') {
            const voteTotal = Object.values(payload.payload.votes || {}).reduce(
                (sum, count) => sum + Number(count),
                0,
            );
            setStatus(
                `${payload.payload.pollType} poll closed with ${voteTotal} vote${voteTotal === 1 ? '' : 's'}.`,
            );
            closeVoteWindow(payload.payload.pollType, payload.payload.closedAt);
            if (activeSession) {
                renderActions(activeSession);
            }
            return;
        }

        if (payload.type === 'session_completed') {
            setStatus('Session complete. Verdict delivered.');
            updateTimer();
            voteState.verdict.isOpen = false;
            voteState.sentence.isOpen = false;
            renderVoteMeta();
        }

        if (payload.type === 'session_failed') {
            setStatus(`Session failed: ${payload.payload.reason}`, 'error');
            updateTimer();
        }

        if (payload.type === 'analytics_event') {
            if (payload.payload.name === 'poll_started') {
                setStatus(`${payload.payload.pollType} poll started.`);
            }
            if (payload.payload.name === 'poll_closed') {
                setStatus(`${payload.payload.pollType} poll closed.`);
            }
        }
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
        connectStream(activeSession.id);
        setStatus('Session started. Court is now in session.');
    } finally {
        setStartLoading(false);
    }
};
