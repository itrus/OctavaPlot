import { leadingColumns } from '../../model/graph/chartTypes';
import { layersOf, type LayerSpec } from '../../model/graph/layers';
import { rowTitleAt } from '../../model/table/rows';
import { resolveStyle, dataLayer } from '../../model/graph/style';
import { legendEntries } from '../../model/graph/legendEntries';
import type { Chart, ChartStyle, DataTable, Id, PieLabelMode } from '../../model/types';
import { chartPx2Pt, n2 } from '../../model/units';
import { compilePieMarks } from './pieMarks';
import type { SceneElement } from '../shared/scene/sceneElement';
import { measureText } from '../shared/parts/text';
import { chartLayout, type Layout, type Rect } from '../shared/parts/layout';
import { formatLabelValue } from '../shared/parts/labels';
import { displayName } from '../shared/parts/names';

/** The share of a row, in percent, written with `digits` decimals. */
export const percentText = (fraction: number, digits: number): string => `${(fraction * 100).toFixed(digits)}%`;

/** The text a slice says, or null when there is nothing to say. */
export function sliceLabelText(mode: PieLabelMode, name: string, value: number, fraction: number, digits: number): string | null {
  const pct = percentText(fraction, digits);
  const count = formatLabelValue(value, null);
  switch (mode) {
    case 'none':
      return null;
    case 'name':
      return name;
    case 'value':
      return count;
    case 'percent':
      return pct;
    case 'name-percent':
      return `${name} ${pct}`;
    case 'value-percent':
      return `${count} (${pct})`;
  }
}

interface PieSlice {
  id: string;
  /** The cell of the table that holds the count: what names the slice in the drawing, whatever happens to the order of the rows. */
  obsId?: Id;
  groupId: Id;
  label: string;
  value: number;
  /** Share of the pie, 0 to 1 (a share of the weights, never of the rounded figures). */
  fraction: number;
  /** Outline as path data; empty for a part with no weight. */
  path: string;
  style: ChartStyle;
  /** The text beside or on the slice, with where it goes (the middle of the label). */
  text: { x: number; y: number; anchor: 'start' | 'middle' | 'end'; content: string } | null;
}

interface PieGeom {
  row: number;
  /** The ID of the row of the table the pie is of. */
  rowId?: Id;
  title: string;
  cx: number;
  cy: number;
  r: number;
  /** Radius of the hole (0 for a pie). */
  rInner: number;
  total: number;
  slices: PieSlice[];
  /** Where the title of the pie goes, above it (the baseline of its text). */
  titleAt: { x: number; y: number };
  /** Where the total goes when it does not fit in the hole (or the pie has none): under the pie. */
  totalAt: { x: number; y: number };
  totalText: string | null;
  /** The total fits in the hole of a doughnut; otherwise it is written under the pie, like the total of a pie. */
  totalInHole: boolean;
}

export interface PieModel {
  widthPt: number;
  heightPt: number;
  layout: Layout;
  pies: PieGeom[];
  /** The parts (outcomes), in table order: what the legend lists. */
  parts: Array<{ groupId: Id; label: string; style: ChartStyle }>;
  legendParts: number[];
  warnings: string[];
  /** The layers the chart is drawn from, lowest first (see model/graph/layers.ts). */
  layers: LayerSpec[];
  /** The marks of the layers as scene elements, compiled when a drawing, an export or a hit test first asks for them; not enumerable. */
  marks?: SceneElement[];
}

const TWO_PI = Math.PI * 2;

/** A point at angle `a` (radians clockwise from the top) on the circle round (cx, cy). */
const at = (cx: number, cy: number, r: number, a: number) => ({ x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) });

/**
 * Outline of one slice from angle `a0` to `a1` (radians, clockwise from the top; a1 may be below a0 for a pie that
 * runs the other way). A whole circle is drawn as two arcs, since one arc from a point to itself draws nothing.
 */
