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

let activeSession = null;
let source = null;

function setStatus(message, type = 'ok') {
    statusEl.textContent = message;
    statusEl.className = type === 'error' ? 'danger' : 'ok';
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
}

function renderTally(container, map) {
    container.innerHTML = '';
    const entries = Object.entries(map || {});
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
        row.textContent = `${choice}: ${count}`;
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
        session.metadata.caseType === 'civil'
            ? ['liable', 'not_liable']
            : ['guilty', 'not_guilty'];

    for (const option of verdictOptions) {
        const button = document.createElement('button');
        button.textContent = option;
        button.onclick = () => castVote('verdict', option);
        verdictActions.appendChild(button);
    }

    for (const option of session.metadata.sentenceOptions) {
        const button = document.createElement('button');
        button.textContent = option;
        button.onclick = () => castVote('sentence', option);
        sentenceActions.appendChild(button);
    }
}

function connectStream(sessionId) {
    if (source) {
        source.close();
    }

    source = new EventSource(`/api/court/sessions/${sessionId}/stream`);

    source.onmessage = event => {
        const payload = JSON.parse(event.data);

        if (payload.type === 'snapshot') {
            const { session, turns, verdictVotes, sentenceVotes } = payload.payload;
            activeSession = session;
            phaseBadge.textContent = `phase: ${session.phase}`;
            sessionMeta.textContent = `${session.id} · ${session.status}`;

            feed.innerHTML = '';
            turns.forEach(appendTurn);
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
            phaseBadge.textContent = `phase: ${payload.payload.phase}`;
            return;
        }

        if (payload.type === 'vote_updated') {
            renderTally(verdictTallies, payload.payload.verdictVotes);
            renderTally(sentenceTallies, payload.payload.sentenceVotes);
            return;
        }

        if (payload.type === 'session_completed') {
            setStatus('Session complete. Verdict delivered.');
        }

        if (payload.type === 'session_failed') {
            setStatus(`Session failed: ${payload.payload.reason}`, 'error');
        }
    };

    source.onerror = () => {
        setStatus('Stream disconnected. Reload if needed.', 'error');
    };
}

startBtn.onclick = async () => {
    const topic = topicInput.value.trim();
    const caseType = caseTypeSelect.value;

    if (topic.length < 10) {
        setStatus('Topic must be at least 10 characters.', 'error');
        return;
    }

    setStatus('Creating session...');

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
    connectStream(activeSession.id);
    setStatus('Session started. Court is now in session.');
};
