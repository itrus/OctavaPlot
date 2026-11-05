import { clamp, hex, oneOf, record } from '../sanitize';
import { newId } from '../ids';
import type { Id, ReferenceLine, VolcanoOptions } from '../types';

/** Settings of a volcano plot: X is a log2 fold change, Y a p-value (or its -log10); a point is up or down when both thresholds are passed. */

export const VOLCANO_LIMITS = { fcThreshold: { min: 0, max: 20 }, pThreshold: { min: 1e-300, max: 1 } } as const;

const INPUTS: ReadonlyArray<VolcanoOptions['yInput']> = ['p', 'neglog10'];
const LABELS: ReadonlyArray<VolcanoOptions['labels']> = ['none', 'significant'];

export const DEFAULT_VOLCANO: VolcanoOptions = {
  yInput: 'p',
  fcThreshold: 1,
  pThreshold: 0.05,
  upColor: '#d62728',
  downColor: '#1f77b4',
  nsColor: '#9e9e9e',
  labels: 'none',
  lineIds: [],
};

/** The value of the Y axis of the p threshold: −log10 of it. */
export const pLine = (pThreshold: number): number => -Math.log10(pThreshold);

/** Volcano settings from a file or a patch: a value that is not valid falls back to the one in `base`. */
export function sanitizeVolcano(raw: unknown, base: VolcanoOptions): VolcanoOptions {
  const v = record(raw);
  const { fcThreshold, pThreshold } = VOLCANO_LIMITS;
  return {
    yInput: oneOf(INPUTS, v.yInput, base.yInput),
    fcThreshold: clamp(v.fcThreshold, fcThreshold.min, fcThreshold.max, base.fcThreshold),
    pThreshold: clamp(v.pThreshold, pThreshold.min, pThreshold.max, base.pThreshold),
    upColor: hex(v.upColor, base.upColor),
    downColor: hex(v.downColor, base.downColor),
    nsColor: hex(v.nsColor, base.nsColor),
    labels: oneOf(LABELS, v.labels, base.labels),
    lineIds: Array.isArray(v.lineIds) ? [...new Set(v.lineIds.filter((id): id is Id => typeof id === 'string'))].slice(0, 3) : base.lineIds,
  };
}

/** What a point of a volcano plot is, from its fold change (X) and the Y of the plot (−log10 p). */
export function volcanoClass(o: Pick<VolcanoOptions, 'fcThreshold' | 'pThreshold'>, x: number, negLog10P: number): 'up' | 'down' | 'ns' {
  if (negLog10P <= pLine(o.pThreshold) || Math.abs(x) < o.fcThreshold) return 'ns';
  return x > 0 ? 'up' : 'down';
}

/** The Y of the plot for a value of the Y column; null for a p-value outside (0, 1] or a value that is not a number. */
export function volcanoY(o: Pick<VolcanoOptions, 'yInput'>, y: number): number | null {
  if (!Number.isFinite(y)) return null;
  if (o.yInput === 'neglog10') return y;
  return y > 0 && y <= 1 ? -Math.log10(y) : null;
}

const LINE = { widthPt: 2, style: 'dashed' as const, opacity: 1, label: '', showLabel: false, color: '#000000' };

/** A new volcano plot's thresholds as reference lines: the two fold lines and the p line, noted in `volcano.lineIds` so that they follow the thresholds. */
export function withVolcanoLines<C extends { volcano: VolcanoOptions; referenceLines: ReferenceLine[]; legend: { visible: boolean } }>(chart: C): C {
  const o = chart.volcano;
  const lines: ReferenceLine[] = [
    { id: newId('ref'), axis: 'x', value: -o.fcThreshold, ...LINE },
    { id: newId('ref'), axis: 'x', value: o.fcThreshold, ...LINE },
    { id: newId('ref'), axis: 'y', value: pLine(o.pThreshold), ...LINE },
  ];
  // The one series is told by the colours of its points, so no legend to begin with.
  return { ...chart, legend: { ...chart.legend, visible: false }, referenceLines: [...chart.referenceLines, ...lines], volcano: { ...o, lineIds: lines.map((l) => l.id) } };
}

/** The lines of the thresholds moved to new thresholds: only those that still exist, and only the ones that follow a changed threshold. */
export function followThresholds(lines: readonly ReferenceLine[], o: VolcanoOptions): ReferenceLine[] {
  const [left, right, p] = o.lineIds;
  return lines.map((l) => (l.id === left ? { ...l, value: -o.fcThreshold } : l.id === right ? { ...l, value: o.fcThreshold } : l.id === p ? { ...l, value: pLine(o.pThreshold) } : l));
}