export function slicePath(cx: number, cy: number, r: number, rInner: number, a0: number, a1: number): string {
  const sweepAngle = a1 - a0;
  const large = Math.abs(sweepAngle) > Math.PI ? 1 : 0;
  const sweep = sweepAngle >= 0 ? 1 : 0;
  const p = (rad: number, a: number) => {
    const q = at(cx, cy, rad, a);
    return `${n2(q.x)},${n2(q.y)}`;
  };
  if (Math.abs(sweepAngle) >= TWO_PI - 1e-9) {
    const top = p(r, a0);
    const bottom = p(r, a0 + Math.PI);
    const ring = `M${top}A${n2(r)},${n2(r)} 0 1 1 ${bottom}A${n2(r)},${n2(r)} 0 1 1 ${top}Z`;
    if (rInner <= 0) return ring;
    const itop = p(rInner, a0);
    const ibottom = p(rInner, a0 + Math.PI);
    return `${ring}M${itop}A${n2(rInner)},${n2(rInner)} 0 1 0 ${ibottom}A${n2(rInner)},${n2(rInner)} 0 1 0 ${itop}Z`;
  }
  if (rInner <= 0) return `M${n2(cx)},${n2(cy)}L${p(r, a0)}A${n2(r)},${n2(r)} 0 ${large} ${sweep} ${p(r, a1)}Z`;
  return `M${p(r, a0)}A${n2(r)},${n2(r)} 0 ${large} ${sweep} ${p(r, a1)}L${p(rInner, a1)}A${n2(rInner)},${n2(rInner)} 0 ${large} ${1 - sweep} ${p(rInner, a0)}Z`;
}

/**
 * How many pies go across and down so that each gets the most room. `roomX` and `roomY` are what a pie needs beside
 * and above or below it for its labels, `band` what its title and total need above and below it; the diameter is what is left.
 */
export function pieGrid(count: number, width: number, height: number, roomX = 0, roomY = 0, band = 0): { cols: number; rows: number; diameter: number } {
  let best = { cols: 1, rows: Math.max(1, count), diameter: -Infinity };
  for (let cols = 1; cols <= Math.max(1, count); cols++) {
    const rows = Math.ceil(count / cols);
    const diameter = Math.min(width / cols - 2 * roomX, height / rows - band - 2 * roomY);
    if (diameter > best.diameter + 1e-9) best = { cols, rows, diameter };
  }
  return { ...best, diameter: Math.max(0, best.diameter) };
}

/**
 * Model of pie and doughnut charts: one pie for each row of a contingency table, the parts being its columns. A row
 * with a negative count, or with no counts at all, is not drawn and is reported; nothing is drawn for a zero total.
 */
