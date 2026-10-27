import type { Annotation } from '../../../model/types';
import { extent } from '../../../model/units';
import { insideAxis, type ModelOfFamily } from './referenceLines';

/** Where on the page (pt) a text annotation goes (its top-left corner); null when it has no place and is not drawn. */
type AnnotationPlace = (a: Annotation) => { x: number; y: number } | null;

export interface AnnotationPlacer {
  /** The size of the page, pt. */
  widthPt: number;
  heightPt: number;
  /** On a chart over categories, the page coordinate that stays a fraction of the page when the annotation is anchored to data: the one across the categories. Null on an XY chart (both are data). */
  acrossPage: 'x' | 'y' | null;
  /** Whether this kind of chart has axes to anchor an annotation to (a pie or a heat map has none). */
  supportsData: boolean;
  /** Whether the X axis is numeric (XY, survival, histogram); on a chart over categories only the value axis is. */
  numericX: boolean;
  /** The drawn position of an annotation: its page position, or the one its data values give. */
  place: AnnotationPlace;
  /** The data values at a position of the page (pt): the inverse of `place`; each is absent where the chart has no such axis. */
  fromPage: (xPt: number, yPt: number) => { x?: number; y?: number };
  /** The data-anchored annotations that cannot be drawn: out of the axis range, in a gap of a broken axis, or on a chart with no axes. */
  skipped: (annotations: readonly Annotation[]) => Annotation[];
}

interface Axis {
  domain: [number, number];
  log?: boolean;
  segments?: unknown;
  reverse?: boolean;
}

/** A value of a data axis to a position, and back. The map may be flat inside a gap of a broken axis, but never turns round. */
interface AxisMap {
  axis: Axis;
  to: (v: number) => number;
}

const significant = (v: number): number => Number(v.toPrecision(6));

/** The value whose position is `at`, found by halving the axis range (a map is monotonic, but may be reversed, logarithmic or broken). */
function invert(map: AxisMap, at: number): number {
  const [lo, hi] = extent(map.axis.domain);
  const log = !!map.axis.log && lo > 0;
  const f = (t: number) => map.to(log ? Math.exp(t) : t);
  let a = log ? Math.log(lo) : lo;
  let b = log ? Math.log(hi) : hi;
  const rising = f(b) >= f(a);
  for (let i = 0; i < 80; i++) {
    const mid = (a + b) / 2;
    if (f(mid) < at === rising) a = mid;
    else b = mid;
  }
  const t = (a + b) / 2;
  return significant(log ? Math.exp(t) : t);
}

const isData = (a: Annotation): boolean => a.anchor === 'data';

/** The position a page-anchored annotation has: its fractions of the page. */
const onPage = (a: Annotation, w: number, h: number) => ({ x: a.xFrac * w, y: a.yFrac * h });

/**
 * Where annotations go on a chart. An annotation with the page anchor is at its fractions of the page; with the data anchor it is
 * at its values on the axes, so it follows the axis range, a log scale and breaks. A value outside the axis range (or in a gap of a
 * broken axis) has no place: the annotation is not drawn and is reported, as a reference line is, never moved to the edge. On a
 * chart over categories only the value axis can be anchored; across the categories the page fraction is used.
 */
