import { scaleBand } from 'd3';
import { bandPadding } from '../model/columnOptions';
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

/** The columns across `plot`: even spacing from the spacing settings (the same d3 band as ever when nothing is set). */
export function columnLayout(plot: { x: number; width: number }, ids: readonly Id[], bars: BarLayout): ColumnLayout {
  const pad = bandPadding(bars);
  const band = scaleBand<string>().domain([...ids]).range([plot.x, plot.x + plot.width]).paddingInner(pad.inner).paddingOuter(pad.outer).align(pad.align);
  return { x: (id) => band(id), bw: band.bandwidth(), step: band.step() };
}
