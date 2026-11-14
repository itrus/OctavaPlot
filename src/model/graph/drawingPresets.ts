import type { Drawing, DrawingPoint, LineEnd, LineRoute } from '../types';
import { newId } from '../ids';

/**
 * The drawing objects the toolbar offers, in three groups: shapes, lines, and lines with a text. Each is a starting point; after it is
 * placed every setting can be changed (the ends, the route, the corners, the text). A preset says how a drag on the chart or page is
 * turned into the two points of the object: lines follow the drag (some only across or only down), shapes fill the box of the drag,
 * and a bent line goes between two corners of that box.
 */

export type DrawingGroup = 'shapes' | 'lines' | 'text';

/** How the two points of an object are taken from the box of a drag: as dragged, or from two of its corners. */
type Corners = 'drag' | 'tl-br' | 'bl-tr';

export interface DrawingPreset {
  id: string;
  group: DrawingGroup;
  label: string;
  shape: Drawing['shape'];
  /** Keep the drag along one direction only (a bracket across, a side bracket down), or keep the box square (a circle). */
  lock?: 'across' | 'down' | 'square';
  corners: Corners;
  route?: LineRoute;
  start?: LineEnd;
  end?: LineEnd;
  endSizePt?: number;
  cornerPt?: number;
  /** The size of the object placed by a click without a drag, pt: across and down. */
  click: [number, number];
}

const LINE_CLICK: [number, number] = [72, 0];
const DOWN_CLICK: [number, number] = [0, 48];

/** The lines, as they come in the Lines group; the Lines with text group repeats them with a text. */
const LINES: ReadonlyArray<Omit<DrawingPreset, 'group' | 'id'> & { key: string }> = [
  { key: 'line', label: 'Line', shape: 'line', corners: 'drag', click: LINE_CLICK },
  { key: 'arrow', label: 'Arrow', shape: 'line', corners: 'drag', end: 'arrow', click: LINE_CLICK },
  { key: 'double', label: 'Double arrow', shape: 'line', corners: 'drag', start: 'arrow', end: 'arrow', click: LINE_CLICK },
  { key: 'caps', label: 'Line with end caps', shape: 'line', corners: 'drag', start: 'bar', end: 'bar', click: LINE_CLICK },
  { key: 'bracket', label: 'Bracket', shape: 'line', lock: 'across', corners: 'drag', start: 'tick', end: 'tick', endSizePt: 5, click: LINE_CLICK },
  { key: 'capEnd', label: 'Line with a cap at the end', shape: 'line', corners: 'drag', end: 'bar', click: LINE_CLICK },
  { key: 'step', label: 'Bracket with ticks on both sides', shape: 'line', lock: 'across', corners: 'drag', start: 'tick', end: 'tickFlip', endSizePt: 8, click: LINE_CLICK },
  { key: 'right', label: 'Side bracket, open to the left', shape: 'line', lock: 'down', corners: 'drag', start: 'tick', end: 'tick', endSizePt: 5, click: DOWN_CLICK },
  { key: 'left', label: 'Side bracket, open to the right', shape: 'line', lock: 'down', corners: 'drag', start: 'tickFlip', end: 'tickFlip', endSizePt: 5, click: DOWN_CLICK },
  { key: 'tall', label: 'Tall bracket', shape: 'line', lock: 'across', corners: 'drag', start: 'tick', end: 'tick', endSizePt: 12, click: LINE_CLICK },
  { key: 'cup', label: 'Bracket open upwards', shape: 'line', lock: 'across', corners: 'drag', start: 'tickFlip', end: 'tickFlip', endSizePt: 8, click: LINE_CLICK },
];

const BOX_CLICK: [number, number] = [72, 48];
const ELBOW_CLICK: [number, number] = [60, 36];

