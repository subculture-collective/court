/**
 * Audio module — SFX playback via Howler.js (CDN global).
 *
 * Call initAudio() to get a {loadSFX, playSfx} handle.
 * loadSFX() is fire-and-forget; the module is safe to call before loading completes.
 */

export const DEFAULT_SFX_CONFIG = {
    objection:      '/assets/sfx/objection.mp3',
    hold_it:        '/assets/sfx/hold_it.mp3',
    gavel:          '/assets/sfx/gavel.mp3',
    crowd_gasp:     '/assets/sfx/crowd_gasp.mp3',
    dramatic_sting: '/assets/sfx/dramatic_sting.mp3',
};

/**
 * @returns {{ loadSFX: (config?: Record<string,string>) => Promise<void>, playSfx: (name: string) => void }}
 */
export function initAudio() {
    /** @type {Map<string, import('howler').Howl>} */
    const sounds = new Map();
    let ready = false;

    /**
     * Load SFX files from config.
     * Safe to call multiple times — subsequent calls no-op.
     *
     * @param {Record<string, string>} [config]
     */
    async function loadSFX(config = DEFAULT_SFX_CONFIG) {
        if (ready) return;

        if (typeof Howl === 'undefined') {
            console.warn('[Audio] Howler not available — SFX disabled');
            return;
        }

        const promises = Object.entries(config).map(
            ([name, path]) =>
                new Promise(resolve => {
                    try {
                        const sound = new Howl({
                            src: [path],
                            preload: true,
                            onload: resolve,
                            onloaderror: () => {
                                console.warn(
                                    `[Audio] Failed to load "${name}" (${path}) — continuing without it`,
                                );
                                resolve();
                            },
                        });
                        sounds.set(name, sound);
                    } catch (err) {
                        console.warn(`[Audio] Error creating Howl for "${name}":`, err);
                        resolve();
                    }
                }),
        );

        await Promise.all(promises);
        ready = true;
        console.log(`[Audio] Loaded ${sounds.size} SFX`);
    }

    /**
     * Play a sound by name. Silently ignored if not loaded or unknown.
     *
     * @param {string} name
     */
    function playSfx(name) {
        if (!ready) return;
        const sound = sounds.get(name);
        if (sound) {
            sound.play();
        }
        // unknown names are silently ignored — satisfies AC
    }

    return { loadSFX, playSfx };
}

/** Noop audio handle — used as default when audio is not initialised. */
export const NOOP_AUDIO = { loadSFX: async () => {}, playSfx: () => {} };
