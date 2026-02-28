/**
 * Core stage manager — creates the PixiJS Application and the four ordered
 * scene-graph containers (background → characters → ui → effects).
 *
 * Returns `null` when PixiJS is unavailable so consumers can degrade.
 */

import { resolvePixiRuntime } from './pixi-runtime.js';

/**
 * Default canvas dimensions.  The canvas is responsive; these are the logical
 * reference dimensions the layers use for layout.
 */
export const STAGE_WIDTH = 960;
export const STAGE_HEIGHT = 540;

/**
 * @typedef {Object} RendererStage
 * @property {import('pixi.js').Application} app
 * @property {typeof import('pixi.js')} PIXI
 * @property {import('pixi.js').Container} backgroundLayer
 * @property {import('pixi.js').Container} charactersLayer
 * @property {import('pixi.js').Container} uiLayer
 * @property {import('pixi.js').Container} effectsLayer
 * @property {() => void} destroy
 */

/**
 * Bootstrap the PixiJS application and mount to the given host element.
 *
 * @param {HTMLElement} host  DOM element to mount the canvas into
 * @returns {Promise<RendererStage | null>}
 */
export async function createStage(host) {
    const PIXI = await resolvePixiRuntime();
    if (!PIXI) {
        host.dataset.pixiReady = 'false';
        return null;
    }

    try {
        const app = new PIXI.Application();
        await app.init({
            width: STAGE_WIDTH,
            height: STAGE_HEIGHT,
            antialias: true,
            backgroundAlpha: 0,
            resizeTo: host,
        });

        const backgroundLayer = new PIXI.Container();
        const charactersLayer = new PIXI.Container();
        const uiLayer = new PIXI.Container();
        const effectsLayer = new PIXI.Container();

        backgroundLayer.label = 'background';
        charactersLayer.label = 'characters';
        uiLayer.label = 'ui';
        effectsLayer.label = 'effects';

        app.stage.addChild(backgroundLayer);
        app.stage.addChild(charactersLayer);
        app.stage.addChild(uiLayer);
        app.stage.addChild(effectsLayer);

        host.innerHTML = '';
        host.appendChild(app.canvas);
        host.dataset.pixiReady = 'true';

        const destroy = () => {
            app.destroy(true, { children: true });
            host.dataset.pixiReady = 'false';
        };

        return {
            app,
            PIXI,
            backgroundLayer,
            charactersLayer,
            uiLayer,
            effectsLayer,
            destroy,
        };
    } catch (error) {
        host.dataset.pixiReady = 'false';
        // eslint-disable-next-line no-console
        console.warn('Failed to bootstrap PIXI renderer stage:', error);
        return null;
    }
}
