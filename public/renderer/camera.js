/**
 * Camera preset controller — manages zoom / pan transitions on the PixiJS
 * stage to create an Ace Attorney–style cinematic feel.
 *
 * Camera presets are named positions that the stage pivot + scale can
 * animate to.  Transitions use simple eased interpolation via
 * requestAnimationFrame so there are no animation-library dependencies.
 */

export const CAMERA_PRESETS = {
    wide: { x: 0, y: 0, zoom: 1.0 },
    judge: { x: 0.5, y: 0.1, zoom: 1.6 },
    prosecution: { x: 0.85, y: 0.35, zoom: 1.5 },
    defense: { x: 0.13, y: 0.35, zoom: 1.5 },
    witness: { x: 0.63, y: 0.25, zoom: 1.4 },
    evidence: { x: 0.5, y: 0.5, zoom: 1.3 },
    verdict: { x: 0.5, y: 0.3, zoom: 1.1 },
};

const DEFAULT_TRANSITION_MS = 600;

/**
 * Ease-out quad.
 * @param {number} t  Progress 0–1
 * @returns {number}
 */
function easeOutQuad(t) {
    return t * (2 - t);
}

/**
 * @param {import('./stage.js').RendererStage} stage
 */
export function initCamera(stage) {
    const { app } = stage;

    let currentPreset = 'wide';
    let animFrameId = null;

    // Resolved pixel values for current camera state
    let camX = 0;
    let camY = 0;
    let camZoom = 1.0;

    function applyTransform() {
        const w = app.screen.width;
        const h = app.screen.height;

        // Scale the stage around the centre of the screen
        app.stage.scale.set(camZoom);

        // Translate so the camera target is centred
        const pivotX = camX * w;
        const pivotY = camY * h;
        app.stage.pivot.set(pivotX, pivotY);

        // Offset so pivot point maps to screen centre
        app.stage.position.set(
            w / 2 - pivotX * (camZoom - 1),
            h / 2 - pivotY * (camZoom - 1),
        );
    }

    /**
     * Immediately snap the camera to a preset (no animation).
     *
     * @param {string} presetName
     */
    function snapTo(presetName) {
        if (animFrameId !== null) {
            cancelAnimationFrame(animFrameId);
            animFrameId = null;
        }

        const preset = CAMERA_PRESETS[presetName] ?? CAMERA_PRESETS.wide;
        currentPreset = presetName;
        camX = preset.x;
        camY = preset.y;
        camZoom = preset.zoom;
        applyTransform();
    }

    /**
     * Animate the camera to a preset over time.
     *
     * @param {string}  presetName               Target preset name
     * @param {Object}  [opts]
     * @param {number}  [opts.durationMs]         Transition duration
     * @param {(t: number) => number} [opts.ease] Easing function (default: easeOutQuad)
     * @returns {Promise<void>}  Resolves when animation completes
     */
    function transitionTo(presetName, opts = {}) {
        const preset = CAMERA_PRESETS[presetName] ?? CAMERA_PRESETS.wide;
        const durationMs = opts.durationMs ?? DEFAULT_TRANSITION_MS;
        const ease = opts.ease ?? easeOutQuad;

        if (animFrameId !== null) {
            cancelAnimationFrame(animFrameId);
            animFrameId = null;
        }

        currentPreset = presetName;
        const fromX = camX;
        const fromY = camY;
        const fromZoom = camZoom;
        const startTime = performance.now();

        return new Promise(resolve => {
            const tick = (timestamp) => {
                const elapsed = timestamp - startTime;
                const rawT = Math.min(1, elapsed / durationMs);
                const t = ease(rawT);

                camX = fromX + (preset.x - fromX) * t;
                camY = fromY + (preset.y - fromY) * t;
                camZoom = fromZoom + (preset.zoom - fromZoom) * t;
                applyTransform();

                if (rawT < 1) {
                    animFrameId = requestAnimationFrame(tick);
                } else {
                    animFrameId = null;
                    resolve();
                }
            };

            animFrameId = requestAnimationFrame(tick);
        });
    }

    /**
     * Reset camera to wide shot.
     */
    function reset() {
        snapTo('wide');
    }

    /**
     * Get the current preset name.
     */
    function getCurrentPreset() {
        return currentPreset;
    }

    // Start at wide shot
    snapTo('wide');

    return { snapTo, transitionTo, reset, getCurrentPreset, CAMERA_PRESETS };
}