export function annotationPlacer(any: ModelOfFamily, widthPt: number, heightPt: number): AnnotationPlacer {
  switch (any.family) {
    case 'xy':
    case 'survival':
    case 'histogram': {
      const m = any.model;
      const xm: AxisMap = { axis: m.x as Axis, to: m.xScale };
      const ym: AxisMap = { axis: m.y as Axis, to: m.yScale };
      const spot = (a: Annotation) => {
        const x = a.x !== undefined ? xm.to(a.x) : undefined;
        const y = a.y !== undefined ? ym.to(a.y) : undefined;
        return { x, y, okX: a.x === undefined || (insideAxis(m.x, a.x) && Number.isFinite(x)), okY: a.y === undefined || (insideAxis(m.y, a.y) && Number.isFinite(y)) };
      };
      return {
        widthPt,
        heightPt,
        acrossPage: null,
        supportsData: true,
        numericX: true,
        place: (a) => {
          if (!isData(a)) return onPage(a, widthPt, heightPt);
          const s = spot(a);
          return s.okX && s.okY ? { x: s.x ?? a.xFrac * widthPt, y: s.y ?? a.yFrac * heightPt } : null;
        },
        fromPage: (xPt, yPt) => ({ x: invert(xm, xPt), y: invert(ym, yPt) }),
        skipped: (list) => list.filter((a) => isData(a) && !(spot(a).okX && spot(a).okY)),
      };
    }
    case 'column':
    case 'grouped': {
      const m = any.model;
      const horizontal = m.orient.horizontal;
      // The value axis, as a position along the page (across for a horizontal chart).
      const along = (v: number) => (horizontal ? m.orient.toScreen(0, m.yScale(v)).x : m.yScale(v));
      const ym: AxisMap = { axis: m.y as Axis, to: along };
      const ok = (a: Annotation) => a.y === undefined || (insideAxis(m.y, a.y) && Number.isFinite(along(a.y)));
      return {
        widthPt,
        heightPt,
        acrossPage: horizontal ? 'y' : 'x',
        supportsData: true,
        numericX: false,
        place: (a) => {
          if (!isData(a)) return onPage(a, widthPt, heightPt);
          if (!ok(a)) return null;
          // Across the categories the page fraction stands; the value axis gives the other coordinate.
          return a.y === undefined ? onPage(a, widthPt, heightPt) : horizontal ? { x: along(a.y), y: a.yFrac * heightPt } : { x: a.xFrac * widthPt, y: along(a.y) };
        },
        fromPage: (xPt, yPt) => ({ y: invert(ym, horizontal ? xPt : yPt) }),
        skipped: (list) => list.filter((a) => isData(a) && !ok(a)),
      };
    }
    default:
      // No axes: an annotation stays where the page puts it; one anchored to data has nowhere to go.
      return { widthPt, heightPt, acrossPage: null, supportsData: false, numericX: false, place: (a) => (isData(a) ? null : onPage(a, widthPt, heightPt)), fromPage: () => ({}), skipped: (list) => list.filter(isData) };
  }
}

/** Notices for annotations that were left out, worded like those of the reference lines. */
export function annotationNotices(skipped: readonly Annotation[], supportsData: boolean): string[] {
  const n = skipped.length;
  if (n === 0) return [];
  return [
    supportsData
      ? `${n} annotation${n === 1 ? ' is' : 's are'} anchored to values outside the axis range (or in a gap of a broken axis) and ${n === 1 ? 'is' : 'are'} not drawn.`
      : `${n} annotation${n === 1 ? ' is' : 's are'} anchored to data, which this chart has no axes for, and ${n === 1 ? 'is' : 'are'} not drawn.`,
  ];
}

/** The position an annotation is drawn at, as fractions of the page; null when it is not drawn. */
export function drawnFractions(a: Annotation, placer: AnnotationPlacer): { xFrac: number; yFrac: number } | null {
  const at = placer.place(a);
  return at ? { xFrac: at.x / placer.widthPt, yFrac: at.y / placer.heightPt } : null;
}

/**
 * What to store when an annotation is moved to a place on the page (a drag, an arrow key): the new fractions, and for a data-anchored
 * annotation the values on the axes at that place as well, so the text stays where it was put whatever the axes do later.
 */
export function patchForMove(a: Annotation, placer: AnnotationPlacer, xFrac: number, yFrac: number): Partial<Annotation> {
  if (a.anchor !== 'data') return { xFrac, yFrac };
  const v = placer.fromPage(xFrac * placer.widthPt, yFrac * placer.heightPt);
  return { xFrac, yFrac, ...(placer.numericX && v.x !== undefined ? { x: v.x } : {}), ...(v.y !== undefined ? { y: v.y } : {}) };
}

/** Anchor an annotation to the data where it is now drawn, or put it back on the page there, so it does not jump. Null when it cannot be done (nothing is drawn). */
export function changeAnchor(a: Annotation, placer: AnnotationPlacer, to: 'page' | 'data'): Partial<Annotation> | null {
  if (to === (a.anchor === 'data' ? 'data' : 'page')) return {};
  const at = drawnFractions({ ...a, anchor: undefined }, placer) ?? { xFrac: a.xFrac, yFrac: a.yFrac };
  if (to === 'page') {
    const now = drawnFractions(a, placer) ?? at;
    return { anchor: undefined, x: undefined, y: undefined, xFrac: Math.min(1, Math.max(0, now.xFrac)), yFrac: Math.min(1, Math.max(0, now.yFrac)) };
  }
  if (!placer.supportsData) return null;
  const v = placer.fromPage(a.xFrac * placer.widthPt, a.yFrac * placer.heightPt);
  return { anchor: 'data', ...(placer.numericX && v.x !== undefined ? { x: v.x } : {}), ...(v.y !== undefined ? { y: v.y } : {}) };
}
