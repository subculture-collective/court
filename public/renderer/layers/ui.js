/**
 * UI layer — renders the on-canvas heads-up display: phase indicator badge,
 * speaker nameplate, and dialogue box with text.
 *
 * These elements mirror the DOM overlay but live inside the PixiJS canvas so
 * they compose with the rest of the scene graph (camera, effects, etc.).
 */

const DIALOGUE_BOX_ALPHA = 0.82;
const DIALOGUE_BOX_COLOR = 0x0e1422;
const DIALOGUE_BOX_RADIUS = 8;
const NAMEPLATE_BG = 0x1a2540;
const NAMEPLATE_RADIUS = 6;

/**
 * @param {import('../stage.js').RendererStage} stage
 */
export function initUI(stage) {
    const { PIXI, uiLayer, app } = stage;

    // -- Dialogue box ---------------------------------------------------------
    const dialogueContainer = new PIXI.Container();
    dialogueContainer.label = 'dialogue';
    uiLayer.addChild(dialogueContainer);

    const dialogueBoxBg = new PIXI.Graphics();
    dialogueContainer.addChild(dialogueBoxBg);

    const speakerText = new PIXI.Text({
        text: '',
        style: {
            fill: 0xa5b4fc,
            fontSize: 13,
            fontFamily: 'Inter, system-ui, sans-serif',
            fontWeight: '600',
        },
    });
    speakerText.position.set(14, 8);
    dialogueContainer.addChild(speakerText);

    const dialogueText = new PIXI.Text({
        text: '',
        style: {
            fill: 0xf8fafc,
            fontSize: 15,
            fontFamily: 'Inter, system-ui, sans-serif',
            wordWrap: true,
            wordWrapWidth: 320,
            lineHeight: 20,
        },
    });
    dialogueText.position.set(14, 28);
    dialogueContainer.addChild(dialogueText);

    // -- Nameplate (above dialogue box) ---------------------------------------
    const nameplateContainer = new PIXI.Container();
    nameplateContainer.label = 'nameplate';
    uiLayer.addChild(nameplateContainer);

    const nameplateBg = new PIXI.Graphics();
    nameplateContainer.addChild(nameplateBg);

    const nameplateText = new PIXI.Text({
        text: '',
        style: {
            fill: 0xd9e6ff,
            fontSize: 12,
            fontFamily: 'Inter, system-ui, sans-serif',
            fontWeight: '600',
        },
    });
    nameplateText.position.set(8, 4);
    nameplateContainer.addChild(nameplateText);

    // -- Phase badge (top-right) ----------------------------------------------
    const phaseContainer = new PIXI.Container();
    phaseContainer.label = 'phaseBadge';
    uiLayer.addChild(phaseContainer);

    const phaseBg = new PIXI.Graphics();
    phaseContainer.addChild(phaseBg);

    const phaseText = new PIXI.Text({
        text: 'phase: idle',
        style: {
            fill: 0x9da2b6,
            fontSize: 11,
            fontFamily: 'monospace',
        },
    });
    phaseText.position.set(8, 4);
    phaseContainer.addChild(phaseText);

    // -- Layout ---------------------------------------------------------------
    function layout() {
        const w = app.screen.width;
        const h = app.screen.height;
        const padding = 10;
        const boxH = 100;
        const boxW = w - padding * 2;

        // Dialogue box at bottom
        dialogueContainer.position.set(padding, h - boxH - padding);
        dialogueBoxBg.clear();
        dialogueBoxBg.beginFill(DIALOGUE_BOX_COLOR, DIALOGUE_BOX_ALPHA);
        dialogueBoxBg.drawRoundedRect(0, 0, boxW, boxH, DIALOGUE_BOX_RADIUS);
        dialogueBoxBg.endFill();
        dialogueText.style.wordWrapWidth = Math.max(200, boxW - 28);

        // Nameplate just above dialogue box
        const npW = Math.min(180, w * 0.25);
        const npH = 24;
        nameplateContainer.position.set(padding, h - boxH - padding - npH - 4);
        nameplateBg.clear();
        nameplateBg.beginFill(NAMEPLATE_BG, 0.9);
        nameplateBg.drawRoundedRect(0, 0, npW, npH, NAMEPLATE_RADIUS);
        nameplateBg.endFill();

        // Phase badge top-right
        const pbW = Math.min(200, w * 0.3);
        const pbH = 22;
        phaseContainer.position.set(w - pbW - padding, padding);
        phaseBg.clear();
        phaseBg.beginFill(0x14141d, 0.85);
        phaseBg.drawRoundedRect(0, 0, pbW, pbH, 4);
        phaseBg.endFill();
    }

    layout();
    app.renderer.on('resize', layout);

    /**
     * Update the UI overlay text.
     *
     * @param {Object} state
     * @param {string}  state.phase            Current phase string
     * @param {string}  state.speakerLabel     "role · name" label
     * @param {string}  state.dialogueContent  Visible dialogue text
     * @param {string}  state.nameplate        Nameplate label text
     */
    function update(state) {
        if (typeof state.phase === 'string') {
            phaseText.text = `phase: ${state.phase}`;
        }
        if (typeof state.speakerLabel === 'string') {
            speakerText.text = state.speakerLabel;
        }
        if (typeof state.dialogueContent === 'string') {
            dialogueText.text = state.dialogueContent;
        }
        if (typeof state.nameplate === 'string') {
            nameplateText.text = state.nameplate;
        }
    }

    return { update, layout, speakerText, dialogueText };
}
