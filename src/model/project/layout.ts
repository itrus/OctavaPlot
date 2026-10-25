import type { FrameMm, Layout, LayoutArrangement, PageOrientation, PanelLabelStyle } from '../types';

/** A4 in mm; the renderer's unit is the point (1 in = 72 pt). */
const A4_MM = { width: 210, height: 297 } as const;

export const mmToPt = (mm: number): number => (mm * 72) / 25.4;

export const PERCENT_MIN = 10;
export const PERCENT_MAX = 400;
export const LABEL_PT_MIN = 6;
export const LABEL_PT_MAX = 48;
export const MARGIN_MM_MAX = 50;
export const GAP_MM_MAX = 30;
/** Most rows or columns of an array. */
export const GRID_MAX = 6;
/** Most panels of a free layout, and the smallest box (mm). */
export const FREE_MAX = 12;
const FRAME_MIN_MM = 15;

/** Size of the page in mm for an orientation. */
export const pageMm = (o: PageOrientation): { width: number; height: number } => (o === 'landscape' ? { width: A4_MM.height, height: A4_MM.width } : A4_MM);

/**
 * The arrangements offered as buttons: one graph, a graph with an inset, two and three graphs (side by side on a landscape page,
 * one above the other on a portrait page) and 2 × 2. Larger arrays are made with the array fields (up to 6 × 6).
 */
export function standardArrangements(orientation: PageOrientation): ReadonlyArray<{ id: string; label: string; arrangement: LayoutArrangement }> {
  const across = orientation === 'landscape';
  return [
    { id: 'one', label: 'One graph', arrangement: { kind: 'grid', cols: 1, rows: 1 } },
    { id: 'inset', label: 'Graph with an inset', arrangement: { kind: 'inset' } },
    { id: 'two', label: across ? 'Two across' : 'Two down', arrangement: { kind: 'grid', cols: across ? 2 : 1, rows: across ? 1 : 2 } },
    { id: 'three', label: across ? 'Three across' : 'Three down', arrangement: { kind: 'grid', cols: across ? 3 : 1, rows: across ? 1 : 3 } },
    { id: 'four', label: '2 × 2', arrangement: { kind: 'grid', cols: 2, rows: 2 } },
  ];
}

export const slotCount = (a: LayoutArrangement): number => (a.kind === 'inset' ? 2 : a.kind === 'free' ? a.frames.length : a.cols * a.rows);

export const sameArrangement = (a: LayoutArrangement, b: LayoutArrangement): boolean =>
  a.kind === 'inset' ? b.kind === 'inset' : a.kind === 'grid' ? b.kind === 'grid' && a.cols === b.cols && a.rows === b.rows : false;

const PT_TO_MM = 25.4 / 72;
const round2 = (v: number) => Math.round(v * 100) / 100;

/** Moves and resizes a box on the page, keeping it on the page and at least the smallest size. */
export function clampFrame(f: FrameMm, orientation: PageOrientation): FrameMm {
  const page = pageMm(orientation);
  const w = Math.min(page.width, Math.max(FRAME_MIN_MM, f.w));
  const h = Math.min(page.height, Math.max(FRAME_MIN_MM, f.h));
  return { x: round2(Math.min(page.width - w, Math.max(0, f.x))), y: round2(Math.min(page.height - h, Math.max(0, f.y))), w: round2(w), h: round2(h) };
}

/** The slots of any arrangement as free boxes (mm): what "Free placement" starts from. */
export function framesOf(layout: Pick<Layout, 'orientation' | 'marginMm' | 'showTitle' | 'arrangement' | 'gapMm'>): FrameMm[] {
  return slotRects(layout).map((r) => clampFrame({ x: r.x * PT_TO_MM, y: r.y * PT_TO_MM, w: r.w * PT_TO_MM, h: r.h * PT_TO_MM }, layout.orientation));
}

/** The boxes of a free layout carried over to the other orientation, in proportion to the page. */
export function turnFrames(frames: readonly FrameMm[], from: PageOrientation, to: PageOrientation): FrameMm[] {
  if (from === to) return [...frames];
  const [a, b] = [pageMm(from), pageMm(to)];
  const [kx, ky] = [b.width / a.width, b.height / a.height];
  return frames.map((f) => clampFrame({ x: f.x * kx, y: f.y * ky, w: f.w * kx, h: f.h * ky }, to));
}

/** A box for a panel added to a free layout: a quarter of the page, placed where it does not sit exactly on another. */
export function newFrame(frames: readonly FrameMm[], orientation: PageOrientation): FrameMm {
  const page = pageMm(orientation);
  const [w, h] = [page.width / 2.5, page.height / 2.5];
  const step = 8 * frames.length;
  return clampFrame({ x: 12 + step, y: 12 + step, w, h }, orientation);
}

/** Share of the large panel's width and height that the inset takes. */
const INSET_SHARE = 0.38;
const TITLE_HEIGHT_MM = 12;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The page and the areas on it, in pt. */
export interface PageFrame {
  widthPt: number;
  heightPt: number;
  /** The area inside the margins that the panels share (below the title when there is one). */
  content: Rect;
  title: Rect | null;
}

