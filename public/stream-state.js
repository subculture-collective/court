export function createStreamState() {
    return {
        seenTurnIds: new Set(),
        recapTurnIds: new Set(),
    };
}

export function resetStreamState(state, snapshot) {
    state.seenTurnIds = new Set(snapshot.turns.map(turn => turn.id));
    state.recapTurnIds = new Set(snapshot.recapTurnIds ?? []);
}

export function shouldAppendTurn(state, turn) {
    if (state.seenTurnIds.has(turn.id)) {
        return false;
    }

    state.seenTurnIds.add(turn.id);
    return true;
}

export function markRecap(state, turnId) {
    state.recapTurnIds.add(turnId);
}

export function isRecapTurn(state, turnId) {
    return state.recapTurnIds.has(turnId);
}
