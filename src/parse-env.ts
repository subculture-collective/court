/**
 * Shared helpers for parsing environment variable values to positive numbers.
 */

export function parsePositiveInt(
    value: string | undefined,
    fallback: number,
): number {
    if (!value) return fallback;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function parsePositiveFloat(
    value: string | undefined,
    fallback: number,
): number {
    if (!value) return fallback;
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
