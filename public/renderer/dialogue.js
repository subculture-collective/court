/**
 * Dialogue state machine — Ace Attorney–style typewriter with punctuation
 * pauses, skip/advance, and per-line token tracking.
 *
 * Drives the canvas dialogue text independently of the DOM caption overlay
 * so the renderer can own its own timing (important for camera/effect sync).
 */

/** Pause durations (ms) after specific punctuation marks. */
const PUNCTUATION_PAUSES = {
    '.': 180,
    '!': 200,
    '?': 200,
    ',': 90,
    ';': 110,
    ':': 100,
    '…': 260,
    '—': 140,
};

const DEFAULT_CHARS_PER_SECOND = 48;
const BLIP_INTERVAL_CHARS = 3; // play blip every N characters

/**
 * @typedef {Object} DialogueLine
 * @property {string}  speaker   Speaker display label
 * @property {string}  text      Full dialogue text
 * @property {number}  token     Monotonic token to detect stale frames
 */

/**
 * @typedef {Object} DialogueCallbacks
 * @property {(text: string) => void}   onTextUpdate   Called with visible text slice
 * @property {(speaker: string) => void} onSpeakerUpdate Called with speaker label
 * @property {() => void}               onLineComplete  Called when line finishes
 * @property {() => void}               [onBlip]        Called for typewriter blip SFX
 */

/**
 * Create a dialogue state machine.
 *
 * @param {DialogueCallbacks} callbacks
 * @returns {Object}
 */
export function createDialogueStateMachine(callbacks) {
    let currentLine = null;
    let lineToken = 0;
    let charIndex = 0;
    let frameId = null;
    let paused = false;
    let pauseTimeout = null;
    let skipRequested = false;
    let skipAllMode = false;
    let enabled = true;
    let charsPerSecond = DEFAULT_CHARS_PER_SECOND;
    let lastBlipChar = 0;

    function clear() {
        if (frameId !== null) {
            cancelAnimationFrame(frameId);
            frameId = null;
        }
        if (pauseTimeout !== null) {
            clearTimeout(pauseTimeout);
            pauseTimeout = null;
        }
        paused = false;
        skipRequested = false;
    }

    function commitLine() {
        clear();
        if (currentLine) {
            callbacks.onTextUpdate(currentLine.text);
            callbacks.onLineComplete();
        }
    }

    function getPunctuationPause(char) {
        // Check for ellipsis (three dots)
        if (
            currentLine &&
            charIndex >= 3 &&
            currentLine.text.slice(charIndex - 2, charIndex + 1) === '...'
        ) {
            return PUNCTUATION_PAUSES['…'];
        }
        return PUNCTUATION_PAUSES[char] ?? 0;
    }

    function tick(timestamp) {
        if (!currentLine || lineToken !== currentLine.token) {
            return;
        }

        if (skipRequested || skipAllMode) {
            commitLine();
            return;
        }

        if (paused) {
            return; // waiting on punctuation pause
        }

        // Advance characters
        const elapsed = timestamp - (tick._startTime ?? timestamp);
        if (!tick._startTime) tick._startTime = timestamp;

        const targetChars = Math.min(
            currentLine.text.length,
            Math.max(1, Math.floor((elapsed / 1000) * charsPerSecond)),
        );

        if (targetChars > charIndex) {
            charIndex = targetChars;
            const visibleText = currentLine.text.slice(0, charIndex);
            callbacks.onTextUpdate(visibleText);

            // Blip SFX
            if (
                callbacks.onBlip &&
                charIndex - lastBlipChar >= BLIP_INTERVAL_CHARS
            ) {
                lastBlipChar = charIndex;
                callbacks.onBlip();
            }

            // Check punctuation pause
            const lastChar = currentLine.text[charIndex - 1];
            const pauseMs = getPunctuationPause(lastChar);
            if (pauseMs > 0 && charIndex < currentLine.text.length) {
                paused = true;
                pauseTimeout = setTimeout(() => {
                    paused = false;
                    pauseTimeout = null;
                    if (currentLine && lineToken === currentLine.token) {
                        frameId = requestAnimationFrame(tick);
                    }
                }, pauseMs);
                return;
            }
        }

        if (charIndex >= currentLine.text.length) {
            frameId = null;
            callbacks.onLineComplete();
            return;
        }

        frameId = requestAnimationFrame(tick);
    }

    /**
     * Start displaying a new dialogue line.
     *
     * @param {string} speaker  Speaker label
     * @param {string} text     Full dialogue text
     */
    function setLine(speaker, text) {
        clear();
        lineToken += 1;
        charIndex = 0;
        lastBlipChar = 0;
        tick._startTime = null;

        currentLine = { speaker, text, token: lineToken };
        callbacks.onSpeakerUpdate(speaker);

        if (!enabled || skipAllMode || text.length <= 1) {
            callbacks.onTextUpdate(text);
            callbacks.onLineComplete();
            return;
        }

        callbacks.onTextUpdate('');
        frameId = requestAnimationFrame(tick);
    }

    function skip() {
        if (frameId !== null || paused) {
            skipRequested = true;
            if (paused) {
                // Force resume from punctuation pause
                if (pauseTimeout !== null) {
                    clearTimeout(pauseTimeout);
                    pauseTimeout = null;
                }
                paused = false;
                commitLine();
            }
        }
    }

    function setSkipAll(value) {
        skipAllMode = Boolean(value);
        if (skipAllMode && (frameId !== null || paused)) {
            commitLine();
        }
    }

    function setEnabled(value) {
        enabled = Boolean(value);
        if (!enabled && (frameId !== null || paused)) {
            commitLine();
        }
    }

    function setSpeed(cps) {
        charsPerSecond = Number.isFinite(cps) && cps > 0 ? cps : DEFAULT_CHARS_PER_SECOND;
    }

    function isAnimating() {
        return frameId !== null || paused;
    }

    return {
        setLine,
        skip,
        setSkipAll,
        setEnabled,
        setSpeed,
        isAnimating,
        destroy: clear,
    };
}
