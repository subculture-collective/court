/**
 * Effects Cue System
 *
 * Primitives for SFX playback, screen shake, white flash, freeze frame, hit-stop,
 * and "OBJECTION!" style stamp overlays. Effects run independently of dialogue.
 */

import * as PIXI from 'pixi.js';
import { SceneGraph } from './scene.js';
import { AudioManager } from './audio.js';

export class EffectsCueSystem {
    private app: PIXI.Application;
    private scene: SceneGraph;
    private audio: AudioManager;
    private activeTweens: Array<{ ticker: () => void; destroy: () => void }> =
        [];

    constructor(app: PIXI.Application, scene: SceneGraph) {
        this.app = app;
        this.scene = scene;
        this.audio = new AudioManager();
    }

    /**
     * Initialize audio system with SFX configuration
     */
    public async initAudio(sfxConfig: Record<string, string>): Promise<void> {
        await this.audio.loadSFX(sfxConfig);
    }

    /**
     * Preload SFX from Howler.js
     * Call during initialization
     */
    public async loadSFX(soundMap: { [name: string]: string }): Promise<void> {
        // Will be wired once Howler.js integrated
        // For now, delegate to audio manager
        await this.audio.loadSFX(soundMap);
    }

    /**
     * Play a sound effect by name
     * Silently ignores unknown SFX names
     */
    public playSfx(name: string): void {
        this.audio.play(name);
    }

    /**
     * Flash white — full-screen white overlay that fades out over duration
     */
    public flashWhite(durationMs: number): Promise<void> {
        return new Promise(resolve => {
            const graphics = new PIXI.Graphics();
            graphics.rect(0, 0, this.app.canvas.width, this.app.canvas.height);
            graphics.fill(0xffffff);
            graphics.alpha = 1.0;
            this.scene.getEffectsLayer().addChild(graphics);

            const startTime = performance.now();
            const ticker = () => {
                const elapsed = performance.now() - startTime;
                const progress = Math.min(elapsed / durationMs, 1);
                graphics.alpha = 1.0 - progress;

                if (progress >= 1.0) {
                    destroy();
                    resolve();
                }
            };

            const destroy = () => {
                this.app.ticker.remove(ticker);
                this.scene.getEffectsLayer().removeChild(graphics);
                graphics.destroy();
                this.activeTweens = this.activeTweens.filter(
                    t => t.ticker !== ticker,
                );
            };

            this.app.ticker.add(ticker);
            this.activeTweens.push({ ticker, destroy });
        });
    }

    /**
     * Screen shake — Add random X/Y offset to camera container with decay
     */
    public async shake(intensity: number, durationMs: number): Promise<void> {
        return new Promise(resolve => {
            const container = this.scene.getCameraContainer();
            const startTime = performance.now();

            const ticker = () => {
                const elapsed = performance.now() - startTime;
                const progress = Math.min(elapsed / durationMs, 1);

                // Decay amplitude over duration
                const remainingAmplitude = intensity * (1 - progress);

                // Random X/Y offset
                const offsetX = (Math.random() - 0.5) * 2 * remainingAmplitude;
                const offsetY = (Math.random() - 0.5) * 2 * remainingAmplitude;

                container.x = offsetX;
                container.y = offsetY;

                if (progress >= 1.0) {
                    destroy();
                    resolve();
                }
            };

            const destroy = () => {
                this.app.ticker.remove(ticker);
                container.x = 0;
                container.y = 0;
                this.activeTweens = this.activeTweens.filter(
                    t => t.ticker !== ticker,
                );
            };

            this.app.ticker.add(ticker);
            this.activeTweens.push({ ticker, destroy });
        });
    }

    /**
     * Freeze frame — Pause ticker updates for specified duration (brief pause for impact)
     * Note: This is distinct from hitStop; freezeFrame is typically longer
     */
    public async freezeFrame(durationMs: number): Promise<void> {
        return new Promise(resolve => {
            const ticker = this.app.ticker;
            const originalAutoUpdate = ticker.autoStart;

            ticker.stop();

            setTimeout(() => {
                if (originalAutoUpdate) {
                    ticker.start();
                }
                resolve();
            }, durationMs);
        });
    }

    /**
     * Hit stop — Tiny pause for impact feel (similar to freezeFrame but typically shorter)
     */
    public async hitStop(durationMs: number): Promise<void> {
        return this.freezeFrame(durationMs);
    }

    /**
     * Stamp — Render bold overlay text (e.g., "OBJECTION!") that fades in and out
     */
    public async stamp(text: string, durationMs: number): Promise<void> {
        return new Promise(resolve => {
            const textSprite = new PIXI.Text({
                text,
                style: {
                    fontSize: 80,
                    fontWeight: 'bold',
                    fontFamily: 'Arial',
                    fill: 0xff0000,
                    stroke: 0x000000,
                    strokeThickness: 4,
                },
            });

            // Center text on canvas
            textSprite.x = (this.app.canvas.width - textSprite.width) / 2;
            textSprite.y = (this.app.canvas.height - textSprite.height) / 2;
            textSprite.alpha = 0;

            this.scene.getEffectsLayer().addChild(textSprite);

            const startTime = performance.now();
            let phase: 'fadeIn' | 'hold' | 'fadeOut' = 'fadeIn';
            const fadeInDuration = 150;
            const holdDuration = Math.max(durationMs - 300, durationMs * 0.5);
            const fadeOutDuration = 150;

            const ticker = () => {
                const elapsed = performance.now() - startTime;

                if (elapsed < fadeInDuration) {
                    // Fade in
                    textSprite.alpha = elapsed / fadeInDuration;
                } else if (elapsed < fadeInDuration + holdDuration) {
                    // Hold
                    phase = 'hold';
                    textSprite.alpha = 1.0;
                } else if (
                    elapsed <
                    fadeInDuration + holdDuration + fadeOutDuration
                ) {
                    // Fade out
                    phase = 'fadeOut';
                    const fadeElapsed = elapsed - fadeInDuration - holdDuration;
                    textSprite.alpha = 1.0 - fadeElapsed / fadeOutDuration;
                } else {
                    destroy();
                    resolve();
                }
            };

            const destroy = () => {
                this.app.ticker.remove(ticker);
                this.scene.getEffectsLayer().removeChild(textSprite);
                textSprite.destroy();
                this.activeTweens = this.activeTweens.filter(
                    t => t.ticker !== ticker,
                );
            };

            this.app.ticker.add(ticker);
            this.activeTweens.push({ ticker, destroy });
        });
    }

    /**
     * Stop all active effects
     */
    public stopAll(): void {
        this.activeTweens.forEach(t => t.destroy());
        this.activeTweens = [];

        // Reset camera container offset
        this.scene.getCameraContainer().x = 0;
        this.scene.getCameraContainer().y = 0;
    }

    /**
     * Cleanup
     */
    public destroy(): void {
        this.stopAll();
        this.audio.destroy();
    }
}
