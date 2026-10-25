import { numberStartPt } from '../../../model/graph/axis';
import type { AxisConfig } from '../../../model/types';
import { n2 } from '../../../model/units';

/** The side of the plotting region an axis is drawn on. Ticks point outwards: left, up-left... see SIGN. */
type AxisSide = 'left' | 'right' | 'bottom';

/** Direction of "outwards" along the tick's axis: left of the plot is -x, right is +x, below is +y. */
const OUT: Record<AxisSide, number> = { left: -1, right: 1, bottom: 1 };

type TickStyle = Pick<AxisConfig, 'tickDirection' | 'tickLengthPt'>;

/**
 * Path of one tick mark. `pos` is where the tick is along the axis, `base` where the axis line is across it.
 * Major ticks are `tickLengthPt` long and minor ticks half of it; they point out, in, or both ways.
 */
export function tickPath(side: AxisSide, pos: number, base: number, style: TickStyle, minor = false): string {
  if (style.tickDirection === 'none') return '';
  const len = minor ? style.tickLengthPt / 2 : style.tickLengthPt;
  if (!(len > 0)) return '';
  const s = OUT[side];
  const [start, delta] =
    style.tickDirection === 'out' ? [base, s * len] : style.tickDirection === 'in' ? [base, -s * len] : [base - s * len, 2 * s * len];
  return side === 'bottom' ? `M${n2(pos)},${n2(start)}v${delta}` : `M${n2(start)},${n2(pos)}h${delta}`;
}

/** The tick marks of one axis: the major ones, then the minor ones. */
export function tickPaths(side: AxisSide, base: number, style: TickStyle, major: readonly number[], minor: readonly number[], at: (v: number) => number): Array<{ key: string; d: string }> {
  const out: Array<{ key: string; d: string }> = [];
  for (const t of major) out.push({ key: String(t), d: tickPath(side, at(t), base, style) });
  for (const t of minor) out.push({ key: `m${t}`, d: tickPath(side, at(t), base, style, true) });
  return out.filter((p) => p.d !== '' && !p.d.includes('NaN'));
}

/** Room the outward part of the tick takes between the axis line and its labels. */
export const labelOffset = (style: TickStyle & { tickLabelOffsetPt?: number }): number => numberStartPt({ tickLabelOffsetPt: 0, ...style });

/**
 * Where an axis line is drawn: at the value `at` of the other axis (`scale` and `map` are that axis'), or at its
 * low edge (`edge`) when there is no such value, it lies outside the axis, or it has no position (0 on a log axis).
 */
export function crossingPosition(at: number | null, scale: { domain: readonly [number, number]; log?: number | null }, map: (v: number) => number, edge: number): number {
  if (at === null || !Number.isFinite(at)) return edge;
  const lo = Math.min(scale.domain[0], scale.domain[1]);
  const hi = Math.max(scale.domain[0], scale.domain[1]);
  if (at < lo || at > hi || (scale.log && !(at > 0))) return edge;
  const p = map(at);
  return Number.isFinite(p) ? p : edge;
}
