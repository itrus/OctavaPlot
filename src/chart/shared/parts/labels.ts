import type { Chart, ChartStyle, ChartType, PointLabelCollision, PointLabelPlacement, PointLabelSource } from '../model/types';
import { measureText } from './text';

/** Point-label constants (P: spec 23 L1539 leaves label behaviour unspecified). */
const LABEL_BOUNDS_INSET_PT = 4;
const LABEL_LINE_HEIGHT = 1.2;
const LABEL_BASELINE = 0.9;
const LABEL_EPS = 1e-6;
const REPEL_MAX_RING = 6;
const LEADER_MIN_GAP_PT = 2;
export const MAX_LABELS = 5000;
export const LABEL_FONT_LIMITS = { min: 8, max: 144 } as const;
export const LABEL_OFFSET_LIMITS = { min: -400, max: 400 } as const;
export const LABEL_DECIMALS_LIMITS = { min: 0, max: 10 } as const;
export const LABEL_AUTO_COLOR = '#000000';

const LABEL_REASONS = {
  needsSymbols: 'Point labels need Symbols to be shown.',
  meanRowTitle: 'Mean markers have no single row; they are labelled with their value.',
} as const;

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** Mean markers summarise a data set, so only the value source applies. */
export function effectiveLabelSource(type: ChartType, source: PointLabelSource): PointLabelSource {
  return type === 'mean' ? 'value' : source;
}

/** Fixed digits, or 6 significant digits when decimals is null. Non-finite values give ''. */
export function formatLabelValue(value: number, decimals: number | null): string {
  if (!Number.isFinite(value)) return '';
  if (decimals === null) return String(Number(value.toPrecision(6)));
  // Out-of-range stored decimals must never throw; treat them as automatic.
  if (!Number.isInteger(decimals) || decimals < LABEL_DECIMALS_LIMITS.min || decimals > LABEL_DECIMALS_LIMITS.max) {
    return String(Number(value.toPrecision(6)));
  }
  const text = value.toFixed(decimals);
  // "-0.00" would read as a negative number; drop the sign when every digit is zero.
  return /^-0(\.0*)?$/.test(text) ? text.slice(1) : text;
}

interface LabelSourceState {
  value: PointLabelSource;
  enabled: boolean;
  reason: string | null;
}

interface LabelAvailability {
  available: boolean;
  reason: string | null;
  sources: LabelSourceState[];
}

