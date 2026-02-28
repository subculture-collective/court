import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

test('public index includes pixi stage and dialogue skip controls', () => {
    const html = readFileSync(join(process.cwd(), 'public/index.html'), 'utf8');

    assert.match(html, /id="pixiStage"/);
    assert.match(html, /id="captionSkipBtn"/);
    assert.match(html, /id="captionTypewriterToggle"/);
    assert.match(html, /id="captionSkipAll"/);
});

test('public app wires fixture replay mode and typewriter helpers', () => {
    const js = readFileSync(join(process.cwd(), 'public/app.js'), 'utf8');

    assert.match(js, /replayFixture/);
    assert.match(js, /function\s+bootstrapCourtRenderer\(/);
    assert.match(js, /createCourtRenderer/);
    assert.match(js, /function\s+startDialogueTypewriter\(/);
    assert.match(js, /function\s+skipDialogueTypewriter\(/);
    assert.match(js, /function\s+replayFixtureSession\(/);
    assert.match(js, /dispatchStreamPayload\(/);
    assert.match(js, /syncRendererState\(/);
});

test('renderer scaffold modules exist with expected exports', () => {
    const rendererDir = join(process.cwd(), 'public/renderer');

    const expectedFiles = [
        'index.js',
        'stage.js',
        'pixi-runtime.js',
        'dialogue.js',
        'camera.js',
        'layers/background.js',
        'layers/characters.js',
        'layers/ui.js',
        'layers/effects.js',
        'layers/evidence.js',
    ];

    for (const file of expectedFiles) {
        assert.ok(
            existsSync(join(rendererDir, file)),
            `Missing renderer file: renderer/${file}`,
        );
    }

    const indexJs = readFileSync(join(rendererDir, 'index.js'), 'utf8');
    assert.match(indexJs, /export\s+(async\s+)?function\s+createCourtRenderer/);
    assert.match(indexJs, /createStage/);
    assert.match(indexJs, /initBackground/);
    assert.match(indexJs, /initCharacters/);
    assert.match(indexJs, /initUI/);
    assert.match(indexJs, /initEffects/);
    assert.match(indexJs, /initEvidence/);
    assert.match(indexJs, /initCamera/);
    assert.match(indexJs, /createDialogueStateMachine/);
    assert.match(indexJs, /applyDirective/);

    const stageJs = readFileSync(join(rendererDir, 'stage.js'), 'utf8');
    assert.match(stageJs, /export\s+(async\s+)?function\s+createStage/);
    assert.match(stageJs, /backgroundLayer/);
    assert.match(stageJs, /charactersLayer/);
    assert.match(stageJs, /uiLayer/);
    assert.match(stageJs, /effectsLayer/);
});

test('Phase 7 renderer modules have expected exports and structure', () => {
    const rendererDir = join(process.cwd(), 'public/renderer');

    // Dialogue state machine
    const dialogueJs = readFileSync(join(rendererDir, 'dialogue.js'), 'utf8');
    assert.match(dialogueJs, /export\s+function\s+createDialogueStateMachine/);
    assert.match(dialogueJs, /PUNCTUATION_PAUSES/);
    assert.match(dialogueJs, /setLine/);
    assert.match(dialogueJs, /skip\b/);
    assert.match(dialogueJs, /setSkipAll/);

    // Camera controller
    const cameraJs = readFileSync(join(rendererDir, 'camera.js'), 'utf8');
    assert.match(cameraJs, /export\s+.*CAMERA_PRESETS/);
    assert.match(cameraJs, /export\s+function\s+initCamera/);
    assert.match(cameraJs, /snapTo/);
    assert.match(cameraJs, /transitionTo/);
    assert.match(cameraJs, /wide/);
    assert.match(cameraJs, /judge/);
    assert.match(cameraJs, /prosecution/);
    assert.match(cameraJs, /defense/);

    // Effects engine
    const effectsJs = readFileSync(join(rendererDir, 'layers/effects.js'), 'utf8');
    assert.match(effectsJs, /export\s+function\s+initEffects/);
    assert.match(effectsJs, /function\s+flash/);
    assert.match(effectsJs, /function\s+shake/);
    assert.match(effectsJs, /function\s+freeze/);
    assert.match(effectsJs, /function\s+stamp/);
    assert.match(effectsJs, /function\s+objection/);
    assert.match(effectsJs, /function\s+holdIt/);
    assert.match(effectsJs, /function\s+takeThat/);

    // Characters layer (enhanced)
    const charsJs = readFileSync(join(rendererDir, 'layers/characters.js'), 'utf8');
    assert.match(charsJs, /export\s+.*POSES/);
    assert.match(charsJs, /export\s+.*FACE_OVERLAYS/);
    assert.match(charsJs, /poseLayer/);
    assert.match(charsJs, /faceLayer/);
    assert.match(charsJs, /fxLayer/);
    assert.match(charsJs, /setPoseSprite/);
    assert.match(charsJs, /setFaceOverlay/);
    assert.match(charsJs, /flashCharacter/);

    // Evidence layer
    const evidenceJs = readFileSync(join(rendererDir, 'layers/evidence.js'), 'utf8');
    assert.match(evidenceJs, /export\s+function\s+initEvidence/);
    assert.match(evidenceJs, /addCard/);
    assert.match(evidenceJs, /clearCards/);
    assert.match(evidenceJs, /presentEvidence/);
});

test('app.js handles render_directive and evidence_revealed events', () => {
    const js = readFileSync(join(process.cwd(), 'public/app.js'), 'utf8');

    assert.match(js, /handleRenderDirectiveEvent/);
    assert.match(js, /handleEvidenceRevealedEvent/);
    assert.match(js, /render_directive.*handleRenderDirectiveEvent/);
    assert.match(js, /evidence_revealed.*handleEvidenceRevealedEvent/);
    assert.match(js, /applyDirective/);
});

test('placeholder asset directory structure exists', () => {
    const assetsDir = join(process.cwd(), 'public/assets');
    const subdirs = ['backgrounds', 'characters', 'ui', 'fonts', 'sfx'];

    for (const dir of subdirs) {
        assert.ok(
            existsSync(join(assetsDir, dir)),
            `Missing asset directory: assets/${dir}`,
        );
    }
});
