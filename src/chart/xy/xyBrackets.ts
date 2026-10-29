import type { AxisBinding, Bracket, Id } from '../../model/types';
import { n2 } from '../../model/units';
import { measureText } from '../shared/parts/text';
import { el, type SceneElement } from '../shared/scene/sceneElement';
import { svgId } from '../shared/scene/svgIds';

/**
 * Comparison brackets on an XY chart: a bracket joins two series at one X (the point each has there), as a vertical bar standing to
 * the right of the points, with the label the owner of the figure supplies beside it (a p-value, stars). Nothing is calculated.
 * Pure: the model gives the points; the geometry is made from the placement once the axes are known.
 */

/** What of a series the placement needs: its ID, the Y axis it is on (the left one when absent) and its points in data units. */
interface BracketSeries {
  id: Id;
  axis?: AxisBinding;
  points: ReadonlyArray<{ x: number; y: number }>;
}

export interface PlacedXyBracket {
  bracket: Bracket;
  /** The X where the two series are joined, and the Y of each one's point there. */
  at: number;
  low: number;
  high: number;
  /** 1 for the bracket nearest the points; a bracket that overlaps one of a lower lane at the same X stands one lane further right. */
  lane: number;
  /** The Y axis the two series are on, and so the one `low` and `high` are in the units of. */
  axis: AxisBinding;
}

interface SkippedXyBracket {
  bracket: Bracket;
  reason: string;
}

/** The distance from the points to the first bar, pt, and the gap between lanes beyond the widest label. */
const FIRST_LANE_PT = 10;
const LANE_GAP_PT = 14;
/** The gap between a bar and its label, pt. */
const LABEL_GAP_PT = 6;

/** Whether two X values are the same point of the table (the values are typed, so a tiny difference is a rounding). */
const sameX = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

/**
 * Where each bracket stands, in data units, and which lane it is in. A bracket whose series are not on the graph, that joins a series to
 * itself, on different Y axes (their values are not on one scale), with no X, or with a series that has no point at that X, is skipped with the reason. Brackets at one X whose spans overlap
 * stand in lanes, the shorter nearer the points; brackets on different axes cannot be compared in data units, so they are taken to overlap.
 */
export function placeXyBrackets(brackets: readonly Bracket[], series: readonly BracketSeries[]): { placed: PlacedXyBracket[]; skipped: SkippedXyBracket[] } {
  const skipped: SkippedXyBracket[] = [];
  const placed: PlacedXyBracket[] = [];
  for (const bracket of brackets) {
    const a = series.find((s) => s.id === bracket.from);
    const b = series.find((s) => s.id === bracket.to);
    const at = bracket.at;
    if (!a || !b) skipped.push({ bracket, reason: 'a data set it joins is not on the graph' });
    else if (a === b) skipped.push({ bracket, reason: 'it joins a data set to itself' });
    else if ((a.axis ?? 'primary') !== (b.axis ?? 'primary')) skipped.push({ bracket, reason: 'the two data sets it joins are on different Y axes, so their values cannot be compared on one scale' });
    else if (at === undefined || !Number.isFinite(at)) skipped.push({ bracket, reason: 'it has no X to stand at' });
    else {
      const ya = a.points.find((p) => sameX(p.x, at))?.y;
      const yb = b.points.find((p) => sameX(p.x, at))?.y;
      if (ya === undefined || yb === undefined || !Number.isFinite(ya) || !Number.isFinite(yb)) skipped.push({ bracket, reason: `a data set it joins has no point at X = ${at}` });
      else placed.push({ bracket, at, low: Math.min(ya, yb), high: Math.max(ya, yb), lane: 1, axis: a.axis ?? 'primary' });
    }
  }
  // The shortest first (then the order of the list): a bracket is one lane further than the furthest it overlaps at the same X.
  const order = [...placed].sort((p, q) => p.high - p.low - (q.high - q.low) || placed.indexOf(p) - placed.indexOf(q));
  order.forEach((p, n) => {
    let lane = 0;
    for (let k = 0; k < n; k++) if (sameX(order[k].at, p.at) && (order[k].axis !== p.axis || !(order[k].high < p.low || order[k].low > p.high))) lane = Math.max(lane, order[k].lane);
    p.lane = lane + 1;
  });
  return { placed, skipped };
}

/** How wide the label of a bracket stands on the page, pt. */
const labelWidth = (b: Bracket, fontFamily: string): number => (b.label.trim() === '' ? 0 : measureText(b.label, b.fontSizePt, false, false, fontFamily));

/** The distance of the bar of a lane from its points, pt: a lane is as far as the widest label of the chart and a gap. */
export function laneOffsetPt(lane: number, brackets: readonly Bracket[], fontFamily: string): number {
  const step = Math.max(0, ...brackets.map((b) => labelWidth(b, fontFamily))) + LABEL_GAP_PT + LANE_GAP_PT;
  return FIRST_LANE_PT + (lane - 1) * step;
}

/** How far right of its X a bracket reaches, pt, with its label: the room the X axis has to leave beyond that X. */
export function reachRightPt(p: PlacedXyBracket, brackets: readonly Bracket[], fontFamily: string): number {
  return laneOffsetPt(p.lane, brackets, fontFamily) + LABEL_GAP_PT + labelWidth(p.bracket, fontFamily) + 4;
}

/** One bracket on the page: the X of its bar, and the page Y of its two ends. */
export interface XyBracketGeom {
  id: Id;
  label: string;
  x: number;
  y1: number;
  y2: number;
  /** How far the two ends reach back toward the points. */
  tick: number;
  color: string;
  widthPt: number;
  fontSizePt: number;
}

/** The brackets as scene elements: a bar with a short stem at each end pointing back to the points, and the label beside the middle of it. Clipped to the plot; none for a bracket whose layer is hidden. */
export function xyBracketElements(brackets: readonly XyBracketGeom[], hidden: ReadonlySet<string>): SceneElement[] {
  const shown = brackets.filter((b) => !hidden.has(`${b.id}:bracket`));
  if (shown.length === 0) return [];
  const bars = shown.map((b) =>
    el('path', [['d', `M${n2(b.x - b.tick)},${n2(b.y1)}H${n2(b.x)}V${n2(b.y2)}H${n2(b.x - b.tick)}`], ['fill', 'none'], ['stroke', b.color], ['stroke-width', b.widthPt], ['stroke-linecap', 'butt'], ['stroke-linejoin', 'miter']], { id: svgId(`${b.id}:bracket`, 'bar') }),
  );
  const labels = shown
    .filter((b) => b.label.trim() !== '')
    .map((b) => el('text', [['x', n2(b.x + LABEL_GAP_PT)], ['y', n2((b.y1 + b.y2) / 2)], ['dy', '0.35em'], ['text-anchor', 'start'], ['font-size', b.fontSizePt], ['fill', b.color]], { id: svgId(`${b.id}:bracket`, 'label'), text: b.label }));
  return [el('g', [['clip-path', 'url(#plot-clip)']], { children: [...bars, ...labels] })];
}