/** Which label controls apply; reasons are data so the Inspector can show them. */
export function labelAvailability(type: ChartType, style: Pick<ChartStyle, 'showSymbols'>): LabelAvailability {
  const available = style.showSymbols;
  const rowTitleOk = type !== 'mean';
  return {
    available,
    reason: available ? null : LABEL_REASONS.needsSymbols,
    sources: [
      { value: 'rowTitle', enabled: available && rowTitleOk, reason: rowTitleOk ? null : LABEL_REASONS.meanRowTitle },
      { value: 'value', enabled: available, reason: null },
    ],
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Fix invalid label keys; returns the same object when everything is valid. */
export function sanitizeLabelStyle<T extends ChartStyle>(style: T): T {
  const out: T = { ...style };
  const num = (v: unknown, fallback: number, lo: number, hi: number) =>
    typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : fallback;
  out.pointLabelFontSizePt = num(
    style.pointLabelFontSizePt,
    22.4,
    LABEL_FONT_LIMITS.min,
    LABEL_FONT_LIMITS.max,
  );
  out.pointLabelOffsetXPt = num(style.pointLabelOffsetXPt, 0, LABEL_OFFSET_LIMITS.min, LABEL_OFFSET_LIMITS.max);
  out.pointLabelOffsetYPt = num(style.pointLabelOffsetYPt, 0, LABEL_OFFSET_LIMITS.min, LABEL_OFFSET_LIMITS.max);
  const c = style.pointLabelColor;
  if (c !== null && !(typeof c === 'string' && HEX_COLOR.test(c))) out.pointLabelColor = null;
  const d = style.pointLabelDecimals;
  if (d !== null) {
    out.pointLabelDecimals =
      typeof d === 'number' && Number.isFinite(d)
        ? clamp(Math.round(d), LABEL_DECIMALS_LIMITS.min, LABEL_DECIMALS_LIMITS.max)
        : null;
  }
  const keys = Object.keys(out) as Array<keyof T>;
  return keys.every((k) => out[k] === style[k]) ? style : out;
}

/** Extra gap between neighbouring slots when a repelled label steps outwards (P). */
const LABEL_REPEL_GAP_PT = 4;

/** Axis-aligned box in pt: x0 <= x1 (left, right), y0 <= y1 (top, bottom). */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Where a label ended up relative to its preferred position. */
export type PlacementCode = 'placed' | 'flipped-h' | 'flipped-v' | 'flipped-hv' | 'clamped' | 'moved';

/** A point to label. radius is the symbol half-extent; placement gaps start at the symbol edge. */
export interface LabelAnchor {
  id: string;
  text: string;
  x: number;
  y: number;
  radius: number;
  fontSizePt: number;
  placement: PointLabelPlacement;
  offsetX: number;
  offsetY: number;
  collision: PointLabelCollision;
  leader: boolean;
}

interface LabelSymbol {
  id: string;
  box: Box;
}

export interface LabelLayoutOptions {
  /** Plot rectangle; a point outside it (edges included) is not labelled. */
  plot: Box;
  /** Containment box for named placements (plot inset). */
  bounds: Box;
  /** Containment box for custom placements (chart inset). */
  customBounds: Box;
  /** Symbol boxes of all points; a repelled label avoids those of other points first. */
  symbols?: readonly LabelSymbol[];
  /** Text width in pt. */
  measure: (text: string, anchor: LabelAnchor) => number;
}

export interface PointLabelGeom {
  id: string;
  text: string;
  /** Text actually drawn: text, or a code-point prefix plus an ellipsis. */
  shown: string;
  /** Text origin (start-anchored, alphabetic baseline). */
  x: number;
  y: number;
  fontSizePt: number;
  box: Box;
  code: PlacementCode;
  displaced: boolean;
  leader: { x1: number; y1: number; x2: number; y2: number } | null;
  overlap: boolean;
  /** Per-point text style resolved by buildPointLabels (null colour = automatic). */
  color?: string | null;
  bold?: boolean;
  italic?: boolean;
}

export interface SuppressedLabel {
  id: string;
  text: string;
  reason: 'overlap' | 'tooLarge';
}

export interface PointLabelReport {
  eligible: number;
  unlabelled: number;
  offPlot: number;
  tooMany: number;
  drawn: number;
  hidden: number;
  tooLarge: number;
  shortened: number;
  flipped: number;
  clamped: number;
  moved: number;
  overlapping: number;
}

export interface PointLabelModel {
  items: PointLabelGeom[];
  suppressed: SuppressedLabel[];
  report: PointLabelReport;
}

export function rectToBox(r: { x: number; y: number; width: number; height: number }): Box {
  return { x0: r.x, y0: r.y, x1: r.x + r.width, y1: r.y + r.height };
}

/** Shrink (or grow, when d < 0) on every side; an inverted result collapses to the midline. */
export function insetBox(b: Box, d: number): Box {
  let x0 = b.x0 + d;
  let x1 = b.x1 - d;
  let y0 = b.y0 + d;
  let y1 = b.y1 - d;
  if (x0 > x1) x0 = x1 = (b.x0 + b.x1) / 2;
  if (y0 > y1) y0 = y1 = (b.y0 + b.y1) / 2;
  return { x0, y0, x1, y1 };
}

/** Overlap needs an extent above LABEL_EPS on both axes, so touching boxes do not overlap. */
export function boxesOverlap(a: Box, b: Box): boolean {
  return (
    Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > LABEL_EPS &&
    Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > LABEL_EPS
  );
}

/**
 * Box for a placement. Named placements keep clear of the symbol by radius plus the
 * offset (negative offsets count as 0); custom is signed: the box top-left sits at
 * (x + offsetX, y + offsetY).
 */
export function placeBox(
  placement: PointLabelPlacement,
  anchor: { x: number; y: number; radius: number },
  size: { width: number; height: number },
  offsetX: number,
  offsetY: number,
): Box {
  const { x, y } = anchor;
  const { width: w, height: h } = size;
  if (placement === 'custom') return { x0: x + offsetX, y0: y + offsetY, x1: x + offsetX + w, y1: y + offsetY + h };
  const gx = anchor.radius + Math.max(0, offsetX);
  const gy = anchor.radius + Math.max(0, offsetY);
  let x0 = x - w / 2;
  let y0 = y - h / 2;
  switch (placement) {
    case 'above-right':
      x0 = x + gx;
      y0 = y - gy - h;
      break;
    case 'above':
      y0 = y - gy - h;
      break;
    case 'below':
      y0 = y + gy;
      break;
    case 'left':
      x0 = x - gx - w;
      break;
    case 'right':
      x0 = x + gx;
      break;
    default:
      break;
  }
  return { x0, y0, x1: x0 + w, y1: y0 + h };
}

const ELLIPSIS = String.fromCharCode(0x2026);

/** Longest code-point prefix plus an ellipsis that fits; null when even the ellipsis does not. */
export function fitLabelText(text: string, maxWidth: number, measure: (t: string) => number): string | null {
  if (measure(text) <= maxWidth + LABEL_EPS) return text;
  if (measure(ELLIPSIS) > maxWidth + LABEL_EPS) return null;
  const cps = Array.from(text);
  let lo = 0;
  let hi = cps.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(cps.slice(0, mid).join('') + ELLIPSIS) <= maxWidth + LABEL_EPS) lo = mid;
    else hi = mid - 1;
  }
  return cps.slice(0, lo).join('') + ELLIPSIS;
}

