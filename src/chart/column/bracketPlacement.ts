import type { Bracket, Id } from '../../model/types';

/**
 * Comparison brackets: where each one stands, in data units. A bracket joins two data sets (by ID) and says what the owner of the
 * figure supplied about them (a p-value, stars): nothing here calculates a test. It stands above the highest thing either data set
 * draws, and above any bracket it overlaps, so that brackets stack instead of crossing; the room for its label is above the line.
 * Pure: the model gives the tops, the axis kind and the length of the axis, and the chart makes the geometry from the result.
 */

/**
 * The gap between two bracket lines, in pt: the height of a label of that size, and room for the line and a margin. It is the same for
 * all the brackets of a chart (the largest label asks for it), so that the lines stand at even steps.
 */
const stepPtFor = (brackets: readonly Bracket[]): number => {
  const labelled = brackets.filter((b) => b.label.trim() !== '');
  return labelled.length > 0 ? Math.max(...labelled.map((b) => b.fontSizePt)) * 0.9 + 12 : 12;
};

/** The axis limits are rounded to ticks, so the plot shows a little more than the data and the brackets: a step is measured against a range this much larger. */
const RANGE_MARGIN = 1.1;

/** The plot never gives the brackets more than this share of its length to turn a step into data units (a guard against a tiny plot). */
const MIN_FREE_SHARE = 0.2;

interface PlacedBracket {
  bracket: Bracket;
  /** Positions of the two data sets among the data sets drawn, from the lower to the higher. */
  i: number;
  j: number;
  /** Where the line stands, in data units. */
  value: number;
  /** The top of its label: what the axis has to show for the bracket to be seen. */
  top: number;
}

interface SkippedBracket {
  bracket: Bracket;
  reason: string;
}

interface PlacementInput {
  brackets: readonly Bracket[];
  /** The IDs of the data sets drawn, in the order they stand across the chart. */
  order: readonly Id[];
  /** The highest value each data set asks the axis to show (a bar, an error bar end, a dot, a whisker); null when it has none. */
  tops: ReadonlyArray<number | null>;
  /** Whether each data set stands against the left axis (the only one brackets use). */
  primary: readonly boolean[];
  /** The value axis is a log axis: the gap is a factor, not a distance. */
  log: boolean;
  /** Every value the axis already shows: the gap is measured against their range. */
  values: readonly number[];
  /** The axis will include 0 (a chart of bars): the range the plot shows starts there, not at the lowest value. */
  includeZero: boolean;
  /** About how long the value axis will be on the page, pt (the plot is not laid out yet; an estimate is enough to keep the labels clear). */
  plotLengthPt: number;
}

export function placeBrackets({ brackets, order, tops, primary, log, values, includeZero, plotLengthPt }: PlacementInput): { placed: PlacedBracket[]; skipped: SkippedBracket[] } {
  const skipped: SkippedBracket[] = [];
  const candidates: Array<{ bracket: Bracket; i: number; j: number; base: number; index: number; depth: number }> = [];
  brackets.forEach((bracket, index) => {
    const a = order.indexOf(bracket.from);
    const b = order.indexOf(bracket.to);
    if (a < 0 || b < 0) return void skipped.push({ bracket, reason: 'a data set it joins is not on the graph' });
    if (a === b) return void skipped.push({ bracket, reason: 'it joins a data set to itself' });
    const [i, j] = a < b ? [a, b] : [b, a];
    if (!primary[i] || !primary[j]) return void skipped.push({ bracket, reason: 'a data set it joins is on the right axis' });
    const span = tops.slice(i, j + 1).filter((v): v is number => v !== null && Number.isFinite(v) && (!log || v > 0));
    if (span.length === 0) return void skipped.push({ bracket, reason: 'the data sets it joins have no values to stand above' });
    candidates.push({ bracket, i, j, base: Math.max(...span), index, depth: 0 });
  });

  // The shortest first, then in the order of the list, so that a bracket joining neighbours stands under one that spans them, and
  // the picture does not depend on the order the brackets were added in beyond that.
  candidates.sort((x, y) => x.j - x.i - (y.j - y.i) || x.index - y.index);
  // How many brackets are stacked at most (a bracket is one deeper than the deepest it overlaps): the room the stack needs.
  let depth = 0;
  candidates.forEach((c, n) => {
    let d = 0;
    for (let k = 0; k < n; k++) if (!(candidates[k].j < c.i || candidates[k].i > c.j)) d = Math.max(d, candidates[k].depth);
    c.depth = d + 1;
    depth = Math.max(depth, c.depth);
  });

  // The gap, in data units. Its length in pt is fixed (a label is so tall); the plot shows the data and `depth + 1` such gaps (the stack
  // and the room for the top label), so one gap is a step of the range of the data over what is left of the plot: R * s / (P - (depth + 1) * s).
  const finite = values.filter((v) => Number.isFinite(v) && (!log || v > 0));
  const stepPt = stepPtFor(brackets);
  const free = Math.max(plotLengthPt * MIN_FREE_SHARE, plotLengthPt - (depth + 1) * stepPt);
  let above: (v: number) => number;
  if (log) {
    const decades = finite.length > 0 ? Math.max(Math.log10(Math.max(...finite) / Math.min(...finite)), 0.3) : 1;
    const factor = 10 ** ((decades * stepPt) / free);
    above = (v) => v * factor;
  } else {
    const low = finite.length > 0 ? Math.min(...finite, ...(includeZero ? [0] : [])) : 0;
    const high = finite.length > 0 ? Math.max(...finite, ...(includeZero ? [0] : [])) : 0;
    // The limits of the axis are rounded outward, so the plot shows a little more than the range: a margin keeps the labels clear.
    const range = high - low;
    const step = ((range > 0 ? range : Math.abs(high) || 1) * RANGE_MARGIN * stepPt) / free;
    above = (v) => v + step;
  }

  const placed: PlacedBracket[] = [];
  for (const c of candidates) {
    let base = c.base;
    for (const p of placed) if (!(p.j < c.i || p.i > c.j)) base = Math.max(base, p.value);
    const value = above(base);
    placed.push({ bracket: c.bracket, i: c.i, j: c.j, value, top: above(value) });
  }
  // Back in the order of the list, as the layers are.
  placed.sort((x, y) => brackets.indexOf(x.bracket) - brackets.indexOf(y.bracket));
  return { placed, skipped };
}
