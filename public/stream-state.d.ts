export interface StreamState {
    seenTurnIds: Set<string>;
    recapTurnIds: Set<string>;
}

export function createStreamState(): StreamState;

export function resetStreamState(
    state: StreamState,
    snapshot: { turns: Array<{ id: string }>; recapTurnIds?: string[] },
): void;

export function shouldAppendTurn(
    state: StreamState,
    turn: { id: string },
): boolean;

export function markRecap(state: StreamState, turnId: string): void;

export function isRecapTurn(state: StreamState, turnId: string): boolean;
