/**
 * Characters layer — renders labelled placeholder silhouettes for each court
 * role at fixed positions.  The active speaker receives a highlight accent.
 *
 * #71 CharacterDisplay: each slot has overlay containers for pose, face, and
 * per-character effects.  When sprite assets are absent the placeholder
 * rectangle is drawn; when a sprite texture is set, it replaces the rectangle.
 */

/** Default layout positions (proportional to canvas size). */
const ROLE_POSITIONS = {
    judge: { x: 0.5, y: 0.12, w: 0.1, h: 0.16, color: 0xa08040 },
    prosecutor: { x: 0.85, y: 0.38, w: 0.1, h: 0.2, color: 0x7b4040 },
    defense: { x: 0.13, y: 0.38, w: 0.1, h: 0.2, color: 0x405a7b },
    witness_1: { x: 0.64, y: 0.28, w: 0.08, h: 0.14, color: 0x4f6f50 },
    witness_2: { x: 0.56, y: 0.28, w: 0.08, h: 0.14, color: 0x4f6f50 },
    witness_3: { x: 0.72, y: 0.28, w: 0.08, h: 0.14, color: 0x4f6f50 },
    bailiff: { x: 0.36, y: 0.3, w: 0.07, h: 0.14, color: 0x555566 },
};

/** Recognised pose keys — pose sprites are resolved via asset lookup. */
export const POSES = ['idle', 'talk', 'point', 'slam', 'think', 'shock'];

/** Recognised face overlay keys. */
export const FACE_OVERLAYS = ['neutral', 'angry', 'happy', 'surprised', 'sweating'];

const ACTIVE_TINT = 0xffdd44;
const INACTIVE_ALPHA = 0.55;
const ACTIVE_ALPHA = 1.0;

/**
 * @param {import('../stage.js').RendererStage} stage
 */
