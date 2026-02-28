import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('public index includes catch-up panel and toggle controls', () => {
    const html = readFileSync(join(process.cwd(), 'public/index.html'), 'utf8');

    assert.match(html, /id="catchupToggle"/);
    assert.match(html, /id="catchupBody"/);
    assert.match(html, /id="catchupSummary"/);
    assert.match(html, /id="catchupMeta"/);
    assert.match(html, /Case so far/i);
});

test('public app wires catch-up toggle telemetry and phase refresh behavior', () => {
    const js = readFileSync(join(process.cwd(), 'public/app.js'), 'utf8');

    assert.match(js, /function\s+setCatchupVisible\(/);
    assert.match(js, /\[telemetry\]\s+catchup_panel_visibility/);
    assert.match(js, /phase_changed\s*:\s*handlePhaseChangedEvent/);
    assert.match(js, /updateCatchupPanel\(activeSession\);/);
});