export function buildPieModel(chart: Chart, table: DataTable): PieModel {
  const [W, H] = [chartPx2Pt(chart.widthPx), chartPx2Pt(chart.heightPx)];
  const layer = dataLayer(chart);
  const opts = chart.pie;
  const warnings: string[] = [];
  const first = leadingColumns(table.kind);
  const parts = table.groups.slice(first).map((g, i) => ({ g, style: resolveStyle(chart, layer, { id: g.id, paletteIndex: g.paletteIndex ?? i }), label: displayName(chart, g.id, g.name) }));
  const hidden = new Set(chart.hiddenGroupIds);
  const shown = parts.filter((p) => !hidden.has(p.g.id));

  // Rows that hold something: a title or a count.
  const rows: number[] = [];
  for (let r = 0; r < table.rowCount; r++) {
    const hasValue = shown.some((p) => p.g.observations[r]?.value !== null && p.g.observations[r]?.value !== undefined);
    if (rowTitleAt(table, r).trim() !== '' || hasValue) rows.push(r);
  }

  const hiddenAxis = { ...chart.xAxis, visible: false };
  const legendKeyParts = legendEntries(chart.legend, parts.map((p) => p.g.id));
  const layout = chartLayout(chart, W, H, {
    xAxis: hiddenAxis,
    yAxis: { ...chart.yAxis, visible: false },
    legendLabels: legendKeyParts.map((i) => parts[i].label),
    categoryLabels: [],
    yTickLabels: [],
  });
  warnings.push(...layout.warnings);

  const plot: Rect = layout.plot;
  const fontPt = chart.xAxis.tickFontSizePt;
  const labelPt = chart.legend.fontSizePt;
  // The title stands above the pie, the total (when it is not in the hole) under it.
  const titleH = fontPt * 1.8;
  const titleBand = titleH + (opts.showTotal ? fontPt * 1.4 : 0);
  // Room for the labels round the pie when they are written outside it: the widest one that can occur, and one line.
  const biggest = shown.reduce((m, p) => p.g.observations.reduce((mm, o) => (o.value !== null && Number.isFinite(o.value) ? Math.max(mm, o.value) : mm), m), 1);
  const widest = Math.max(0, ...shown.map((p) => measureText(sliceLabelText(opts.labels, p.label, biggest, 1, opts.percentDigits) ?? '', labelPt, false, false, chart.fontFamily)));
  const bars = chart.type === 'slices';
  const dots = chart.type === 'dotGrid';
  // The dots carry no text beside them, and the bars write theirs under each bar: only a circle wants room round it for its labels.
  const roomX = dots || bars || opts.labels === 'none' ? 12 : 16 + widest;
  const roomY = dots || opts.labels === 'none' ? 12 : 16 + labelPt * 1.2;
  // A bar of slices runs across the chart, one under the other; the others are placed in a grid of as many as fit.
  const barLine = bars ? labelPt * 1.4 : 0;
  const { cols, rows: rowsDown, diameter } = bars
    ? { cols: 1, rows: Math.max(1, rows.length), diameter: Math.min(plot.width * 0.92, Math.max(0, plot.height / Math.max(1, rows.length) - titleBand - barLine) * 5) }
    : pieGrid(Math.max(1, rows.length), plot.width, plot.height, roomX, roomY, titleBand);
  const cellW = plot.width / cols;
  const cellH = plot.height / rowsDown;
  const r = diameter / 2;
  // The height of a bar: a fifth of its length, as long as the row has room for it, its title and its labels.
  const barH = bars ? Math.min(diameter / 5, Math.max(0, cellH - titleBand - barLine)) : 0;
  if (rows.length > 0 && (bars ? barH < 8 : r < 12)) warnings.push(bars ? 'The chart is too small for its bars; enlarge the chart or use fewer rows.' : 'The chart is too small for its pies; enlarge the chart, use fewer rows, or switch the labels off.');
  const rInner = chart.type === 'doughnut' ? r * opts.hole : 0;
  const dir = opts.direction === 'clockwise' ? 1 : -1;
  const start = (opts.startAngle * Math.PI) / 180;
  const bad: string[] = [];

  const pies: PieGeom[] = [];
  rows.forEach((row, k) => {
    const col = k % cols;
    const line = Math.floor(k / cols);
    const cx = plot.x + cellW * (col + 0.5);
    const cy = plot.y + cellH * line + titleH + (cellH - titleBand) / 2;
    const title = rowTitleAt(table, row).trim() || `Row ${row + 1}`;
    const raw = shown.map((p) => p.g.observations[row]?.value ?? null);
    if (raw.some((v) => v !== null && (!Number.isFinite(v) || v < 0))) {
      bad.push(`${title}: a count is negative`);
      return;
    }
    const weights = raw.map((v) => v ?? 0);
    const total = weights.reduce((a, b) => a + b, 0);
    if (!(total > 0)) {
      bad.push(`${title}: the counts add up to zero`);
      return;
    }
    let angle = start;
    const dotCounts = dots ? dotAllocation(weights) : [];
    let dotAt = 0;
    let cumulative = 0;
    const slices: PieSlice[] = shown.map((p, i) => {
      const w = weights[i];
      const fraction = w / total;
      const a0 = angle;
      const a1 = angle + dir * fraction * TWO_PI;
      angle = a1;
      const id = `${p.g.id}:slice:${row}`;
      const obsId = p.g.observations[row]?.id;
      if (!(w > 0)) return { id, obsId, groupId: p.g.id, label: p.label, value: w, fraction, path: '', style: p.style, text: null };
      if (bars) {
        // A bar of slices: the segment of the whole bar that is its share, with its text under it (left out where it would not fit).
        const x0 = cx - diameter / 2 + cumulative * diameter;
        cumulative += fraction;
        const width = fraction * diameter;
        const content = sliceLabelText(opts.labels, p.label, w, fraction, opts.percentDigits);
        const text = content !== null && measureText(content, labelPt, false, false, chart.fontFamily) <= width ? { x: x0 + width / 2, y: cy + barH / 2 + labelPt * 1.1, anchor: 'middle' as const, content } : null;
        return { id, obsId, groupId: p.g.id, label: p.label, value: w, fraction, path: `M${n2(x0)},${n2(cy - barH / 2)}H${n2(x0 + width)}V${n2(cy + barH / 2)}H${n2(x0)}Z`, style: p.style, text };
      }
      if (dots) {
        // The 100 dots of a 10 by 10 grid, filled row by row from the top left: this part's dots are the next ones.
        const count = dotCounts[i];
        const from = dotAt;
        dotAt += count;
        return { id, obsId, groupId: p.g.id, label: p.label, value: w, fraction, path: dotsPath(cx, cy, diameter, from, from + count), style: p.style, text: null };
      }
      const mid = (a0 + a1) / 2;
      const content = sliceLabelText(opts.labels, p.label, w, fraction, opts.percentDigits);
      // The text sits outside the circle, on the side of its slice.
      const pt = at(cx, cy, r + 16, mid);
      const text = content === null ? null : { x: pt.x, y: pt.y, anchor: Math.abs(pt.x - cx) < r * 0.2 ? ('middle' as const) : pt.x > cx ? ('start' as const) : ('end' as const), content };
      return { id, obsId, groupId: p.g.id, label: p.label, value: w, fraction, path: slicePath(cx, cy, r, rInner, a0, a1), style: p.style, text };
    });
    const totalText = opts.showTotal ? `${opts.totalPrefix}${formatLabelValue(total, null)}` : null;
    pies.push({
      row,
      rowId: table.rows[row]?.id,
      title,
      cx,
      cy,
      r,
      rInner,
      total,
      slices,
      titleAt: bars ? { x: cx, y: cy - barH / 2 - fontPt * 0.6 } : { x: cx, y: cy - r - roomY - fontPt * 0.4 },
      totalAt: bars ? { x: cx, y: cy + barH / 2 + barLine + fontPt * 1.6 } : { x: cx, y: cy + r + roomY + fontPt * 0.8 },
      totalText,
      totalInHole: totalText !== null && rInner > 0 && measureText(totalText, fontPt, false, false, chart.fontFamily) <= rInner * 1.7,
    });
  });
  if (bad.length > 0) warnings.push(`Not drawn: ${bad.join('; ')}. A pie needs counts of 0 or more that add up to more than 0.`);
  if (rows.length === 0) warnings.push('Enter counts in the table to see the chart.');

  const model: PieModel = {
    widthPt: W,
    heightPt: H,
    layout,
    pies,
    parts: parts.map((p) => ({ groupId: p.g.id, label: p.label, style: p.style })),
    legendParts: legendKeyParts,
    warnings: [...new Set(warnings)],
    layers: layersOf(chart, table),
  };
  let marks: SceneElement[] | undefined;
  Object.defineProperty(model, 'marks', { enumerable: false, configurable: true, get: () => (marks ??= compilePieMarks(chart, model)) });
  return model;
}