export function initCharacters(stage) {
    const { PIXI, charactersLayer, app } = stage;

    /**
     * @typedef {Object} CharacterSlotEntry
     * @property {import('pixi.js').Container} container  Root container
     * @property {import('pixi.js').Graphics}  gfx        Placeholder graphic
     * @property {import('pixi.js').Text}      label      Role label
     * @property {import('pixi.js').Text}      nameLabel  Display-name label
     * @property {import('pixi.js').Container} poseLayer  Pose sprite container
     * @property {import('pixi.js').Container} faceLayer  Face overlay container
     * @property {import('pixi.js').Container} fxLayer    Per-character effects
     * @property {typeof ROLE_POSITIONS[string]} slot      Position definition
     * @property {string}                      currentPose   Current pose key
     * @property {string}                      currentFace   Current face key
     * @property {boolean}                     hasSprite     Whether a sprite texture replaced the placeholder
     */

    /** @type {Record<string, CharacterSlotEntry>} */
    const slots = {};

    for (const [role, slot] of Object.entries(ROLE_POSITIONS)) {
        const container = new PIXI.Container();
        container.label = role;

        const gfx = new PIXI.Graphics();
        container.addChild(gfx);

        // Pose sprite layer (sits on top of placeholder rectangle)
        const poseLayer = new PIXI.Container();
        poseLayer.label = `${role}_pose`;
        container.addChild(poseLayer);

        // Face overlay layer (composites on top of pose)
        const faceLayer = new PIXI.Container();
        faceLayer.label = `${role}_face`;
        container.addChild(faceLayer);

        // Per-character effects layer (flash / glow / particles)
        const fxLayer = new PIXI.Container();
        fxLayer.label = `${role}_fx`;
        container.addChild(fxLayer);

        const label = new PIXI.Text({
            text: role.replace(/_/g, ' ').toUpperCase(),
            style: {
                fill: 0xcccccc,
                fontSize: 9,
                fontFamily: 'monospace',
                align: 'center',
            },
        });
        label.anchor.set(0.5, 0);
        container.addChild(label);

        const nameLabel = new PIXI.Text({
            text: '',
            style: {
                fill: 0xeeeeee,
                fontSize: 10,
                fontFamily: 'Inter, system-ui, sans-serif',
                fontWeight: '600',
                align: 'center',
            },
        });
        nameLabel.anchor.set(0.5, 0);
        container.addChild(nameLabel);

        container.alpha = INACTIVE_ALPHA;
        charactersLayer.addChild(container);
        slots[role] = {
            container,
            gfx,
            label,
            nameLabel,
            poseLayer,
            faceLayer,
            fxLayer,
            slot,
            currentPose: 'idle',
            currentFace: 'neutral',
            hasSprite: false,
        };
    }

    function layout() {
        const w = app.screen.width;
        const h = app.screen.height;

        for (const entry of Object.values(slots)) {
            const { container, gfx, label, nameLabel, poseLayer, faceLayer, fxLayer, slot } = entry;
            const sw = slot.w * w;
            const sh = slot.h * h;
            const sx = slot.x * w - sw / 2;
            const sy = slot.y * h;

            // Draw placeholder rectangle only when no sprite has been loaded
            gfx.clear();
            if (!entry.hasSprite) {
                gfx.beginFill(slot.color, 0.6);
                gfx.drawRoundedRect(0, 0, sw, sh, 4);
                gfx.endFill();
                gfx.lineStyle(1, 0x888888, 0.3);
                gfx.drawRoundedRect(0, 0, sw, sh, 4);
                gfx.lineStyle(0);
            }

            container.position.set(sx, sy);
            label.position.set(sw / 2, 2);
            nameLabel.position.set(sw / 2, sh + 2);

            // Size overlay layers to match the slot
            poseLayer.position.set(0, 0);
            faceLayer.position.set(0, 0);
            fxLayer.position.set(0, 0);
        }
    }

    layout();
    app.renderer.on('resize', layout);

    /**
     * Set a pose sprite for a role.  If `texture` is null, the slot falls
     * back to the placeholder rectangle.
     *
     * @param {string}            role    Court role key
     * @param {string}            pose    Pose key (e.g. 'idle', 'talk')
     * @param {import('pixi.js').Texture | null} texture  Texture or null
     */
    function setPoseSprite(role, pose, texture) {
        const entry = slots[role];
        if (!entry) return;
        entry.currentPose = pose;
        entry.poseLayer.removeChildren();

        if (texture) {
            const sprite = new PIXI.Sprite(texture);
            const w = app.screen.width;
            const h = app.screen.height;
            sprite.width = entry.slot.w * w;
            sprite.height = entry.slot.h * h;
            entry.poseLayer.addChild(sprite);
            entry.hasSprite = true;
            entry.gfx.clear(); // hide placeholder
        } else {
            entry.hasSprite = false;
            layout(); // re-draw placeholder
        }
    }

    /**
     * Set a face overlay sprite for a role.
     *
     * @param {string}            role    Court role key
     * @param {string}            face    Face key (e.g. 'neutral', 'angry')
     * @param {import('pixi.js').Texture | null} texture  Texture or null
     */
    function setFaceOverlay(role, face, texture) {
        const entry = slots[role];
        if (!entry) return;
        entry.currentFace = face;
        entry.faceLayer.removeChildren();

        if (texture) {
            const sprite = new PIXI.Sprite(texture);
            // Face overlay is positioned relative to the top of the slot
            const w = app.screen.width;
            sprite.width = entry.slot.w * w * 0.6;
            sprite.height = sprite.width; // square face overlay
            sprite.anchor.set(0.5, 0);
            sprite.position.set((entry.slot.w * w) / 2, 2);
            entry.faceLayer.addChild(sprite);
        }
    }

    /**
     * Flash a colour overlay on a specific character slot for effect emphasis.
     *
     * @param {string} role       Court role key
     * @param {number} color      Hex tint (e.g. 0xff0000 for damage flash)
     * @param {number} durationMs Flash duration in milliseconds
     */
    function flashCharacter(role, color = 0xffffff, durationMs = 120) {
        const entry = slots[role];
        if (!entry) return;

        const flash = new PIXI.Graphics();
        const w = entry.slot.w * app.screen.width;
        const h = entry.slot.h * app.screen.height;
        flash.beginFill(color, 0.45);
        flash.drawRoundedRect(0, 0, w, h, 4);
        flash.endFill();
        entry.fxLayer.addChild(flash);

        setTimeout(() => {
            entry.fxLayer.removeChild(flash);
            flash.destroy();
        }, durationMs);
    }

    /**
     * Update character display state.
     *
     * @param {Object} state
     * @param {string | null}  state.activeSpeakerRole  Currently speaking role key
     * @param {Record<string, string>} state.roleNames  Map of role → display name
     * @param {Record<string, string>} [state.poses]    Map of role → pose key (optional)
     * @param {Record<string, string>} [state.faces]    Map of role → face key (optional)
     */
    function update(state) {
        const { activeSpeakerRole, roleNames } = state;

        for (const [role, entry] of Object.entries(slots)) {
            const isActive = activeSpeakerRole === role;
            entry.container.alpha = isActive ? ACTIVE_ALPHA : INACTIVE_ALPHA;

            if (isActive) {
                entry.gfx.tint = ACTIVE_TINT;
            } else {
                entry.gfx.tint = 0xffffff;
            }

            const name = roleNames?.[role];
            if (typeof name === 'string') {
                entry.nameLabel.text = name;
            }
        }
    }

    /**
     * Get the current slot entries (read-only reference for testing/debug).
     */
    function getSlots() {
        return slots;
    }

    return { update, layout, setPoseSprite, setFaceOverlay, flashCharacter, getSlots };
}
