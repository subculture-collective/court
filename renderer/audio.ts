/**
 * Audio System Integration
 *
 * Manages SFX playback via Howler.js
 * Preloads sounds during initialization
 */

import { Howler, Howl } from 'howler';

export interface SFXConfig {
    [soundName: string]: string; // sound name -> audio file path
}

export class AudioManager {
    private sounds: Map<string, Howl> = new Map();
    private isLoaded: boolean = false;

    /**
     * Preload SFX files
     */
    public async loadSFX(config: SFXConfig): Promise<void> {
        try {
            for (const [name, path] of Object.entries(config)) {
                const sound = new Howl({
                    src: [path],
                    preload: true,
                });

                await new Promise<void>((resolve, reject) => {
                    sound.once('load', () => resolve());
                    sound.once('loaderror', () => {
                        console.warn(
                            `Failed to load SFX: ${name} from ${path}`,
                        );
                        resolve(); // Don't reject, allow graceful fallback
                    });
                    sound.once('playerror', () => {
                        console.warn(`Playback error for SFX: ${name}`);
                        resolve();
                    });
                });

                this.sounds.set(name, sound);
            }

            this.isLoaded = true;
            console.log(`[Audio] Loaded ${this.sounds.size} SFX files`);
        } catch (err) {
            console.error('[Audio] Error loading SFX:', err);
            // Continue even if SFX loading fails
        }
    }

    /**
     * Play a sound effect by name
     */
    public play(soundName: string): void {
        if (!this.isLoaded) {
            console.warn('[Audio] SFX not loaded yet');
            return;
        }

        const sound = this.sounds.get(soundName);
        if (sound) {
            sound.play();
        } else {
            console.warn(`[Audio] Unknown SFX: ${soundName}`);
        }
    }

    /**
     * Stop a specific sound or all sounds
     */
    public stop(soundName?: string): void {
        if (soundName) {
            const sound = this.sounds.get(soundName);
            if (sound) {
                sound.stop();
            }
        } else {
            Howler.stop(); // Stop all sounds
        }
    }

    /**
     * Set global volume (0-1)
     */
    public setVolume(volume: number): void {
        Howler.volume(Math.max(0, Math.min(1, volume)));
    }

    public getVolume(): number {
        return Howler.volume();
    }

    /**
     * Cleanup
     */
    public destroy(): void {
        this.sounds.forEach(sound => {
            sound.unload();
        });
        this.sounds.clear();
        this.isLoaded = false;
    }
}

/**
 * Default SFX configuration
 * Maps sound names to asset paths
 */
export const DEFAULT_SFX_CONFIG: SFXConfig = {
    objection: '/assets/sfx/objection.mp3',
    hold_it: '/assets/sfx/hold_it.mp3',
    gavel: '/assets/sfx/gavel.mp3',
    crowd_gasp: '/assets/sfx/crowd_gasp.mp3',
    dramatic_sting: '/assets/sfx/dramatic_sting.mp3',
};