const isBox = (b: Box) => [b.x0, b.y0, b.x1, b.y1].every(Number.isFinite);

/** For each box, whether it overlaps another. Sweep over x; equals the all-pairs check. */
export function overlapFlags(boxes: readonly Box[]): boolean[] {
  const flags = boxes.map(() => false);
  const order: number[] = [];
  boxes.forEach((b, i) => {
    if (isBox(b)) order.push(i);
  });
  order.sort((i, j) => boxes[i].x0 - boxes[j].x0 || i - j);
  let active: number[] = [];
  for (const i of order) {
    const cur = boxes[i];
    active = active.filter((j) => boxes[j].x1 - cur.x0 > LABEL_EPS);
    for (const j of active) {
      if (boxesOverlap(boxes[j], cur)) {
        flags[i] = true;
        flags[j] = true;
      }
    }
    active.push(i);
  }
  return flags;
}

/** Uniform-grid index over boxes; hits() equals a scan of every added box. */
export class BoxGrid {
  private readonly cells = new Map<string, number[]>();
  private readonly boxes: Box[] = [];
  private readonly tags: string[] = [];
  private readonly cell: number;

  constructor(cell = 64) {
    this.cell = cell;
  }

  private range(b: Box): [number, number, number, number] {
    const c = this.cell;
    return [Math.floor(b.x0 / c), Math.floor(b.y0 / c), Math.floor(b.x1 / c), Math.floor(b.y1 / c)];
  }

  add(box: Box, tag = ''): void {
    const idx = this.boxes.length;
    this.boxes.push(box);
    this.tags.push(tag);
    const [cx0, cy0, cx1, cy1] = this.range(box);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const key = `${cx},${cy}`;
        const list = this.cells.get(key);
        if (list) list.push(idx);
        else this.cells.set(key, [idx]);
      }
    }
  }

  /** True when box overlaps an added box whose tag is not ignoreTag. */
  hits(box: Box, ignoreTag?: string): boolean {
    const [cx0, cy0, cx1, cy1] = this.range(box);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const list = this.cells.get(`${cx},${cy}`);
        if (!list) continue;
        for (const idx of list) {
          if (ignoreTag !== undefined && this.tags[idx] === ignoreTag) continue;
          if (boxesOverlap(this.boxes[idx], box)) return true;
        }
      }
    }
    return false;
  }
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Warning texts for a report, in a fixed order; empty when there is nothing to report.
 * 21.5 classes: unlabelled, off-plot and flipped are informational (L1463); too many,
 * too large, hidden, shortened, shifted, moved and overlapping are visual warnings (L1462).
 */
