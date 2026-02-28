/**
 * Background layer — draws a courtroom backdrop.
 *
 * Placeholder-first: when no background sprite is available, renders a
 * labelled gradient rectangle with outlined furniture (bench, podiums,
 * gallery railing) so the layout is visible during development.
 */

import { STAGE_WIDTH, STAGE_HEIGHT } from '../stage.js';

const BENCH_COLOR = 0x3b2f1e;
const PODIUM_COLOR = 0x2d2417;
const FLOOR_COLOR = 0x1a1428;
const WALL_COLOR = 0x0e1422;
const LINE_COLOR = 0x4a3f2e;

/**
 * @param {import('../stage.js').RendererStage} stage
 */
export function initBackground(stage) {
    const { PIXI, backgroundLayer, app } = stage;

    const gfx = new PIXI.Graphics();
    backgroundLayer.addChild(gfx);

    const label = new PIXI.Text({
        text: 'COURTROOM BACKGROUND (placeholder)',
        style: {
            fill: 0x555566,
            fontSize: 11,
            fontFamily: 'monospace',
        },
    });
    label.anchor.set(0.5, 0);
    backgroundLayer.addChild(label);

    function draw() {
        const w = app.screen.width;
        const h = app.screen.height;

        gfx.clear();

        // Wall
        gfx.beginFill(WALL_COLOR);
        gfx.drawRect(0, 0, w, h);
        gfx.endFill();

        // Floor
        gfx.beginFill(FLOOR_COLOR);
        gfx.drawRect(0, h * 0.65, w, h * 0.35);
        gfx.endFill();

        // Judge bench (center, rear)
        gfx.beginFill(BENCH_COLOR, 0.8);
        gfx.drawRoundedRect(w * 0.3, h * 0.08, w * 0.4, h * 0.18, 6);
        gfx.endFill();
        gfx.lineStyle(1, LINE_COLOR, 0.6);
        gfx.drawRoundedRect(w * 0.3, h * 0.08, w * 0.4, h * 0.18, 6);
        gfx.lineStyle(0);

        // Defense podium (left)
        gfx.beginFill(PODIUM_COLOR, 0.7);
        gfx.drawRoundedRect(w * 0.04, h * 0.42, w * 0.18, h * 0.15, 4);
        gfx.endFill();
        gfx.lineStyle(1, LINE_COLOR, 0.5);
        gfx.drawRoundedRect(w * 0.04, h * 0.42, w * 0.18, h * 0.15, 4);
        gfx.lineStyle(0);

        // Prosecution podium (right)
        gfx.beginFill(PODIUM_COLOR, 0.7);
        gfx.drawRoundedRect(w * 0.78, h * 0.42, w * 0.18, h * 0.15, 4);
        gfx.endFill();
        gfx.lineStyle(1, LINE_COLOR, 0.5);
        gfx.drawRoundedRect(w * 0.78, h * 0.42, w * 0.18, h * 0.15, 4);
        gfx.lineStyle(0);

        // Witness stand (right of center)
        gfx.beginFill(PODIUM_COLOR, 0.6);
        gfx.drawRoundedRect(w * 0.6, h * 0.3, w * 0.12, h * 0.12, 4);
        gfx.endFill();
        gfx.lineStyle(1, LINE_COLOR, 0.4);
        gfx.drawRoundedRect(w * 0.6, h * 0.3, w * 0.12, h * 0.12, 4);
        gfx.lineStyle(0);

        // Gallery railing
        gfx.lineStyle(2, LINE_COLOR, 0.35);
        gfx.moveTo(w * 0.02, h * 0.64);
        gfx.lineTo(w * 0.98, h * 0.64);
        gfx.lineStyle(0);

        // Placeholder text
        label.position.set(w / 2, 4);
    }

    draw();
    app.renderer.on('resize', draw);

    return { draw };
}