export const DRAWING_PRESETS: readonly DrawingPreset[] = [
  { id: 'circle', group: 'shapes', label: 'Circle', shape: 'ellipse', lock: 'square', corners: 'drag', click: [48, 48] },
  { id: 'ellipse', group: 'shapes', label: 'Ellipse', shape: 'ellipse', corners: 'drag', click: BOX_CLICK },
  { id: 'arc', group: 'shapes', label: 'Arc', shape: 'arc', corners: 'bl-tr', click: [48, 48] },
  { id: 'square', group: 'shapes', label: 'Square', shape: 'rect', lock: 'square', corners: 'drag', click: [48, 48] },
  { id: 'rect', group: 'shapes', label: 'Rectangle', shape: 'rect', corners: 'drag', click: BOX_CLICK },
  { id: 'rounded', group: 'shapes', label: 'Rounded rectangle', shape: 'rect', corners: 'drag', cornerPt: 8, click: BOX_CLICK },
  { id: 'elbowUp', group: 'shapes', label: 'Bent line, up then across', shape: 'line', corners: 'bl-tr', route: 'vh', click: ELBOW_CLICK },
  { id: 'elbowDown', group: 'shapes', label: 'Bent line, across then down', shape: 'line', corners: 'tl-br', route: 'hv', click: ELBOW_CLICK },
  { id: 'elbowArrowUp', group: 'shapes', label: 'Bent arrow, across then up', shape: 'line', corners: 'bl-tr', route: 'hv', end: 'arrow', click: ELBOW_CLICK },
  { id: 'elbowArrowDown', group: 'shapes', label: 'Bent arrow, down then across', shape: 'line', corners: 'tl-br', route: 'vh', end: 'arrow', click: ELBOW_CLICK },
  { id: 'elbowArrows', group: 'shapes', label: 'Bent double arrow', shape: 'line', corners: 'tl-br', route: 'vh', start: 'arrow', end: 'arrow', click: ELBOW_CLICK },
  ...LINES.map(({ key, ...p }) => ({ ...p, id: key, group: 'lines' as const })),
  ...LINES.map(({ key, ...p }) => ({ ...p, id: `${key}Text`, group: 'text' as const, label: `${p.label} with text` })),
];

export const DRAWING_GROUPS: ReadonlyArray<{ id: DrawingGroup; label: string }> = [
  { id: 'shapes', label: 'Shapes' },
  { id: 'lines', label: 'Lines' },
  { id: 'text', label: 'Lines with text' },
];

export const presetById = (id: string): DrawingPreset | undefined => DRAWING_PRESETS.find((p) => p.id === id);

/** The look a new object takes: the colour of the texts of the chart (or black on a page), the width of its line (see DRAWING_WIDTH; 1 pt when absent), and the size of the numbers of the chart (or 12 pt). */
export interface DrawingLook {
  color: string;
  fontSizePt: number;
  widthPt?: number;
}

/**
 * The two points of an object from a drag on the chart or page, pt (`a` where it was pressed, `b` where it is now). A drag of less than
 * 3 pt is a click: the object is placed there at its own size.
 */
/** The width a new object's line has, pt: on a graph, and on a page layout (which is printed at its real size). */
export const DRAWING_WIDTH = { chart: 4, page: 4 } as const;

/** How close to across or to up and down (degrees) a line is put straight across or straight down. */
const SNAP_DEGREES = 5;

/** The end `b` of a line from `a`, put straight across or straight down when the line is within SNAP_DEGREES of it. */
export function snapToAxis(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number } {
  const [dx, dy] = [Math.abs(b.x - a.x), Math.abs(b.y - a.y)];
  if (dx === 0 && dy === 0) return b;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  return angle < SNAP_DEGREES ? { x: b.x, y: a.y } : angle > 90 - SNAP_DEGREES ? { x: a.x, y: b.y } : b;
}