export function labelWarnings(r: PointLabelReport): string[] {
  const out: string[] = [];
  const was = (n: number) => (n === 1 ? 'was' : 'were');
  if (r.unlabelled > 0)
    out.push(`${count(r.unlabelled, 'point has', 'points have')} no label text and ${was(r.unlabelled)} not labelled.`);
  if (r.offPlot > 0)
    out.push(`${count(r.offPlot, 'point label was', 'point labels were')} not drawn because the point is outside the plot area.`);
  if (r.tooMany > 0)
    out.push(`${count(r.tooMany, 'point label was', 'point labels were')} not drawn: at most ${MAX_LABELS} labels are drawn.`);
  if (r.tooLarge > 0)
    out.push(`${count(r.tooLarge, 'point label is', 'point labels are')} too large for the plot area and ${was(r.tooLarge)} hidden.`);
  if (r.hidden > 0)
    out.push(
      `${count(r.hidden, 'point label was', 'point labels were')} hidden because ${r.hidden === 1 ? 'it overlaps' : 'they overlap'} another label.`,
    );
  if (r.shortened > 0)
    out.push(`${count(r.shortened, 'point label was', 'point labels were')} shortened to fit the plot area.`);
  if (r.flipped > 0)
    out.push(
      `${count(r.flipped, 'point label was', 'point labels were')} flipped to the other side of the point to stay inside the plot area.`,
    );
  if (r.clamped > 0)
    out.push(`${count(r.clamped, 'point label was', 'point labels were')} shifted to stay inside the plot area.`);
  if (r.moved > 0)
    out.push(`${count(r.moved, 'point label was', 'point labels were')} moved away from the point to avoid overlaps.`);
  if (r.overlapping > 0) out.push(`${count(r.overlapping, 'point label overlaps', 'point labels overlap')} another label.`);
  return out;
}

/** Ring directions for repelled labels (dx, dy in slots); the order is part of the P rules. */
const REPEL_DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
  [-1, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
];

const inside = (b: Box, c: Box) =>
  b.x0 >= c.x0 - LABEL_EPS && b.x1 <= c.x1 + LABEL_EPS && b.y0 >= c.y0 - LABEL_EPS && b.y1 <= c.y1 + LABEL_EPS;

function mirrorBox(b: Box, ax: number, ay: number, h: boolean, v: boolean): Box {
  return {
    x0: h ? 2 * ax - b.x1 : b.x0,
    y0: v ? 2 * ay - b.y1 : b.y0,
    x1: h ? 2 * ax - b.x0 : b.x1,
    y1: v ? 2 * ay - b.y0 : b.y1,
  };
}

interface SizedLabel {
  index: number;
  shown: string;
  width: number;
  height: number;
  bounds: Box;
}

/**
 * Deterministic point-label layout (P rules, spec 23 L1539). Points with no text or
 * outside the plot are skipped and labels past MAX_LABELS are not drawn. Fixed labels
 * (custom placement or collision keep) are placed first, then movable ones in input
 * order: out-of-bounds labels flip horizontally, vertically, then both, then clamp;
 * overlapping labels are hidden or repelled along rings (first avoiding other points'
 * symbols, then only labels). Leaders appear only for displaced labels. Items come back
 * in input order and drawn + suppressed = eligible - unlabelled - offPlot - tooMany.
 */
