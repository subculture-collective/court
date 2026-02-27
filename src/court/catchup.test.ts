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
        speaker: input.speaker ?? 'chora',
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
        makeTurn({ id: 't1', speaker: 'chora', dialogue: 'Opening one.' }),
        makeTurn({ id: 't2', speaker: 'subrosa', dialogue: 'Counterpoint two.' }),
        makeTurn({ id: 't3', speaker: 'thaum', dialogue: 'Witness detail three.' }),
    ];

    const summary = buildCaseSoFarSummary(turns, []);
    assert.match(summary, /chora: Opening one\./);
    assert.match(summary, /subrosa: Counterpoint two\./);
    assert.match(summary, /thaum: Witness detail three\./);
});

test('juryStepFromPhase maps vote phases to jury-live status', () => {
    assert.equal(juryStepFromPhase('verdict_vote'), 'Jury voting — verdict poll is live');
    assert.equal(juryStepFromPhase('sentence_vote'), 'Jury voting — sentence poll is live');
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
