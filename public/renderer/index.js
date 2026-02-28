/**
 * Court Renderer — Ace Attorney–style PixiJS renderer façade.
 *
 * Usage:
 *   import { createCourtRenderer } from './renderer/index.js';
 *
 *   const renderer = await createCourtRenderer(document.getElementById('pixiStage'));
 *   if (renderer) {
 *     renderer.update({ phase, activeSpeakerRole, roleNames, speakerLabel, dialogueContent });
 *     renderer.applyDirective({ camera: 'judge', effect: 'objection', poses: { judge: 'point' } });
 *   }
 *
 * Returns `null` when PixiJS is unavailable — callers should degrade to the
 * existing DOM-only overlay in that case.
 */

import { createStage } from './stage.js';
import { initBackground } from './layers/background.js';
import { initCharacters } from './layers/characters.js';
import { initUI } from './layers/ui.js';
import { initEffects } from './layers/effects.js';
import { initEvidence } from './layers/evidence.js';
import { initCamera } from './camera.js';
import { createDialogueStateMachine } from './dialogue.js';

/**
 * @typedef {Object} RendererState
 * @property {string}              phase              Current court phase
 * @property {string | null}       activeSpeakerRole  Role key of current speaker
 * @property {Record<string, string>} roleNames       role → display name map
 * @property {string}              speakerLabel       "role · name" label
 * @property {string}              dialogueContent    Visible dialogue text
 * @property {string}              nameplate          Nameplate label
 */

/**
 * @typedef {Object} RenderDirective
 * @property {string}  [camera]          Camera preset name
 * @property {string}  [effect]          Effect cue name
 * @property {Object}  [effectOpts]      Effect options
 * @property {Record<string, string>} [poses]  role → pose key
 * @property {Record<string, string>} [faces]  role → face key
 * @property {string}  [evidencePresent] Evidence ID to present
 */

/**
 * @typedef {Object} CourtRenderer
 * @property {(state: Partial<RendererState>) => void} update
 * @property {(directive: RenderDirective) => void} applyDirective
 * @property {() => void} destroy
 * @property {{ speakerText: import('pixi.js').Text, dialogueText: import('pixi.js').Text }} ui
 */

/**
 * Bootstrap the full court renderer and mount it to `host`.
 *
 * @param {HTMLElement} host  DOM element to mount the PixiJS canvas
 * @returns {Promise<CourtRenderer | null>}
 */
export async function createCourtRenderer(host) {
    const stage = await createStage(host);
    if (!stage) {
        return null;
    }

    const background = initBackground(stage);
    const characters = initCharacters(stage);
    const ui = initUI(stage);
    const effects = initEffects(stage);
    const evidence = initEvidence(stage);
    const camera = initCamera(stage);

    // Dialogue state machine drives the canvas text typewriter
    const dialogueSM = createDialogueStateMachine({
        onTextUpdate: (text) => {
            ui.update({ dialogueContent: text });
        },
        onSpeakerUpdate: (speaker) => {
            ui.update({ speakerLabel: speaker });
        },
        onLineComplete: () => {
            // no-op for now — future: auto-advance to next line
        },
    });

    let resizeListenerAttached = false;
    if (!resizeListenerAttached) {
        window.addEventListener(
            'resize',
            () => {
                background.draw();
                characters.layout();
                ui.layout();
                evidence.layoutCards();
            },
            { passive: true },
        );
        resizeListenerAttached = true;
    }

    /**
     * Push the latest session state into every renderer layer.
     *
     * @param {Partial<RendererState>} state
     */
    function update(state) {
        characters.update({
            activeSpeakerRole: state.activeSpeakerRole ?? null,
            roleNames: state.roleNames ?? {},
        });

        ui.update({
            phase: state.phase ?? 'idle',
            speakerLabel: state.speakerLabel ?? '',
            dialogueContent: state.dialogueContent ?? '',
            nameplate: state.nameplate ?? '',
        });
    }

    /**
     * Apply a RenderDirective from the backend.
     * Translates directive fields into renderer subsystem calls.
     *
     * @param {RenderDirective} directive
     */
    function applyDirective(directive) {
        if (!directive) return;

        // Camera transition
        if (directive.camera) {
            camera.transitionTo(directive.camera);
        }

        // Effect cue
        if (directive.effect) {
            const effectName = directive.effect;
            // Composite cues have convenience methods
            if (effectName === 'objection') {
                effects.objection();
            } else if (effectName === 'hold_it') {
                effects.holdIt();
            } else if (effectName === 'take_that') {
                effects.takeThat();
            } else {
                effects.trigger(effectName, directive.effectOpts ?? {});
            }
        }

        // Evidence present cutscene
        if (directive.evidencePresent) {
            evidence.presentEvidence(directive.evidencePresent, effects);
        }
    }

    function destroy() {
        dialogueSM.destroy();
        stage.destroy();
    }

    return {
        update,
        applyDirective,
        destroy,
        ui: {
            speakerText: ui.speakerText,
            dialogueText: ui.dialogueText,
        },
        /** @internal exposed for orchestration */
        effects,
        evidence,
        camera,
        dialogue: dialogueSM,
    };
}