export function layoutLabels(anchors: readonly LabelAnchor[], options: LabelLayoutOptions): PointLabelModel {
  const report: PointLabelReport = {
    eligible: anchors.length,
    unlabelled: 0,
    offPlot: 0,
    tooMany: 0,
    drawn: 0,
    hidden: 0,
    tooLarge: 0,
    shortened: 0,
    flipped: 0,
    clamped: 0,
    moved: 0,
    overlapping: 0,
  };
  const { plot } = options;
  const candidates: number[] = [];
  anchors.forEach((a, i) => {
    if (a.text === '') report.unlabelled++;
    else if (
      !(Number.isFinite(a.x) && Number.isFinite(a.y)) ||
      a.x < plot.x0 ||
      a.x > plot.x1 ||
      a.y < plot.y0 ||
      a.y > plot.y1
    )
      report.offPlot++;
    else if (candidates.length >= MAX_LABELS) report.tooMany++;
    else candidates.push(i);
  });

  const suppressed: Array<{ index: number; item: SuppressedLabel }> = [];
  const sized: SizedLabel[] = [];
  for (const index of candidates) {
    const a = anchors[index];
    const bounds = a.placement === 'custom' ? options.customBounds : options.bounds;
    const height = a.fontSizePt * LABEL_LINE_HEIGHT;
    const shown = fitLabelText(a.text, bounds.x1 - bounds.x0, (t) => options.measure(t, a));
    if (shown === null || height > bounds.y1 - bounds.y0 + LABEL_EPS) {
      suppressed.push({ index, item: { id: a.id, text: a.text, reason: 'tooLarge' } });
      report.tooLarge++;
      continue;
    }
    sized.push({ index, shown, width: options.measure(shown, a), height, bounds });
  }

  const isFixed = (s: SizedLabel) => anchors[s.index].collision === 'keep' || anchors[s.index].placement === 'custom';
  const order = [...sized.filter(isFixed), ...sized.filter((s) => !isFixed(s))];

  const labelGrid = new BoxGrid();
  const symbolGrid = new BoxGrid();
  for (const s of options.symbols ?? []) if (isBox(s.box)) symbolGrid.add(s.box, s.id);

  const placed = new Map<number, { box: Box; code: PlacementCode }>();
  for (const s of order) {
    const a = anchors[s.index];
    const pref = placeBox(a.placement, a, s, a.offsetX, a.offsetY);
    let box = pref;
    let code: PlacementCode = 'placed';
    if (!inside(pref, s.bounds)) {
      let found = false;
      if (a.placement !== 'custom') {
        const tries: Array<[boolean, boolean, PlacementCode]> = [
          [true, false, 'flipped-h'],
          [false, true, 'flipped-v'],
          [true, true, 'flipped-hv'],
        ];
        for (const [h, v, c] of tries) {
          const cand = mirrorBox(pref, a.x, a.y, h, v);
          if (inside(cand, s.bounds)) {
            box = cand;
            code = c;
            found = true;
            break;
          }
        }
      }
      if (!found) {
        const x0 = clamp(pref.x0, s.bounds.x0, Math.max(s.bounds.x0, s.bounds.x1 - s.width));
        const y0 = clamp(pref.y0, s.bounds.y0, Math.max(s.bounds.y0, s.bounds.y1 - s.height));
        box = { x0, y0, x1: x0 + s.width, y1: y0 + s.height };
        code = 'clamped';
      }
    }
    if (!isFixed(s) && labelGrid.hits(box)) {
      if (a.collision === 'hide') {
        suppressed.push({ index: s.index, item: { id: a.id, text: a.text, reason: 'overlap' } });
        report.hidden++;
        continue;
      }
      const stepX = s.width + LABEL_REPEL_GAP_PT;
      const stepY = s.height;
      let moved: Box | null = null;
      for (let pass = 0; pass < 2 && !moved; pass++) {
        for (let ring = 1; ring <= REPEL_MAX_RING && !moved; ring++) {
          for (const [dx, dy] of REPEL_DIRS) {
            const sx = dx * ring * stepX;
            const sy = dy * ring * stepY;
            const cand = { x0: box.x0 + sx, y0: box.y0 + sy, x1: box.x1 + sx, y1: box.y1 + sy };
            if (!inside(cand, s.bounds) || labelGrid.hits(cand)) continue;
            if (pass === 0 && symbolGrid.hits(cand, a.id)) continue;
            moved = cand;
            break;
          }
        }
      }
      if (moved) {
        box = moved;
        code = 'moved';
      }
    }
    labelGrid.add(box);
    placed.set(s.index, { box, code });
  }

  const items: PointLabelGeom[] = [];
  for (const s of sized) {
    const p = placed.get(s.index);
    if (!p) continue;
    const a = anchors[s.index];
    const nx = clamp(a.x, p.box.x0, p.box.x1);
    const ny = clamp(a.y, p.box.y0, p.box.y1);
    const dist = Math.hypot(nx - a.x, ny - a.y);
    const displaced =
      (p.code === 'moved' || p.code === 'clamped' || a.placement === 'custom') && dist - a.radius > LEADER_MIN_GAP_PT;
    const leader =
      a.leader && displaced
        ? { x1: a.x + ((nx - a.x) / dist) * a.radius, y1: a.y + ((ny - a.y) / dist) * a.radius, x2: nx, y2: ny }
        : null;
    items.push({
      id: a.id,
      text: a.text,
      shown: s.shown,
      x: p.box.x0,
      y: p.box.y0 + a.fontSizePt * LABEL_BASELINE,
      fontSizePt: a.fontSizePt,
      box: p.box,
      code: p.code,
      displaced,
      leader,
      overlap: false,
    });
    if (s.shown !== a.text) report.shortened++;
    if (p.code.startsWith('flipped')) report.flipped++;
    else if (p.code === 'clamped') report.clamped++;
    else if (p.code === 'moved') report.moved++;
  }
  const flags = overlapFlags(items.map((it) => it.box));
  items.forEach((it, i) => {
    it.overlap = flags[i];
    if (flags[i]) report.overlapping++;
  });
  report.drawn = items.length;
  suppressed.sort((a, b) => a.index - b.index);
  return { items, suppressed: suppressed.map((s) => s.item), report };
}