export function pointsOfDrag(preset: DrawingPreset, a: { x: number; y: number }, b: { x: number; y: number }): [{ x: number; y: number }, { x: number; y: number }] {
  let end = b;
  if (Math.hypot(b.x - a.x, b.y - a.y) < 3) end = { x: a.x + preset.click[0], y: a.y + preset.click[1] };
  if (preset.lock === 'across') end = { x: end.x, y: a.y };
  else if (preset.lock === 'down') end = { x: a.x, y: end.y };
  else if (preset.lock === 'square') {
    const side = Math.max(Math.abs(end.x - a.x), Math.abs(end.y - a.y));
    end = { x: a.x + Math.sign(end.x - a.x || 1) * side, y: a.y + Math.sign(end.y - a.y || 1) * side };
  }
  // A straight line close to across or to up and down is put exactly so.
  if (preset.shape === 'line' && !preset.lock && !preset.route && preset.corners === 'drag') end = snapToAxis(a, end);
  if (preset.corners === 'drag') return [a, end];
  const [l, r] = [Math.min(a.x, end.x), Math.max(a.x, end.x)];
  const [t, bt] = [Math.min(a.y, end.y), Math.max(a.y, end.y)];
  return preset.corners === 'tl-br' ? [{ x: l, y: t }, { x: r, y: bt }] : [{ x: l, y: bt }, { x: r, y: t }];
}

/** A new object of a preset between two points (fractions of the chart or page), on the page (not anchored to data). */
export function createDrawing(preset: DrawingPreset, from: DrawingPoint, to: DrawingPoint, look: DrawingLook, id: string = newId('drw')): Drawing {
  const width = clampDrawing('widthPt', look.widthPt ?? 1);
  return {
    id,
    shape: preset.shape,
    from: { xFrac: from.xFrac, yFrac: from.yFrac },
    to: { xFrac: to.xFrac, yFrac: to.yFrac },
    ...(preset.route && preset.route !== 'straight' ? { route: preset.route } : {}),
    ...(preset.start && preset.start !== 'none' ? { start: preset.start } : {}),
    ...(preset.end && preset.end !== 'none' ? { end: preset.end } : {}),
    // The ticks of a bracket grow with the square root of the width of the line, so that a heavy line has them in proportion.
    ...(preset.endSizePt !== undefined ? { endSizePt: Number((preset.endSizePt * Math.max(1, Math.sqrt(width))).toFixed(1)) } : {}),
    ...(preset.cornerPt !== undefined ? { cornerPt: preset.cornerPt } : {}),
    color: look.color,
    opacity: 1,
    widthPt: width,
    lineStyle: 'solid',
    ...(preset.group === 'text' ? { text: 'ns', fontSizePt: look.fontSizePt, bold: true } : {}),
  };
}

/** What an object is called in the settings: the name of the preset it matches, else what it is. */
export function drawingName(d: Drawing): string {
  if (d.shape === 'ellipse') return 'Ellipse';
  if (d.shape === 'arc') return 'Arc';
  if (d.shape === 'rect') return (d.cornerPt ?? 0) > 0 ? 'Rounded rectangle' : 'Rectangle';
  const route = d.route ?? 'straight';
  const group: DrawingGroup = d.text !== undefined ? 'text' : route === 'straight' ? 'lines' : 'shapes';
  const same = DRAWING_PRESETS.filter((p) => p.group === group && p.shape === 'line' && (p.route ?? 'straight') === route && (p.start ?? 'none') === (d.start ?? 'none') && (p.end ?? 'none') === (d.end ?? 'none'));
  const best = same.find((p) => p.endSizePt === d.endSizePt) ?? same[0];
  return best?.label ?? (d.text !== undefined ? 'Line with text' : 'Line');
}

/** Limits of the settings of an object, as a typed value is held to them and a file is read. */
export const DRAWING_LIMITS = {
  widthPt: { min: 0.25, max: 20 },
  endSizePt: { min: 1, max: 40 },
  cornerPt: { min: 0, max: 100 },
  fontSizePt: { min: 4, max: 72 },
  textGapPt: { min: 0, max: 40 },
} as const;

/** The default length of the ends of a line, pt: an arrowhead grows with the width of the line. */
export const endSizeOf = (d: Pick<Drawing, 'endSizePt' | 'widthPt'>, kind: LineEnd): number =>
  d.endSizePt ?? (kind === 'arrow' ? Math.max(6, d.widthPt * 3) : kind === 'bar' ? Math.max(8, d.widthPt * 3) : Math.max(6, d.widthPt * 2.5));

/** A setting of an object held to its limits (a typed value, a value read from a file). */
export const clampDrawing = (key: keyof typeof DRAWING_LIMITS, v: number): number => Math.min(DRAWING_LIMITS[key].max, Math.max(DRAWING_LIMITS[key].min, v));
