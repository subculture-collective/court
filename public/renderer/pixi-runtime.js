/**
 * PixiJS runtime resolver.
 *
 * Tries the global PIXI object first (loaded via <script> tag), then falls
 * back to a dynamic ESM import from the CDN.  Returns `null` when neither
 * source is available so callers can degrade gracefully.
 */

const CDN_URL = 'https://cdn.jsdelivr.net/npm/pixi.js@8.9.1/+esm';

export async function resolvePixiRuntime() {
    const globalPixi = globalThis.PIXI;
    if (globalPixi?.Application) {
        return globalPixi;
    }

    try {
        return await import(CDN_URL);
    } catch (error) {
        // eslint-disable-next-line no-console
        console.warn(
            'PIXI runtime unavailable; continuing without renderer stage.',
            error,
        );
        return null;
    }
}
