import type { Drawing, DrawingPoint, LineEnd } from '../../../model/types';
import { endSizeOf } from '../../../model/graph/drawingPresets';
import { dashOf } from '../../../model/graph/look';
import { n2 } from '../../../model/units';
import type { AnnotationPlacer, Spot } from './annotationPlace';
import { drawnFractions, patchForMove } from './annotationPlace';
import { SELECT_COLOR } from './annotations';
import { el, type SceneElement } from './sceneElement';
import { svgId } from './svgIds';

interface P {
  x: number;
  y: number;
}

/** Where the points of an object are drawn, pt; null when one of them has no place (anchored to a value outside the axis range). */
type PointPlace = (p: Spot) => P | null;

const spotOf = (d: Drawing, p: DrawingPoint): Spot => ({ xFrac: p.xFrac, yFrac: p.yFrac, ...(d.anchor === 'data' ? { anchor: 'data' as const, x: p.x, y: p.y } : {}) });

/** The two points of an object on the page, pt: where `place` puts them, or at their fractions of the size. */
function drawingPoints(d: Drawing, width: number, height: number, place?: PointPlace): [P, P] | null {
  const at = (p: DrawingPoint) => (place ? place(spotOf(d, p)) : { x: p.xFrac * width, y: p.yFrac * height });
  const [a, b] = [at(d.from), at(d.to)];
  return a && b ? [a, b] : null;
}

const unit = (v: P): P | null => {
  const len = Math.hypot(v.x, v.y);
  return len < 1e-9 ? null : { x: v.x / len, y: v.y / len };
};

/**
 * The side of a segment a tick (and a text below) goes to: below a line that runs more across than up or down, left of one that runs
 * more up or down. The other side (above, right) is the opposite. A unit vector.
 */
export function belowSide(dir: P): P {
  const n = { x: -dir.y, y: dir.x };
  const across = Math.abs(dir.x) >= Math.abs(dir.y);
  return (across ? n.y < 0 : n.x > 0) ? { x: -n.x, y: -n.y } : n;
}

/** The corners a line runs through, from its start to its end: two for a straight line, three for a bent one. */
export function linePath(d: Pick<Drawing, 'route'>, a: P, b: P): P[] {
  const route = d.route ?? 'straight';
  if (route === 'straight') return [a, b];
  const corner = route === 'hv' ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
  // A bend on top of an end is no bend.
  return Math.hypot(corner.x - a.x, corner.y - a.y) < 1e-6 || Math.hypot(corner.x - b.x, corner.y - b.y) < 1e-6 ? [a, b] : [a, corner, b];
}

