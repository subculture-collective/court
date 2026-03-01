/**
 * PixiJS Application Setup
 *
 * Main renderer entry point. Initializes the PixiJS application with stage,
 * viewport, and ticker. Manages lifecycle of effects system and scene.
 */

import * as PIXI from 'pixi.js';
import { EffectsCueSystem } from './effects.js';
import { SceneGraph } from './scene.js';
import { DEFAULT_SFX_CONFIG } from './audio.js';

export class CourtRenderer {
    private app: PIXI.Application;
    private scene: SceneGraph;
    public effects: EffectsCueSystem;

    constructor(
        options: {
            width?: number;
            height?: number;
            container?: HTMLElement;
        } = {},
    ) {
        const {
            width = 1280,
            height = 720,
            container = document.body,
        } = options;

        // Initialize PixiJS application
        this.app = new PIXI.Application({
            width,
            height,
            backgroundColor: 0x000000,
            resolution: window.devicePixelRatio || 1,
            antialias: true,
            sharedTicker: true,
        });

        container.appendChild(this.app.canvas);

        // Initialize scene graph
        this.scene = new SceneGraph(this.app.stage);

        // Initialize effects system
        this.effects = new EffectsCueSystem(this.app, this.scene);

        // Start animation loop
        this.app.ticker.start();

        // Initialize audio (non-blocking, will load in background)
        this.effects.initAudio(DEFAULT_SFX_CONFIG).catch((err: unknown) => {
            console.warn('Failed to initialize audio:', err);
        });
    }

    /**
     * Get the PixiJS application instance
     */
    public getApp(): PIXI.Application {
        return this.app;
    }

    /**
     * Get the scene graph
     */
    public getScene(): SceneGraph {
        return this.scene;
    }

    /**
     * Resize canvas (e.g., on window resize)
     */
    public resize(width: number, height: number): void {
        this.app.renderer.resize(width, height);
        this.scene.onResize(width, height);
    }

    /**
     * Destroy renderer and clean up resources
     */
    public destroy(): void {
        this.effects.destroy();
        this.scene.destroy();
        this.app.destroy(true);
    }
}

/**
 * Global renderer instance (singleton pattern)
 */
let globalRenderer: CourtRenderer | null = null;

export function initRenderer(options?: {
    width?: number;
    height?: number;
    container?: HTMLElement;
}): CourtRenderer {
    if (globalRenderer) {
        console.warn(
            'Renderer already initialized, returning existing instance',
        );
        return globalRenderer;
    }
    globalRenderer = new CourtRenderer(options);
    return globalRenderer;
}

export function getRenderer(): CourtRenderer | null {
    return globalRenderer;
}

export function destroyRenderer(): void {
    if (globalRenderer) {
        globalRenderer.destroy();
        globalRenderer = null;
    }
}
