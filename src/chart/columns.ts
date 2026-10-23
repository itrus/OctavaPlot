import { scaleBand } from 'd3';
import { AUTO_BAR_GAP_PCT, AUTO_BAR_OUTER_PCT, bandPadding } from '../model/columnOptions';
import { GROUP_GAP_LIMITS } from '../model/groupOrder';
import type { BarLayout, Id } from '../model/types';

/** Where the columns of a column chart sit across the plotting region. */
interface ColumnLayout {
  /** Left edge of a column (undefined for an id that is not drawn). */
  x: (id: Id) => number | undefined;
  /** Width of a column. */
  bw: number;
  /** Distance from one column to the next at the normal space between them (the width of a column's slot). */
  step: number;
}

/**
 * The columns across `plot`: even spacing from the spacing settings (the same d3 band as ever when nothing is
 * set), or, when some data set has its own space before it, a layout that gives that data set more or less room.
 * `gapPct` maps a data set id to its space before it as a percentage of the normal space (100 = normal).
 */
export function columnLayout(plot: { x: number; width: number }, ids: readonly Id[], bars: BarLayout, gapPct: Readonly<Record<Id, number>>): ColumnLayout {
  const custom = ids.some((id, i) => i > 0 && (gapPct[id] ?? GROUP_GAP_LIMITS.normal) !== GROUP_GAP_LIMITS.normal);
  if (!custom) {
    const pad = bandPadding(bars);
    const band = scaleBand<string>().domain([...ids]).range([plot.x, plot.x + plot.width]).paddingInner(pad.inner).paddingOuter(pad.outer).align(pad.align);
    return { x: (id) => band(id), bw: band.bandwidth(), step: band.step() };
  }
  const g = (bars.gapPct ?? AUTO_BAR_GAP_PCT) / 100;
  const before = (bars.beforePct ?? AUTO_BAR_OUTER_PCT) / 100;
  const after = (bars.afterPct ?? AUTO_BAR_OUTER_PCT) / 100;
  const gaps = ids.map((id, i) => (i === 0 ? 0 : (g * (gapPct[id] ?? GROUP_GAP_LIMITS.normal)) / 100));
  const units = ids.length + gaps.reduce((a, b) => a + b, 0) + before + after;
  const bw = plot.width / Math.max(units, 1e-9);
  const xs = new Map<Id, number>();
  let cursor = plot.x + before * bw;
  ids.forEach((id, i) => {
    cursor += gaps[i] * bw;
    xs.set(id, cursor);
    cursor += bw;
  });
  return { x: (id) => xs.get(id), bw, step: bw * (1 + g) };
}