type FrameFields = Pick<Layout, 'orientation' | 'marginMm' | 'showTitle'>;

export function pageFrame(layout: FrameFields): PageFrame {
  const mm = pageMm(layout.orientation);
  const [W, H, m] = [mmToPt(mm.width), mmToPt(mm.height), mmToPt(layout.marginMm)];
  const titleH = layout.showTitle ? mmToPt(TITLE_HEIGHT_MM) : 0;
  return {
    widthPt: W,
    heightPt: H,
    title: layout.showTitle ? { x: m, y: m, w: W - 2 * m, h: titleH } : null,
    content: { x: m, y: m + titleH, w: Math.max(1, W - 2 * m), h: Math.max(1, H - 2 * m - titleH) },
  };
}

/** The rectangle of every slot, in pt on the page. */
export function slotRects(layout: FrameFields & Pick<Layout, 'arrangement' | 'gapMm'>): Rect[] {
  const { content } = pageFrame(layout);
  const a = layout.arrangement;
  if (a.kind === 'free') return a.frames.map((f) => ({ x: mmToPt(f.x), y: mmToPt(f.y), w: mmToPt(f.w), h: mmToPt(f.h) }));
  if (a.kind === 'inset') {
    const [iw, ih] = [content.w * INSET_SHARE, content.h * INSET_SHARE];
    return [content, { x: content.x + content.w - iw, y: content.y, w: iw, h: ih }];
  }
  const gap = mmToPt(layout.gapMm);
  const w = Math.max(1, (content.w - gap * (a.cols - 1)) / a.cols);
  const h = Math.max(1, (content.h - gap * (a.rows - 1)) / a.rows);
  const out: Rect[] = [];
  for (let r = 0; r < a.rows; r++) for (let c = 0; c < a.cols; c++) out.push({ x: content.x + c * (w + gap), y: content.y + r * (h + gap), w, h });
  return out;
}

const ROMAN: ReadonlyArray<readonly [number, string]> = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];

const letters = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : letters(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)));

/** The label of panel `index` (0-based) in a style; '' for none. Letters run A to Z, then AA, AB ... */
export function panelLabel(style: PanelLabelStyle, index: number): string {
  if (style === 'none') return '';
  if (style === '1') return String(index + 1);
  if (style === 'I') {
    let n = index + 1;
    let out = '';
    for (const [v, s] of ROMAN) {
      while (n >= v) {
        out += s;
        n -= v;
      }
    }
    return out;
  }
  return style === 'a' ? letters(index).toLowerCase() : letters(index);
}

/** A graph's natural size on the page, in pt (its SVG viewBox), or null for an empty slot. */
export type NaturalSize = { widthPt: number; heightPt: number } | null;

interface Placement {
  slot: number;
  rect: Rect;
  /** Where the graph is drawn (centred in the slot) and its size, in pt on the page; null for an empty slot. */
  graph: Rect | null;
  /** Size on the page / size in the Graphs section; 1 = 100%. */
  factor: number;
  label: string;
}

export interface Arranged {
  frame: PageFrame;
  placements: Placement[];
  /** The factor shared by all graphs, or null when 'fit' gives each its own. */
  commonFactor: number | null;
}

const fitFactor = (r: Rect, s: { widthPt: number; heightPt: number }): number => Math.min(r.w / s.widthPt, r.h / s.heightPt);

/** Where each graph goes on the page and at what scale; `sizes[i]` is the natural size of the graph in slot i. */
export function arrangeLayout(layout: Layout, sizes: readonly NaturalSize[]): Arranged {
  const frame = pageFrame(layout);
  const rects = slotRects(layout);
  const fits = rects.map((r, i) => {
    const s = sizes[i];
    return s ? fitFactor(r, s) : null;
  });
  const placed = fits.filter((f): f is number => f !== null);
  const sc = layout.scaling;
  const common = sc.mode === 'percent' ? Math.min(PERCENT_MAX, Math.max(PERCENT_MIN, sc.percent)) / 100 : sc.mode === 'smallest' && placed.length > 0 ? Math.min(...placed) : sc.mode === 'largest' && placed.length > 0 ? Math.max(...placed) : null;
  const placements = rects.map((rect, slot): Placement => {
    const size = sizes[slot];
    const label = panelLabel(layout.labelStyle, slot);
    if (!size) return { slot, rect, graph: null, factor: common ?? 1, label };
    const factor = common ?? fits[slot] ?? 1;
    const [w, h] = [size.widthPt * factor, size.heightPt * factor];
    // A graph larger than its slot (a chosen percentage) is clipped to the slot, not drawn over its neighbours.
    return { slot, rect, graph: { x: rect.x + (rect.w - w) / 2, y: rect.y + (rect.h - h) / 2, w, h }, factor, label };
  });
  return { frame, placements, commonFactor: common };
}

/** The panels of a layout as long as its arrangement needs: new slots are empty, slots that no longer exist are dropped. */
export const resizePanels = (panels: ReadonlyArray<string | null>, arrangement: LayoutArrangement): Array<string | null> => Array.from({ length: slotCount(arrangement) }, (_, i) => panels[i] ?? null);

