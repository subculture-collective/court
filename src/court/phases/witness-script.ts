export interface WitnessScript {
    directRounds: number; // 3–7
    crossRounds: number;  // 2–5
}

export function buildWitnessScripts(witnessCount: number): WitnessScript[] {
    return Array.from({ length: witnessCount }, () => ({
        directRounds: Math.floor(Math.random() * 5) + 3,
        crossRounds: Math.floor(Math.random() * 4) + 2,
    }));
}
