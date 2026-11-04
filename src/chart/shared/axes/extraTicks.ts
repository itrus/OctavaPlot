import type { AxisConfig, ExtraTick } from '../../../model/types';
import { extent } from '../../../model/units';
import { inBreak, onAxis } from './axisScale';
import type { YAxisScale } from './scales';

/** Two values this close (relative to the axis range) are the same tick: the added one only gives the label. */
const SAME = 1e-9;

/**
 * The axis with ticks added at chosen values: they stand among the automatic ticks (and carry a gridline like them), and a label that was
 * typed is written instead of the number. A value outside the axis range, inside a gap of a broken axis or at or below 0 on a log axis has no
 * place and is left out, counted in `skipped` (never moved to the edge). A value that is an automatic tick already keeps that tick and takes the label.
 */
export function withExtraTicks(axis: YAxisScale, extra: readonly ExtraTick[] | undefined): { axis: YAxisScale; skipped: number } {
  if (!extra || extra.length === 0) return { axis, skipped: 0 };
  const [lo, hi] = extent(axis.domain);
  const tolerance = (hi - lo) * SAME;
  const ticks = [...axis.ticks];
  const labels = new Map<number, string>();
  const placed = new Map<number, ExtraTick>();
  let skipped = 0;
  for (const t of extra) {
    if (!onAxis(axis, t.value) || t.value < lo || t.value > hi || inBreak(axis, t.value)) {
      skipped++;
      continue;
    }
    const same = ticks.find((v) => Math.abs(v - t.value) <= tolerance);
    const at = same ?? t.value;
    if (same === undefined) ticks.push(at);
    if (t.label.trim() !== '') labels.set(at, t.label);
    placed.set(at, t);
  }
  ticks.sort((a, b) => a - b);
  const number = axis.tickLabel;
  // A minor tick is never at a major one: the one an added tick lands on gives way.
  const minorTicks = axis.minorTicks?.filter((m) => !ticks.some((v) => Math.abs(v - m) <= tolerance));
  return { axis: { ...axis, ticks, ...(minorTicks ? { minorTicks } : {}), tickLabel: (v) => labels.get(v) ?? number(v), extraTicks: placed }, skipped };
}

/** The axis with the ticks its settings add (see withExtraTicks); a notice goes to `warnings` for the ones that are not drawn. `name` is how the axis is called in it ("X", "Y"). */
export function withExtraTicksNoted(axis: YAxisScale, cfg: Pick<AxisConfig, 'extraTicks'>, name: string, warnings: string[]): YAxisScale {
  const added = withExtraTicks(axis, cfg.extraTicks);
  if (added.skipped > 0) warnings.push(`${added.skipped} extra tick${added.skipped === 1 ? ' is' : 's are'} on the ${name} axis at a value outside its range, in an omitted range or at or below 0 on a log axis, and ${added.skipped === 1 ? 'is' : 'are'} not drawn.`);
  return added.axis;
}
