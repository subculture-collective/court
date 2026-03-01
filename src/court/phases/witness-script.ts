export interface WitnessScript {
    directRounds: number; // 3–7
    crossRounds: number;  // 2–5
}

export function buildWitnessScripts(
    witnessCount: number,
    rng: () => number = Math.random,
): WitnessScript[] {
    return Array.from({ length: witnessCount }, () => ({
        directRounds: Math.floor(rng() * 5) + 3,
        crossRounds: Math.floor(rng() * 4) + 2,
    }));
}