/**
 * How many of the 100 dots of a grid each part gets: its share of 100, rounded down, and the dots that are left go to the parts with the
 * largest remainders (the earlier part first on a tie), so that the 100 are always used and a part with a weight is never made smaller
 * by another's rounding. Parts with no weight get none; with no weight at all, none get any.
 */
export function dotAllocation(weights: readonly number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return weights.map(() => 0);
  const exact = weights.map((w) => (w / total) * 100);
  const counts = exact.map(Math.floor);
  let left = 100 - counts.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => ({ i, rest: e - Math.floor(e) })).filter((o) => weights[o.i] > 0).sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (let k = 0; left > 0 && order.length > 0; k = (k + 1) % order.length, left--) counts[order[k].i]++;
  return counts;
}

/** The circles of the dots `from` to `to` (0 to 99, row by row from the top left) of a 10 by 10 grid of the given side centred on (cx, cy), as one path. */
export function dotsPath(cx: number, cy: number, side: number, from: number, to: number): string {
  const pitch = side / 10;
  const radius = pitch * 0.4;
  let d = '';
  for (let k = from; k < to; k++) {
    const x = cx - side / 2 + (k % 10 + 0.5) * pitch;
    const y = cy - side / 2 + (Math.floor(k / 10) + 0.5) * pitch;
    d += `M${n2(x - radius)},${n2(y)}a${n2(radius)},${n2(radius)} 0 1 0 ${n2(2 * radius)},0a${n2(radius)},${n2(radius)} 0 1 0 ${n2(-2 * radius)},0Z`;
  }
  return d;
}
