import { leadingColumns } from '../model/chartTypes';
import { rowTitleAt } from '../model/rows';
import { resolveStyle } from '../model/style';
import type { Chart, ChartStyle, DataTable, Id, PieLabelMode } from '../model/types';
import { chartPx2Pt, n2 } from '../model/units';
import { displayName } from './model';
import { measureText } from './text';
import { computeLayout, type Layout, type Rect } from './layout';
import { formatLabelValue } from './labels';

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
  title: string;
  cx: number;
  cy: number;
  r: number;
  /** Radius of the hole (0 for a pie). */
  rInner: number;
  total: number;
  slices: PieSlice[];
  /** Where the title of the pie goes, under it. */
  titleAt: { x: number; y: number };
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
 * and above or below it for its labels, `band` what its title needs under it; the diameter is what is left.
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
  const layer = chart.layers[0];
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
  const legendKeyParts = parts.map((_, i) => i).filter((i) => !chart.legend.hiddenGroupIds.includes(parts[i].g.id));
  const layout = computeLayout({
    fontFamily: chart.fontFamily,
    titleOffsetPt: chart.titleOffsetPt,
    widthPt: W,
    heightPt: H,
    title: chart.showTitle ? { text: chart.title, fontSizePt: chart.titleFontSizePt } : null,
    xAxis: hiddenAxis,
    yAxis: { ...chart.yAxis, visible: false },
    legend: chart.legend,
    legendLabels: legendKeyParts.map((i) => parts[i].label),
    categoryLabels: [],
    yTickLabels: [],
  });
  warnings.push(...layout.warnings);

  const plot: Rect = layout.plot;
  const fontPt = chart.xAxis.tickFontSizePt;
  const labelPt = chart.legend.fontSizePt;
  const titleBand = fontPt * 1.8 + (opts.showTotal ? fontPt * 1.4 : 0);
  // Room for the labels round the pie when they are written outside it: the widest one that can occur, and one line.
  const biggest = Math.max(1, ...shown.flatMap((p) => p.g.observations.map((o) => (o.value !== null && Number.isFinite(o.value) ? o.value : 0))));
  const widest = Math.max(0, ...shown.map((p) => measureText(sliceLabelText(opts.labels, p.label, biggest, 1, opts.percentDigits) ?? '', labelPt, false, false, chart.fontFamily)));
  const roomX = opts.labels === 'none' ? 6 : 8 + widest;
  const roomY = opts.labels === 'none' ? 6 : 8 + labelPt * 1.2;
  const { cols, rows: rowsDown, diameter } = pieGrid(Math.max(1, rows.length), plot.width, plot.height, roomX, roomY, titleBand);
  const cellW = plot.width / cols;
  const cellH = plot.height / rowsDown;
  const r = diameter / 2;
  if (rows.length > 0 && r < 12) warnings.push('The chart is too small for its pies; enlarge the chart, use fewer rows, or switch the labels off.');
  const rInner = chart.type === 'doughnut' ? r * opts.hole : 0;
  const dir = opts.direction === 'clockwise' ? 1 : -1;
  const start = (opts.startAngle * Math.PI) / 180;
  const bad: string[] = [];

  const pies: PieGeom[] = [];
  rows.forEach((row, k) => {
    const col = k % cols;
    const line = Math.floor(k / cols);
    const cx = plot.x + cellW * (col + 0.5);
    const cy = plot.y + cellH * line + (cellH - titleBand) / 2;
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
    const slices: PieSlice[] = shown.map((p, i) => {
      const w = weights[i];
      const fraction = w / total;
      const a0 = angle;
      const a1 = angle + dir * fraction * TWO_PI;
      angle = a1;
      const id = `${p.g.id}:slice:${row}`;
      if (!(w > 0)) return { id, groupId: p.g.id, label: p.label, value: w, fraction, path: '', style: p.style, text: null };
      const mid = (a0 + a1) / 2;
      const content = sliceLabelText(opts.labels, p.label, w, fraction, opts.percentDigits);
      // The text sits outside the circle, on the side of its slice.
      const pt = at(cx, cy, r + 8, mid);
      const text = content === null ? null : { x: pt.x, y: pt.y, anchor: Math.abs(pt.x - cx) < r * 0.2 ? ('middle' as const) : pt.x > cx ? ('start' as const) : ('end' as const), content };
      return { id, groupId: p.g.id, label: p.label, value: w, fraction, path: slicePath(cx, cy, r, rInner, a0, a1), style: p.style, text };
    });
    const totalText = opts.showTotal ? `${opts.totalPrefix}${formatLabelValue(total, null)}` : null;
    pies.push({
      row,
      title,
      cx,
      cy,
      r,
      rInner,
      total,
      slices,
      titleAt: { x: cx, y: cy + r + roomY + fontPt * 0.8 },
      totalText,
      totalInHole: totalText !== null && rInner > 0 && measureText(totalText, fontPt, false, false, chart.fontFamily) <= rInner * 1.7,
    });
  });
  if (bad.length > 0) warnings.push(`Not drawn: ${bad.join('; ')}. A pie needs counts of 0 or more that add up to more than 0.`);
  if (rows.length === 0) warnings.push('Enter counts in the table to see the chart.');

  return {
    widthPt: W,
    heightPt: H,
    layout,
    pies,
    parts: parts.map((p) => ({ groupId: p.g.id, label: p.label, style: p.style })),
    legendParts: legendKeyParts,
    warnings: [...new Set(warnings)],
  };
}