/** One drawn symbol; every point takes part as an obstacle, labelled or not. */
interface LabelPointInput {
  id: string;
  /** Displayed symbol centre (jitter and the data set's own axis included). */
  cx: number;
  cy: number;
  /** Symbol size in pt (the symbol extends size / 2 from its centre). */
  size: number;
  /** Plotted value; for a mean marker the centre value. */
  value: number;
  /** Title of the point's row; '' for mean markers and untitled rows. */
  rowTitle: string;
  /** Style resolved down to this point. */
  style: ChartStyle;
}

interface LabelGroupInput {
  groupId: string;
  points: LabelPointInput[];
}

interface BuildPointLabelsInput {
  type: ChartType;
  groups: readonly LabelGroupInput[];
  plot: { x: number; y: number; width: number; height: number };
  chart: { width: number; height: number };
}

export function emptyPointLabelModel(): PointLabelModel {
  return {
    items: [],
    suppressed: [],
    report: {
      eligible: 0,
      unlabelled: 0,
      offPlot: 0,
      tooMany: 0,
      drawn: 0,
      hidden: 0,
      tooLarge: 0,
      shortened: 0,
      flipped: 0,
      clamped: 0,
      moved: 0,
      overlapping: 0,
    },
  };
}

/** True when any level of the style hierarchy asks for labels, so the common case never resolves per-point styles. */
export function anyLabelsRequested(chart: Chart): boolean {
  if (chart.defaults.showPointLabels) return true;
  return chart.layers.some(
    (layer) =>
      layer.style.showPointLabels === true ||
      Object.values(layer.groupOverrides).some((o) => o.showPointLabels === true) ||
      Object.values(layer.objectOverrides).some((o) => o.showPointLabels === true),
  );
}

/**
 * Label model for all points. Labels sit at the displayed symbol centres; an empty text means
 * unlabelled. Bounds are the plot inset by 4 pt (named placements) and the chart inset by 4 pt (custom).
 */
export function buildPointLabels(input: BuildPointLabelsInput): PointLabelModel {
  const anchors: LabelAnchor[] = [];
  const symbols: LabelSymbol[] = [];
  const fonts = new Map<string, { bold: boolean; italic: boolean; color: string | null }>();
  for (const g of input.groups) {
    for (const p of g.points) {
      const h = p.size / 2;
      symbols.push({ id: p.id, box: { x0: p.cx - h, y0: p.cy - h, x1: p.cx + h, y1: p.cy + h } });
      const s = p.style;
      if (!s.showPointLabels || !s.showSymbols) continue;
      const text =
        effectiveLabelSource(input.type, s.pointLabelSource) === 'value'
          ? formatLabelValue(p.value, s.pointLabelDecimals)
          : p.rowTitle;
      fonts.set(p.id, { bold: s.pointLabelBold, italic: s.pointLabelItalic, color: s.pointLabelColor });
      anchors.push({
        id: p.id,
        text,
        x: p.cx,
        y: p.cy,
        radius: h,
        fontSizePt: s.pointLabelFontSizePt,
        placement: s.pointLabelPlacement,
        offsetX: s.pointLabelOffsetXPt,
        offsetY: s.pointLabelOffsetYPt,
        collision: s.pointLabelCollision,
        leader: s.pointLabelLeader,
      });
    }
  }
  if (anchors.length === 0) return emptyPointLabelModel();
  const plot = rectToBox(input.plot);
  // layoutLabels keeps drawn + suppressed = eligible - unlabelled - offPlot - tooMany.
  const model = layoutLabels(anchors, {
    plot,
    bounds: insetBox(plot, LABEL_BOUNDS_INSET_PT),
    customBounds: insetBox({ x0: 0, y0: 0, x1: input.chart.width, y1: input.chart.height }, LABEL_BOUNDS_INSET_PT),
    symbols,
    measure: (text, a) => {
      const f = fonts.get(a.id);
      return measureText(text, a.fontSizePt, f?.bold ?? false, f?.italic ?? false);
    },
  });
  for (const it of model.items) {
    const f = fonts.get(it.id);
    if (!f) continue;
    it.color = f.color;
    it.bold = f.bold;
    it.italic = f.italic;
  }
  return model;
}
