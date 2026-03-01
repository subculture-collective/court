/**
 * Effects layer — visual effect cues (flash, shake, freeze/hit-stop,
 * stamped overlays like "OBJECTION!" / "HOLD IT!").
 *
 * Each cue is fire-and-forget: call `trigger(cueName, opts)` and the effect
 * runs to completion inside the effects container then self-destructs.
 */

import {
    FLASH_DEFAULT,
    OBJECTION_COLOR,
    HOLD_IT_COLOR,
    TAKE_THAT_COLOR,
    STAMP_STROKE_COLOR,
} from '../theme.js';

const SHAKE_INTENSITY_PX = 6;
const SHAKE_DURATION_MS = 300;
const FLASH_DURATION_MS = 150;
const FREEZE_DURATION_MS = 400;
const STAMP_DISPLAY_MS = 1200;

/**
 * @param {import('../stage.js').RendererStage} stage
 * @param {{ playSfx: (name: string) => void }} [audio]
 */
export function initEffects(stage, audio = { playSfx: () => {} }) {
    const { PIXI, effectsLayer, app } = stage;

    let shakeTimer = null;

    /**
     * Full-screen colour flash.
     *
     * @param {Object}  opts
     * @param {number}  [opts.color=0xffffff]   Flash colour
     * @param {number}  [opts.alpha=0.6]        Flash alpha
     * @param {number}  [opts.durationMs]       Duration in ms
     */
    function flash(opts = {}) {
        const color = opts.color ?? FLASH_DEFAULT;
        const alpha = opts.alpha ?? 0.6;
        const duration = opts.durationMs ?? FLASH_DURATION_MS;

        const gfx = new PIXI.Graphics();
        gfx.beginFill(color, alpha);
        gfx.drawRect(0, 0, app.screen.width, app.screen.height);
        gfx.endFill();
        effectsLayer.addChild(gfx);

        setTimeout(() => {
            effectsLayer.removeChild(gfx);
            gfx.destroy();
        }, duration);
    }

    /**
     * Screen shake — oscillates the stage pivot for a short burst.
     *
     * @param {Object} opts
     * @param {number} [opts.intensity]   Pixel amplitude
     * @param {number} [opts.durationMs]  Duration in ms
     */
    function shake(opts = {}) {
        const intensity = opts.intensity ?? SHAKE_INTENSITY_PX;
        const duration = opts.durationMs ?? SHAKE_DURATION_MS;

        // Cancel any running shake
        if (shakeTimer !== null) {
            clearInterval(shakeTimer);
            app.stage.position.set(0, 0);
        }

        const startTime = performance.now();
        shakeTimer = setInterval(() => {
            const elapsed = performance.now() - startTime;
            if (elapsed >= duration) {
                clearInterval(shakeTimer);
                shakeTimer = null;
                app.stage.position.set(0, 0);
                return;
            }
            const decay = 1 - elapsed / duration;
            const dx = (Math.random() * 2 - 1) * intensity * decay;
            const dy = (Math.random() * 2 - 1) * intensity * decay;
            app.stage.position.set(dx, dy);
        }, 16);
    }

    /**
     * Freeze / hit-stop — pauses ticker for a brief moment.
     *
     * @param {Object} opts
     * @param {number} [opts.durationMs]
     */
    function freeze(opts = {}) {
        const duration = opts.durationMs ?? FREEZE_DURATION_MS;
        app.ticker.stop();
        setTimeout(() => {
            app.ticker.start();
        }, duration);
    }

    /**
     * Stamped text overlay — centred text that fades in, holds, then fades out.
     * Used for "OBJECTION!", "HOLD IT!", "TAKE THAT!", etc.
     *
     * @param {Object}  opts
     * @param {string}  opts.text           Text to stamp
     * @param {number}  [opts.color=0xff4444] Text fill colour
     * @param {number}  [opts.fontSize=48]    Font size
     * @param {number}  [opts.displayMs]      Total display time
     */
    function stamp(opts = {}) {
        const text = opts.text ?? 'OBJECTION!';
        const color = opts.color ?? OBJECTION_COLOR;
        const fontSize = opts.fontSize ?? 48;
        const displayMs = opts.displayMs ?? STAMP_DISPLAY_MS;

        const label = new PIXI.Text({
            text,
            style: {
                fill: color,
                fontSize,
                fontFamily: 'Impact, Arial Black, sans-serif',
                fontWeight: '900',
                stroke: STAMP_STROKE_COLOR,
                strokeThickness: 4,
                align: 'center',
                dropShadow: true,
                dropShadowColor: STAMP_STROKE_COLOR,
                dropShadowDistance: 3,
            },
        });
        label.anchor.set(0.5, 0.5);
        label.position.set(app.screen.width / 2, app.screen.height / 2);
        label.alpha = 0;
        effectsLayer.addChild(label);

        // Fade in over 80ms
        const fadeInMs = 80;
        const fadeOutMs = 200;
        const holdMs = Math.max(0, displayMs - fadeInMs - fadeOutMs);

        let startTime = performance.now();
        const animateIn = () => {
            const elapsed = performance.now() - startTime;
            label.alpha = Math.min(1, elapsed / fadeInMs);
            if (elapsed < fadeInMs) {
                requestAnimationFrame(animateIn);
            } else {
                label.alpha = 1;
                setTimeout(() => {
                    startTime = performance.now();
                    requestAnimationFrame(animateOut);
                }, holdMs);
            }
        };

        const animateOut = () => {
            const elapsed = performance.now() - startTime;
            label.alpha = Math.max(0, 1 - elapsed / fadeOutMs);
            if (elapsed < fadeOutMs) {
                requestAnimationFrame(animateOut);
            } else {
                effectsLayer.removeChild(label);
                label.destroy();
            }
        };

        requestAnimationFrame(animateIn);
    }

    /** Cue name → handler mapping. */
    const CUE_HANDLERS = {
        flash,
        shake,
        freeze,
        stamp,
    };

    /**
     * Trigger an effect cue by name.
     *
     * @param {string} cue   Effect name ('flash' | 'shake' | 'freeze' | 'stamp')
     * @param {Object} [opts] Options forwarded to the handler
     */
    function trigger(cue, opts = {}) {
        const handler = CUE_HANDLERS[cue];
        if (handler) {
            handler(opts);
        }
    }

    /**
     * Convenience: composite "objection" cue (stamp + flash + shake).
     */
    function objection() {
        audio.playSfx('objection');
        flash({ color: OBJECTION_COLOR, alpha: 0.35 });
        shake({ intensity: 8, durationMs: 350 });
        stamp({ text: 'OBJECTION!', color: OBJECTION_COLOR });
    }

    /**
     * Convenience: "hold it" cue.
     */
    function holdIt() {
        audio.playSfx('hold_it');
        flash({ color: HOLD_IT_COLOR, alpha: 0.3 });
        stamp({ text: 'HOLD IT!', color: HOLD_IT_COLOR });
    }

    /**
     * Convenience: "take that" cue.
     */
    function takeThat() {
        audio.playSfx('dramatic_sting');
        flash({ color: TAKE_THAT_COLOR, alpha: 0.3 });
        stamp({ text: 'TAKE THAT!', color: TAKE_THAT_COLOR });
    }

    return { trigger, flash, shake, freeze, stamp, objection, holdIt, takeThat };
}
