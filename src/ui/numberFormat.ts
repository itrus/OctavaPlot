/**
 * Adaptive number display shared by the numeric controls. The stored value is never rounded to suit the
 * display: this only picks the shortest text that reads back as the same number, after removing binary
 * floating-point noise (0.30000000000000004 shows as 0.3, 2.000 as 2).
 */
export function formatNum(v: number): string {
  if (!Number.isFinite(v)) return String(v);
  return String(Number(v.toPrecision(12)));
}

/**
 * Slider step: 0.1 for ordinary ranges, coarser only where 0.1 would be impractical (ranges over 100 wide).
 * Typed values are not limited to this step.
 */
export function sliderStep(min: number, max: number): number {
  const span = max - min;
  if (!(span > 0)) return 1;
  if (span <= 100) return 0.1;
  if (span <= 1000) return 1;
  return 10;
}

/** Move a slider position onto its step grid without float noise; the value stays whatever the slider reports. */
export function snapToStep(v: number, step: number): number {
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  return Number(v.toFixed(decimals));
}
