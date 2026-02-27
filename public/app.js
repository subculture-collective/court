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
const statusEl = document.getElementById('status');
const phaseTimer = document.getElementById('phaseTimer');
const phaseTimerFill = document.getElementById('phaseTimerFill');
const activeSpeakerEl = document.getElementById('activeSpeaker');
const captionLineEl = document.getElementById('captionLine');
const connectionBanner = document.getElementById('connectionBanner');

let activeSession = null;
let source = null;
let timerInterval = null;
let reconnectTimer = null;
let reconnectAttempts = 0;

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

function appendTurn(turn) {
    const item = document.createElement('div');
    item.className = 'turn';

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `#${turn.turnNumber + 1} · ${turn.role} · ${turn.speaker} · ${turn.phase}`;

    const body = document.createElement('div');
    body.textContent = turn.dialogue;

    item.append(meta, body);
    feed.appendChild(item);
    feed.scrollTop = feed.scrollHeight;
    activeSpeakerEl.textContent = `${turn.role} · ${turn.speaker}`;
    pulseActiveSpeaker();
    captionLineEl.textContent = turn.dialogue;
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

    const res = await fetch(`/api/court/sessions/${activeSession.id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, choice }),
    });

    if (!res.ok) {
        const err = await res.json();
        setStatus(err.error || 'Vote failed', 'error');
        return;
    }

    const data = await res.json();
    renderTally(verdictTallies, data.verdictVotes);
    renderTally(sentenceTallies, data.sentenceVotes);
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
        button.disabled = session.phase !== 'verdict_vote';
        verdictActions.appendChild(button);
    }

    for (const option of session.metadata.sentenceOptions) {
        const button = document.createElement('button');
        button.textContent = option;
        button.onclick = () => castVote('sentence', option);
        button.disabled = session.phase !== 'sentence_vote';
        sentenceActions.appendChild(button);
    }
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
            turns.forEach(appendTurn);
            if (turns.length === 0) {
                activeSpeakerEl.textContent = 'Waiting for first turn…';
                captionLineEl.textContent = 'Captions will appear here.';
            }
            renderTally(verdictTallies, verdictVotes);
            renderTally(sentenceTallies, sentenceVotes);
            renderActions(session);
            return;
        }

        if (payload.type === 'turn') {
            appendTurn(payload.payload.turn);
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
            return;
        }

        if (payload.type === 'session_completed') {
            setStatus('Session complete. Verdict delivered.');
            updateTimer();
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
