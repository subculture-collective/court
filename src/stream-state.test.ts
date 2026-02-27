import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createStreamState,
    isRecapTurn,
    markRecap,
    resetStreamState,
    shouldAppendTurn,
} from '../public/stream-state.js';

test('resetStreamState seeds seen turns and recap ids', () => {
    const state = createStreamState();
    resetStreamState(state, {
        turns: [{ id: 'turn-1' }, { id: 'turn-2' }],
        recapTurnIds: ['turn-2'],
    });

    assert.equal(shouldAppendTurn(state, { id: 'turn-1' }), false);
    assert.equal(isRecapTurn(state, 'turn-2'), true);
});

test('shouldAppendTurn prevents duplicates and accepts new turns', () => {
    const state = createStreamState();
    resetStreamState(state, { turns: [], recapTurnIds: [] });

    assert.equal(shouldAppendTurn(state, { id: 'turn-3' }), true);
    assert.equal(shouldAppendTurn(state, { id: 'turn-3' }), false);
});

test('markRecap flags recap turn ids', () => {
    const state = createStreamState();
    resetStreamState(state, { turns: [], recapTurnIds: [] });

    markRecap(state, 'turn-9');
    assert.equal(isRecapTurn(state, 'turn-9'), true);
});
