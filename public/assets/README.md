# Placeholder Assets

This directory holds visual and audio assets for the Ace Attorney–style renderer.

## Directory Layout

```
assets/
├── backgrounds/    Courtroom and scene background images
├── characters/     Per-character pose and face sprites
├── ui/             UI elements (dialogue box frame, nameplate, badges)
├── fonts/          Custom fonts for dialogue and labels
└── sfx/            Sound effects (objection stinger, gavel, blip)
```

## Placeholder-First Policy

Phase 7 work proceeds without final art. Missing assets are handled gracefully:

- **Backgrounds** — coloured gradient with outlined furniture (bench, podiums,
  gallery railing) drawn by `renderer/layers/background.js`.
- **Characters** — labelled rectangles at fixed role positions drawn by
  `renderer/layers/characters.js`. Active speaker gets a highlight tint.
- **UI** — rendered directly in PixiJS; no external sprites needed yet.
- **Fonts** — system fonts used (`Inter`, `monospace`).
- **SFX** — silent / console log stub until audio engine lands (Issue #73).

Drop real assets into subdirectories here and update the respective renderer
layer to load them. The renderer will continue to fall back to placeholders
for any asset that is absent.
