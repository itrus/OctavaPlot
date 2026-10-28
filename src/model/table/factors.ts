import type { ChartType, Group } from '../types';

/**
 * Factors: a second grouping level inside each category of a grouped table. A series can name its factor (`Group.factor`, set on
 * the first column of the series, as `seriesSlot` is); the series that share a factor are drawn together, as a cluster, with a wider
 * gap between clusters, and the factor is written under them. A label only: it changes no value or calculation. Series that name
 * none form a cluster of their own, with no name, and a table where no series names a factor is drawn as it always was.
 */

/** What of a series this module needs: its columns (the first one holds the factor). */
interface SeriesLike {
  columns: ReadonlyArray<Pick<Group, 'factor'>>;
}

/** The chart types that draw their series side by side inside a category, and so can cluster them by factor. */
export const usesFactors = (type: ChartType): boolean => type === 'groupedBar' || type === 'groupedFloating' || type === 'groupedBox' || type === 'groupedViolin';

/** The gap between two clusters, in bar widths. */
export const FACTOR_GAP = 0.6;

/** The factor a series names, trimmed; empty when it names none. */
const seriesFactor = (s: SeriesLike): string => (s.columns[0]?.factor ?? '').trim();

interface FactorCluster {
  factor: string;
  /** Index into the series of each series of the cluster, in table order. */
  series: number[];
  /** Place of the first bar of the cluster, in bar widths from the left end of the cluster of bars of a category. */
  start: number;
}

export interface FactorLayout {
  clusters: FactorCluster[];
  /** Place of the bar of each series (left edge), in bar widths from the left end of a category's bars. */
  slot: number[];
  /** Place of each series inside its cluster (0 for the first): what its colour follows. */
  position: number[];
  /** The width of all the bars of a category with the gaps, in bar widths. */
  units: number;
}

/** True when any series of the list names a factor. */
export const hasFactors = (series: ReadonlyArray<SeriesLike>): boolean => series.some((s) => seriesFactor(s) !== '');

/**
 * The clusters of a list of series, in order of the first series that names each factor; null when none names one (the layout is then
 * the plain one: one bar after another). The series of a cluster are drawn side by side in table order, whatever lies between them in the table.
 */
export function factorLayout(series: ReadonlyArray<SeriesLike>): FactorLayout | null {
  if (!hasFactors(series)) return null;
  const order: string[] = [];
  for (const s of series) {
    const f = seriesFactor(s);
    if (!order.includes(f)) order.push(f);
  }
  const slot = new Array<number>(series.length).fill(0);
  const position = new Array<number>(series.length).fill(0);
  let at = 0;
  const clusters = order.map((factor, ci): FactorCluster => {
    const members = series.flatMap((s, i) => (seriesFactor(s) === factor ? [i] : []));
    const start = at + FACTOR_GAP * ci;
    members.forEach((i, k) => {
      slot[i] = start + k;
      position[i] = k;
    });
    at += members.length;
    return { factor, series: members, start };
  });
  return { clusters, slot, position, units: series.length + FACTOR_GAP * (clusters.length - 1) };
}

/**
 * The palette slot of a series: its place inside its cluster when the chart clusters its series by factor (so a series keeps the colour
 * of its place in every cluster), else where it sat in its table. `firstColumns` are the first columns of the series, in order.
 */
export function seriesPaletteIndex(type: ChartType, firstColumns: ReadonlyArray<Pick<Group, 'factor' | 'seriesSlot'>>, i: number): number {
  const layout = usesFactors(type) ? factorLayout(firstColumns.map((c) => ({ columns: [c] }))) : null;
  return layout ? layout.position[i] : (firstColumns[i]?.seriesSlot ?? i);
}
