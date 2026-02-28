/**
 * Evidence layer — renders evidence cards and the "Present!" cutscene effect.
 *
 * Evidence cards appear as styled rectangles with text.  When evidence is
 * "presented", a brief cutscene animation plays: the card slides to centre,
 * scales up, flashes, then settles back to the evidence tray.
 */

const EVIDENCE_TRAY_ALPHA = 0.85;
const EVIDENCE_CARD_WIDTH = 140;
const EVIDENCE_CARD_HEIGHT = 80;
const EVIDENCE_CARD_GAP = 8;
const EVIDENCE_CARD_BG = 0x1e293b;
const EVIDENCE_CARD_BORDER = 0x475569;
const EVIDENCE_CARD_ACTIVE_BORDER = 0xfbbf24;
const PRESENT_ANIMATION_MS = 900;

/**
 * @param {import('../stage.js').RendererStage} stage
 */
export function initEvidence(stage) {
    const { PIXI, uiLayer, app } = stage;

    const evidenceContainer = new PIXI.Container();
    evidenceContainer.label = 'evidence';
    uiLayer.addChild(evidenceContainer);

    /** @type {Array<{id: string, text: string, card: import('pixi.js').Container}>} */
    const cards = [];

    let presentAnimating = false;

    function layoutCards() {
        const startX = 12;
        const startY = 12;
        cards.forEach((entry, i) => {
            entry.card.position.set(
                startX + i * (EVIDENCE_CARD_WIDTH + EVIDENCE_CARD_GAP),
                startY,
            );
        });
    }

    /**
     * Add an evidence card to the tray.
     *
     * @param {Object} evidence
     * @param {string} evidence.id
     * @param {string} evidence.text
     */
    function addCard(evidence) {
        // Don't add duplicates
        if (cards.some(c => c.id === evidence.id)) return;

        const card = new PIXI.Container();
        card.label = `evidence_${evidence.id}`;

        const bg = new PIXI.Graphics();
        bg.beginFill(EVIDENCE_CARD_BG, EVIDENCE_TRAY_ALPHA);
        bg.lineStyle(2, EVIDENCE_CARD_BORDER, 1);
        bg.drawRoundedRect(0, 0, EVIDENCE_CARD_WIDTH, EVIDENCE_CARD_HEIGHT, 6);
        bg.endFill();
        card.addChild(bg);

        const idLabel = new PIXI.Text({
            text: `#${evidence.id}`,
            style: {
                fill: 0x94a3b8,
                fontSize: 9,
                fontFamily: 'monospace',
            },
        });
        idLabel.position.set(6, 4);
        card.addChild(idLabel);

        const textLabel = new PIXI.Text({
            text: evidence.text.length > 60 ? evidence.text.slice(0, 57) + '…' : evidence.text,
            style: {
                fill: 0xe2e8f0,
                fontSize: 10,
                fontFamily: 'Inter, system-ui, sans-serif',
                wordWrap: true,
                wordWrapWidth: EVIDENCE_CARD_WIDTH - 12,
                lineHeight: 13,
            },
        });
        textLabel.position.set(6, 18);
        card.addChild(textLabel);

        evidenceContainer.addChild(card);
        cards.push({ id: evidence.id, text: evidence.text, card });
        layoutCards();
    }

    /**
     * Remove all evidence cards (e.g. between sessions).
     */
    function clearCards() {
        for (const entry of cards) {
            evidenceContainer.removeChild(entry.card);
            entry.card.destroy({ children: true });
        }
        cards.length = 0;
    }

    /**
     * Play the "Present!" cutscene for a specific evidence card.
     * The card zooms to centre screen, flashes, then returns.
     *
     * @param {string} evidenceId
     * @param {Object} [effectsRef]  Reference to effects module (for flash)
     * @returns {Promise<void>}
     */
    function presentEvidence(evidenceId, effectsRef) {
        if (presentAnimating) return Promise.resolve();

        const entry = cards.find(c => c.id === evidenceId);
        if (!entry) return Promise.resolve();

        presentAnimating = true;
        const card = entry.card;
        const origX = card.position.x;
        const origY = card.position.y;
        const origScaleX = card.scale.x;
        const origScaleY = card.scale.y;

        const centreX = app.screen.width / 2 - EVIDENCE_CARD_WIDTH / 2;
        const centreY = app.screen.height / 2 - EVIDENCE_CARD_HEIGHT / 2;
        const targetScale = 2.2;

        const zoomInMs = PRESENT_ANIMATION_MS * 0.35;
        const holdMs = PRESENT_ANIMATION_MS * 0.3;
        const zoomOutMs = PRESENT_ANIMATION_MS * 0.35;

        return new Promise(resolve => {
            const startTime = performance.now();

            const zoomIn = (timestamp) => {
                const elapsed = timestamp - startTime;
                const t = Math.min(1, elapsed / zoomInMs);
                const eased = t * (2 - t); // ease-out quad

                card.position.set(
                    origX + (centreX - origX) * eased,
                    origY + (centreY - origY) * eased,
                );
                card.scale.set(
                    origScaleX + (targetScale - origScaleX) * eased,
                    origScaleY + (targetScale - origScaleY) * eased,
                );

                if (t < 1) {
                    requestAnimationFrame(zoomIn);
                } else {
                    // Flash at peak
                    if (effectsRef?.flash) {
                        effectsRef.flash({ color: 0xfbbf24, alpha: 0.4, durationMs: 100 });
                    }
                    setTimeout(() => {
                        const returnStart = performance.now();
                        const zoomOut = (ts) => {
                            const el = ts - returnStart;
                            const rt = Math.min(1, el / zoomOutMs);
                            const re = rt * (2 - rt);

                            card.position.set(
                                centreX + (origX - centreX) * re,
                                centreY + (origY - centreY) * re,
                            );
                            card.scale.set(
                                targetScale + (origScaleX - targetScale) * re,
                                targetScale + (origScaleY - targetScale) * re,
                            );

                            if (rt < 1) {
                                requestAnimationFrame(zoomOut);
                            } else {
                                card.position.set(origX, origY);
                                card.scale.set(origScaleX, origScaleY);
                                presentAnimating = false;
                                resolve();
                            }
                        };
                        requestAnimationFrame(zoomOut);
                    }, holdMs);
                }
            };

            requestAnimationFrame(zoomIn);
        });
    }

    /**
     * Get the list of current card IDs.
     */
    function getCardIds() {
        return cards.map(c => c.id);
    }

    return { addCard, clearCards, presentEvidence, getCardIds, layoutCards };
}