const HEX = /^#[0-9a-fA-F]{6}$/;
const clampNum = (v: unknown, lo: number, hi: number, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);
const LABEL_STYLES: readonly PanelLabelStyle[] = ['none', 'A', 'a', 'I', '1'];

function sanitizeArrangement(v: unknown, fallback: LayoutArrangement, orientation: PageOrientation): LayoutArrangement {
  if (typeof v !== 'object' || v === null) return fallback;
  const a = v as Record<string, unknown>;
  if (a.kind === 'inset') return { kind: 'inset' };
  if (a.kind === 'free') {
    const frames = (Array.isArray(a.frames) ? a.frames : []).slice(0, FREE_MAX).flatMap((f): FrameMm[] => {
      if (typeof f !== 'object' || f === null) return [];
      const r = f as Record<string, unknown>;
      return [clampFrame({ x: clampNum(r.x, 0, 1000, 0), y: clampNum(r.y, 0, 1000, 0), w: clampNum(r.w, 0, 1000, 80), h: clampNum(r.h, 0, 1000, 60) }, orientation)];
    });
    return frames.length > 0 ? { kind: 'free', frames } : fallback;
  }
  if (a.kind !== 'grid') return fallback;
  const dim = (x: unknown, f: number) => Math.round(clampNum(x, 1, GRID_MAX, f));
  const [fc, fr] = fallback.kind === 'grid' ? [fallback.cols, fallback.rows] : [2, 1];
  return { kind: 'grid', cols: dim(a.cols, fc), rows: dim(a.rows, fr) };
}

function sanitizeScaling(v: unknown, fallback: Layout['scaling']): Layout['scaling'] {
  if (typeof v !== 'object' || v === null) return fallback;
  const s = v as Record<string, unknown>;
  // 'equal' is the earlier name of 'smallest'.
  if (s.mode === 'equal') return { mode: 'smallest' };
  if (s.mode === 'smallest' || s.mode === 'largest' || s.mode === 'fit') return { mode: s.mode };
  if (s.mode === 'percent') return { mode: 'percent', percent: clampNum(s.percent, PERCENT_MIN, PERCENT_MAX, fallback.mode === 'percent' ? fallback.percent : 100) };
  return fallback;
}

/**
 * A layout from loosely typed fields (a file, or a patch from the interface) on top of `base`: every value is checked and
 * clamped, a wrong one keeps the base value. `panels` are not touched here (they need the graphs of the project); they
 * are cut or padded to the arrangement.
 */
export function sanitizeLayout(raw: Partial<Record<keyof Layout, unknown>>, base: Layout): Layout {
  const orientation = raw.orientation === 'portrait' || raw.orientation === 'landscape' ? raw.orientation : base.orientation;
  const arrangement = 'arrangement' in raw ? sanitizeArrangement(raw.arrangement, base.arrangement, orientation) : base.arrangement;
  return {
    id: base.id,
    name: typeof raw.name === 'string' && raw.name.trim() !== '' ? raw.name.trim() : base.name,
    orientation,
    background: raw.background === null ? null : typeof raw.background === 'string' && HEX.test(raw.background) ? raw.background : base.background,
    arrangement,
    panels: resizePanels(Array.isArray(raw.panels) ? raw.panels.map((p) => (typeof p === 'string' ? p : null)) : base.panels, arrangement),
    scaling: 'scaling' in raw ? sanitizeScaling(raw.scaling, base.scaling) : base.scaling,
    labelStyle: LABEL_STYLES.find((s) => s === raw.labelStyle) ?? base.labelStyle,
    labelSizePt: clampNum(raw.labelSizePt, LABEL_PT_MIN, LABEL_PT_MAX, base.labelSizePt),
    showTitle: typeof raw.showTitle === 'boolean' ? raw.showTitle : base.showTitle,
    title: typeof raw.title === 'string' ? raw.title.slice(0, 200) : base.title,
    marginMm: clampNum(raw.marginMm, 0, MARGIN_MM_MAX, base.marginMm),
    gapMm: clampNum(raw.gapMm, 0, GAP_MM_MAX, base.gapMm),
  };
}

/** A new layout with the defaults (landscape, white, no title, panels lettered A B C, equal scaling). */
export function defaultLayout(id: string, name: string, over: Partial<Pick<Layout, 'orientation' | 'background' | 'showTitle' | 'arrangement' | 'panels'>> = {}): Layout {
  const arrangement = over.arrangement ?? { kind: 'grid', cols: 2, rows: 1 };
  return {
    id,
    name,
    orientation: over.orientation ?? 'landscape',
    background: over.background === undefined ? '#ffffff' : over.background,
    arrangement,
    panels: resizePanels(over.panels ?? [], arrangement),
    scaling: { mode: 'smallest' },
    labelStyle: 'A',
    labelSizePt: 16,
    showTitle: over.showTitle ?? false,
    title: '',
    marginMm: 12,
    gapMm: 6,
  };
}
