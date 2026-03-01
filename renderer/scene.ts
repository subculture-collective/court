/**
 * Scene Graph Management
 *
 * Manages hierarchical organization of sprites, backgrounds, UI layers.
 * Provides z-index layering and camera system for effects like shake.
 */

import * as PIXI from 'pixi.js';

export class SceneGraph {
    private root: PIXI.Container;
    private cameraContainer: PIXI.Container;
    private backgroundLayer: PIXI.Container;
    private spriteLayer: PIXI.Container;
    private uiLayer: PIXI.Container;
    private effectsLayer: PIXI.Container;

    constructor(stage: PIXI.Container) {
        this.root = stage;

        // Camera container — all scene content goes here so shake affects everything
        this.cameraContainer = new PIXI.Container();
        this.root.addChild(this.cameraContainer);

        // Background layer (z: 0)
        this.backgroundLayer = new PIXI.Container();
        this.cameraContainer.addChild(this.backgroundLayer);

        // Sprite layer (z: 10) — characters, evidence
        this.spriteLayer = new PIXI.Container();
        this.cameraContainer.addChild(this.spriteLayer);

        // UI layer (z: 100) — dialogs, captions
        this.uiLayer = new PIXI.Container();
        this.cameraContainer.addChild(this.uiLayer);

        // Effects layer (z: 1000) — flash, stamp, overlays
        this.effectsLayer = new PIXI.Container();
        this.root.addChild(this.effectsLayer);
    }

    /**
     * Get the camera container for applying camera effects (shake, pan, zoom)
     */
    public getCameraContainer(): PIXI.Container {
        return this.cameraContainer;
    }

    /**
     * Add a sprite to the sprite layer
     */
    public addSprite(sprite: PIXI.Sprite | PIXI.Container): void {
        this.spriteLayer.addChild(sprite);
    }

    /**
     * Remove a sprite from the sprite layer
     */
    public removeSprite(sprite: PIXI.DisplayObject): void {
        this.spriteLayer.removeChild(sprite);
    }

    /**
     * Get the background layer
     */
    public getBackgroundLayer(): PIXI.Container {
        return this.backgroundLayer;
    }

    /**
     * Get the sprite layer
     */
    public getSpriteLayer(): PIXI.Container {
        return this.spriteLayer;
    }

    /**
     * Get the UI layer
     */
    public getUILayer(): PIXI.Container {
        return this.uiLayer;
    }

    /**
     * Get the effects layer (flash, stamp, etc.)
     */
    public getEffectsLayer(): PIXI.Container {
        return this.effectsLayer;
    }

    /**
     * Handle window/canvas resize
     */
    public onResize(width: number, height: number): void {
        // Center layers if needed
        // Can be extended for responsive layouts
    }

    /**
     * Destroy all layers and cleanup
     */
    public destroy(): void {
        this.backgroundLayer.destroy();
        this.spriteLayer.destroy();
        this.uiLayer.destroy();
        this.effectsLayer.destroy();
        this.cameraContainer.destroy();
        this.root.destroy();
    }
}