const path = (pts: readonly P[]): string => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${n2(p.x)},${n2(p.y)}`).join('');

/** The marks of one end of a line at `tip`, whose last segment points along `dir` (out of the line), and how far the line stops short of the tip. */
function endMark(kind: LineEnd, tip: P, dir: P, size: number): { heads: string; caps: string; inset: number } {
  if (kind === 'arrow') {
    const half = size * 0.4;
    const base = { x: tip.x - dir.x * size, y: tip.y - dir.y * size };
    const n = { x: -dir.y, y: dir.x };
    const d = `M${n2(tip.x)},${n2(tip.y)}L${n2(base.x + n.x * half)},${n2(base.y + n.y * half)}L${n2(base.x - n.x * half)},${n2(base.y - n.y * half)}Z`;
    // The line stops inside the head, so that its end does not show past the point.
    return { heads: d, caps: '', inset: size * 0.8 };
  }
  if (kind === 'bar') {
    const n = belowSide(dir);
    return { heads: '', caps: `M${n2(tip.x - (n.x * size) / 2)},${n2(tip.y - (n.y * size) / 2)}L${n2(tip.x + (n.x * size) / 2)},${n2(tip.y + (n.y * size) / 2)}`, inset: 0 };
  }
  if (kind === 'tick' || kind === 'tickFlip') {
    const below = belowSide(dir);
    const n = kind === 'tick' ? below : { x: -below.x, y: -below.y };
    return { heads: '', caps: `M${n2(tip.x)},${n2(tip.y)}L${n2(tip.x + n.x * size)},${n2(tip.y + n.y * size)}`, inset: 0 };
  }
  return { heads: '', caps: '', inset: 0 };
}

/** The point at half the length of a path, and the direction of the segment it is on. */
function midOf(pts: readonly P[]): { at: P; dir: P } | null {
  const lengths = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y));
  const total = lengths.reduce((s, l) => s + l, 0);
  if (total < 1e-9) return null;
  let left = total / 2;
  for (let i = 0; i < lengths.length; i++) {
    if (left <= lengths[i] || i === lengths.length - 1) {
      const t = lengths[i] === 0 ? 0 : Math.min(1, left / lengths[i]);
      const [a, b] = [pts[i], pts[i + 1]];
      return { at: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, dir: unit({ x: b.x - a.x, y: b.y - a.y }) as P };
    }
    left -= lengths[i];
  }
  return null;
}

interface DrawingGeometry {
  /** The outline (a line: shortened under its arrowheads). */
  d: string;
  closed: boolean;
  heads: string;
  caps: string;
  /** Where the text of a line is written: the point of its baseline, and how it is anchored there. */
  text: { x: number; y: number; anchor: 'start' | 'middle' | 'end' } | null;
}

/** The shapes an object is drawn from, between its two points on the page (pt). Pure. */
export function drawingGeometry(d: Drawing, a: P, b: P): DrawingGeometry {
  const none = { heads: '', caps: '', text: null };
  if (d.shape === 'ellipse') {
    const [cx, cy, rx, ry] = [(a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2];
    if (rx < 1e-6 || ry < 1e-6) return { d: path([a, b]), closed: false, ...none };
    const arc = (x: number) => `A${n2(rx)},${n2(ry)} 0 1 0 ${n2(x)},${n2(cy)}`;
    return { d: `M${n2(cx - rx)},${n2(cy)}${arc(cx + rx)}${arc(cx - rx)}Z`, closed: true, ...none };
  }
  if (d.shape === 'rect') {
    const [x0, y0, x1, y1] = [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y)];
    const r = Math.min(d.cornerPt ?? 0, (x1 - x0) / 2, (y1 - y0) / 2);
    if (r <= 0) return { d: `M${n2(x0)},${n2(y0)}H${n2(x1)}V${n2(y1)}H${n2(x0)}Z`, closed: true, ...none };
    const q = (x: number, y: number) => `A${n2(r)},${n2(r)} 0 0 1 ${n2(x)},${n2(y)}`;
    return {
      d: `M${n2(x0 + r)},${n2(y0)}H${n2(x1 - r)}${q(x1, y0 + r)}V${n2(y1 - r)}${q(x1 - r, y1)}H${n2(x0 + r)}${q(x0, y1 - r)}V${n2(y0 + r)}${q(x0 + r, y0)}Z`,
      closed: true,
      ...none,
    };
  }
  if (d.shape === 'arc') {
    // A quarter of an ellipse from the start to the end, round the corner across from the start: from the bottom left to the top right it bows up and to the left.
    const [rx, ry] = [Math.abs(b.x - a.x), Math.abs(b.y - a.y)];
    if (rx < 1e-6 || ry < 1e-6) return { d: path([a, b]), closed: false, ...none };
    const c = { x: b.x, y: a.y };
    const sweep = (a.x - c.x) * (b.y - c.y) - (a.y - c.y) * (b.x - c.x) > 0 ? 1 : 0;
    return { d: `M${n2(a.x)},${n2(a.y)}A${n2(rx)},${n2(ry)} 0 0 ${sweep} ${n2(b.x)},${n2(b.y)}`, closed: false, ...none };
  }
  // A line: its corners, the marks at its ends, and its text at the middle.
  const pts = linePath(d, a, b);
  const startKind = d.start ?? 'none';
  const endKind = d.end ?? 'none';
  const startDir = unit({ x: pts[0].x - pts[1].x, y: pts[0].y - pts[1].y });
  const endDir = unit({ x: pts[pts.length - 1].x - pts[pts.length - 2].x, y: pts[pts.length - 1].y - pts[pts.length - 2].y });
  const s = startDir ? endMark(startKind, pts[0], startDir, endSizeOf(d, startKind)) : { heads: '', caps: '', inset: 0 };
  const e = endDir ? endMark(endKind, pts[pts.length - 1], endDir, endSizeOf(d, endKind)) : { heads: '', caps: '', inset: 0 };
  const drawn = pts.map((p) => ({ ...p }));
  // The line stops short of an arrowhead, but never turns back on itself (a head longer than its segment).
  const pull = (i: number, j: number, dir: P | null, inset: number) => {
    if (!dir || inset <= 0) return;
    const room = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
    const k = Math.min(inset, room * 0.9);
    drawn[i] = { x: pts[i].x - dir.x * k, y: pts[i].y - dir.y * k };
  };
  pull(0, 1, startDir, s.inset);
  pull(pts.length - 1, pts.length - 2, endDir, e.inset);
  let text: DrawingGeometry['text'] = null;
  const mid = d.text !== undefined ? midOf(pts) : null;
  if (mid) {
    const size = d.fontSizePt ?? 12;
    const gap = d.textGapPt ?? 3;
    const below = d.textSide === 'below';
    if (Math.abs(mid.dir.x) >= Math.abs(mid.dir.y)) {
      // Across: centred over (or under) the middle; the gap is between the line and the letters, not their baseline.
      text = { x: mid.at.x, y: below ? mid.at.y + gap + size * 0.75 : mid.at.y - gap - size * 0.12, anchor: 'middle' };
    } else {
      // Up or down: beside the middle, to the right (above) or to the left (below), centred on it.
      text = { x: below ? mid.at.x - gap : mid.at.x + gap, y: mid.at.y + size * 0.35, anchor: below ? 'end' : 'start' };
    }
  }
  return { d: path(drawn), closed: false, heads: s.heads + e.heads, caps: s.caps + e.caps, text };
}

/** The live points of an object while it is moved or drawn (pt, on the page), which stand for its stored ones. */
export interface DrawingDrag {
  id: string;
  from: P;
  to: P;
}

/**
 * The drawing objects of a chart or a page as scene elements: each a group with the outline (and fill), the arrowheads, the ticks and
 * bars, and the text of a line. In the editor a wide transparent twin of the outline makes it easy to hit, and while it is selected its
 * two points have handles (`whenAnnotationSelected`, the objects share the selection marks of the texts). `drafts` are drawn in place
 * of the stored objects with the same IDs (a move, a resize) or added (one being drawn).
 */
export function drawingElements(drawings: ReadonlyArray<Drawing>, width: number, height: number, place?: PointPlace, chartFont?: string, drafts: ReadonlyArray<{ drawing: Drawing; drag: DrawingDrag }> = []): SceneElement[] {
  const live = new Map(drafts.map((x) => [x.drawing.id, x]));
  const list = [...drawings.map((d) => live.get(d.id)?.drawing ?? d), ...drafts.filter((x) => !drawings.some((d) => d.id === x.drawing.id)).map((x) => x.drawing)];
  return list.flatMap((d) => {
    const drag = live.get(d.id)?.drag;
    const pts: [P, P] | null = drag ? [drag.from, drag.to] : drawingPoints(d, width, height, place);
    if (!pts) return [];
    const g = drawingGeometry(d, pts[0], pts[1]);
    const opacity = d.opacity < 1 ? d.opacity : undefined;
    const dash = dashOf(d.lineStyle, d.widthPt);
    const cap = d.lineStyle === 'solid' ? 'round' : 'butt';
    const filled = g.closed && d.fill !== undefined;
    const children: SceneElement[] = [
      el('path', [['d', g.d], ['fill', 'transparent'], ['stroke', 'transparent'], ['stroke-width', n2(Math.max(10, d.widthPt + 8))]], { editorOnly: true, editorAttrs: [['pointer-events', g.closed && !filled ? 'stroke' : 'all']] }),
      el('path', [
        ['d', g.d],
        ['fill', filled ? d.fill : 'none'],
        ['fill-opacity', filled && (d.fillOpacity ?? 1) < 1 ? d.fillOpacity : undefined],
        ['stroke', d.widthPt > 0 ? d.color : 'none'],
        ['stroke-width', d.widthPt],
        ['stroke-opacity', opacity],
        ['stroke-dasharray', dash],
        ['stroke-linecap', cap],
        ['stroke-linejoin', 'round'],
      ]),
    ];
    if (g.caps !== '') children.push(el('path', [['d', g.caps], ['fill', 'none'], ['stroke', d.color], ['stroke-width', d.widthPt], ['stroke-opacity', opacity], ['stroke-linecap', 'butt']]));
    if (g.heads !== '') children.push(el('path', [['d', g.heads], ['fill', d.color], ['fill-opacity', opacity], ['stroke', 'none']]));
    if (g.text && d.text !== undefined && d.text !== '') {
      children.push(
        el('text', [['x', n2(g.text.x)], ['y', n2(g.text.y)], ['font-size', d.fontSizePt ?? 12], ['font-family', d.fontFamily ?? chartFont], ['font-weight', d.bold ? 'bold' : undefined], ['font-style', d.italic ? 'italic' : undefined], ['text-anchor', g.text.anchor], ['fill', d.textColor ?? d.color], ['fill-opacity', opacity]], { text: d.text }),
      );
    }
    // The handles of a selected object: its two points; dragging one moves that point only.
    const handle = (p: P, which: 'from' | 'to') =>
      el('rect', [['data-editor-only', 'true'], ['x', n2(p.x - 3.5)], ['y', n2(p.y - 3.5)], ['width', 7], ['height', 7], ['fill', '#ffffff'], ['stroke', SELECT_COLOR], ['stroke-width', 1.5]], {
        whenAnnotationSelected: d.id,
        hit: { kind: 'handle', objectId: d.id, handle: which },
        editorAttrs: [['class', 'drawing-handle']],
      });
    children.push(handle(pts[0], 'from'), handle(pts[1], 'to'));
    return [el('g', [], { hit: { kind: 'drawing', objectId: d.id }, id: svgId('drawing', d.id), children })];
  });
}

/**
 * What to store when the points of an object are put at new places on the page (pt): their fractions, and, for an object anchored to
 * data, their values on the axes there as well (as a moved text keeps them).
 */
export function drawingPatchForPoints(d: Drawing, from: P, to: P, width: number, height: number, placer?: AnnotationPlacer): Pick<Drawing, 'from' | 'to'> {
  const clamp = (v: number) => Math.min(1, Math.max(0, Math.round(v * 10000) / 10000));
  const point = (p: P, was: DrawingPoint): DrawingPoint => {
    const [xFrac, yFrac] = [clamp(p.x / width), clamp(p.y / height)];
    if (d.anchor !== 'data' || !placer) return { xFrac, yFrac };
    const moved = patchForMove({ ...was, anchor: 'data' }, placer, xFrac, yFrac);
    return { xFrac, yFrac, ...(moved.x !== undefined ? { x: moved.x } : was.x !== undefined ? { x: was.x } : {}), ...(moved.y !== undefined ? { y: moved.y } : was.y !== undefined ? { y: was.y } : {}) };
  };
  return { from: point(from, d.from), to: point(to, d.to) };
}

/** Where the points of an object are drawn now, pt (at their fractions when they have no place). */
export function drawnPoints(d: Drawing, width: number, height: number, placer?: AnnotationPlacer): [P, P] {
  const at = (p: DrawingPoint): P => {
    const f = placer ? drawnFractions(spotOf(d, p), placer) : null;
    return f ? { x: f.xFrac * width, y: f.yFrac * height } : { x: p.xFrac * width, y: p.yFrac * height };
  };
  return [at(d.from), at(d.to)];
}

/** The changes that move objects by a step (fractions of the size; an arrow key), each from where it is drawn. */
export function nudgeDrawings(drawings: readonly Drawing[], dx: number, dy: number, width: number, height: number, placer?: AnnotationPlacer): Array<{ id: string; patch: Pick<Drawing, 'from' | 'to'> }> {
  return drawings.map((d) => {
    const [a, b] = drawnPoints(d, width, height, placer);
    const [mx, my] = [dx * width, dy * height];
    return { id: d.id, patch: drawingPatchForPoints(d, { x: a.x + mx, y: a.y + my }, { x: b.x + mx, y: b.y + my }, width, height, placer) };
  });
}

/** Anchor an object to the data where it is drawn now, or put it back on the page there. Null when it cannot be done. */
export function changeDrawingAnchor(d: Drawing, to: 'page' | 'data', width: number, height: number, placer: AnnotationPlacer): Partial<Drawing> | null {
  if (to === (d.anchor === 'data' ? 'data' : 'page')) return {};
  const [a, b] = drawnPoints(d, width, height, placer);
  if (to === 'page') return { anchor: undefined, ...drawingPatchForPoints({ ...d, anchor: undefined }, a, b, width, height) };
  if (!placer.supportsData) return null;
  return { anchor: 'data', ...drawingPatchForPoints({ ...d, anchor: 'data' }, a, b, width, height, placer) };
}

/** The objects anchored to values that cannot be drawn (outside the axis range, or on a chart with no axes). */
export function skippedDrawings(drawings: readonly Drawing[], placer: AnnotationPlacer): Drawing[] {
  return drawings.filter((d) => d.anchor === 'data' && placer.skipped([spotOf(d, d.from), spotOf(d, d.to)]).length > 0);
}

