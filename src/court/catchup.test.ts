import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildCaseSoFarSummary,
    buildCatchupView,
    juryStepFromPhase,
} from './catchup.js';
import type { CourtTurn } from '../types.js';

function makeTurn(input: Partial<CourtTurn> & { id: string; dialogue: string }): CourtTurn {
    return {
        id: input.id,
        sessionId: input.sessionId ?? 'sess-1',
        turnNumber: input.turnNumber ?? 0,
        speaker: input.speaker ?? 'phoenix',
        role: input.role ?? 'judge',
        phase: input.phase ?? 'openings',
        dialogue: input.dialogue,
        createdAt: input.createdAt ?? new Date().toISOString(),
    };
}

test('buildCaseSoFarSummary prefers latest recap turn', () => {
    const turns = [
        makeTurn({ id: 't1', dialogue: 'Opening statement one.' }),
        makeTurn({ id: 't2', dialogue: 'Recap: Key point from testimony.' }),
        makeTurn({ id: 't3', dialogue: 'Cross examination detail.' }),
    ];

    const summary = buildCaseSoFarSummary(turns, ['t2']);
    assert.equal(summary, 'Recap: Key point from testimony.');
});

test('buildCaseSoFarSummary falls back to recent stitched turns', () => {
    const turns = [
        makeTurn({ id: 't1', speaker: 'phoenix', dialogue: 'Opening one.' }),
        makeTurn({ id: 't2', speaker: 'edgeworth', dialogue: 'Counterpoint two.' }),
        makeTurn({ id: 't3', speaker: 'maya', dialogue: 'Witness detail three.' }),
    ];

    const summary = buildCaseSoFarSummary(turns, []);
    assert.match(summary, /phoenix: Opening one\./);
    assert.match(summary, /edgeworth: Counterpoint two\./);
    assert.match(summary, /maya: Witness detail three\./);
});

test('buildCaseSoFarSummary truncates and appends ellipsis when dialogue exceeds maxChars', () => {
    const longDialogue = 'A'.repeat(250);
    const turns = [makeTurn({ id: 't1', dialogue: longDialogue })];

    const summary = buildCaseSoFarSummary(turns, ['t1']);
    assert.ok(summary.endsWith('…'), 'summary should end with ellipsis');
    assert.ok(summary.length <= 220, `summary length ${summary.length} should not exceed maxChars (220)`);
});

test('juryStepFromPhase maps vote phases to jury-live status', () => {
    assert.equal(juryStepFromPhase('verdict_vote'), 'Jury voting — verdict poll is live');
    assert.equal(juryStepFromPhase('sentence_vote'), 'Jury voting — sentence poll is live');
});

test('juryStepFromPhase returns correct label for every CourtPhase', () => {
    assert.equal(juryStepFromPhase('case_prompt'), 'Jury pending — court intro in progress');
    assert.equal(juryStepFromPhase('openings'), 'Jury listening — opening statements');
    assert.equal(juryStepFromPhase('witness_exam'), 'Jury observing witness examination');
    assert.equal(juryStepFromPhase('evidence_reveal'), 'Jury reviewing evidence reveal');
    assert.equal(juryStepFromPhase('closings'), 'Jury preparing for verdict vote');
    assert.equal(juryStepFromPhase('verdict_vote'), 'Jury voting — verdict poll is live');
    assert.equal(juryStepFromPhase('sentence_vote'), 'Jury voting — sentence poll is live');
    assert.equal(juryStepFromPhase('final_ruling'), 'Jury complete — ruling delivered');
});

test('buildCatchupView refreshes jury status when phase changes', () => {
    const turns = [
        makeTurn({ id: 't1', phase: 'witness_exam', dialogue: 'Witness statement.' }),
    ];

    const before = buildCatchupView({
        phase: 'witness_exam',
        turns,
        recapTurnIds: [],
    });
    const after = buildCatchupView({
        phase: 'verdict_vote',
        turns,
        recapTurnIds: [],
    });

    assert.equal(before.phaseLabel, 'witness_exam');
    assert.equal(after.phaseLabel, 'verdict_vote');
    assert.notEqual(before.juryStepStatus, after.juryStepStatus);
    assert.equal(after.juryStepStatus, 'Jury voting — verdict poll is live');
});
