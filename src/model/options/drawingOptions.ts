/** Stored positions of drawing endpoints are fractions of the page, including its edges. */
export const drawingFraction = (value: number): number => Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
