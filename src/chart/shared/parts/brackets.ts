import { BRACKET_LIFT_LIMIT } from '../../../model/graph/chartTypes';
import { n2 } from '../../../model/units';
import { hasMarkup, parseRichText } from '../../../util/richText';
import { el, type SceneElement } from '../scene/sceneElement';
import { svgId } from '../scene/svgIds';
import type { Orientation } from './orientation';

/** The distance between two baselines of a label of several lines, as a multiple of its size (the same as an annotation's). */
export const LABEL_LINE_HEIGHT = 1.2;

/** The lines of a label, which may hold line breaks; blank lines at its ends are not drawn. */
export function labelLines(label: string): string[] {
  return label.replace(/\r\n?/g, '\n').replace(/^\n+|\s+$/g, '').split('\n');
}

/** One comparison bracket in the vertical drawing of a chart over categories: its two ends across, the height of its bar, its look. */
export interface BracketGeom {
  id: string;
  label: string;
  /** The places of the two data sets across the chart, and the height of the bar (page coordinates of the vertical drawing). */
  x1: number;
  x2: number;
  y: number;
  /** How far the two ends reach down toward the data. */
  tick: number;
  color: string;
  widthPt: number;
  fontSizePt: number;
}

/** How far above its bar a label stands, in pt: a subscript sinks 0.28 em and its descender reaches 0.14 em lower, so it needs the room as well. */
function labelLift(label: string, fontSizePt: number): number {
  const sinks = hasMarkup(label) && parseRichText(label).some((r) => r.script === 'sub');
  return sinks ? Math.max(4, 0.42 * fontSizePt + 1.5) : 4;
}

/**
 * The brackets of a chart as scene elements: a bar with a short stem at each end, and its label centred above it (on a horizontal
 * chart: beside it, upright). Clipped to the plotting region. A bracket whose layer is hidden is not drawn.
 */
export function bracketElements(brackets: readonly BracketGeom[], orient: Orientation, hidden: ReadonlySet<string>): SceneElement[] {
  const shown = brackets.filter((b) => !hidden.has(`${b.id}:bracket`));
  if (shown.length === 0) return [];
  // What a press on a bracket reaches in the editor: its bar (with a wide transparent twin, since the line is thin) and its label.
  const hit = (b: BracketGeom) => ({ kind: 'bracket' as const, objectId: b.id });
  const bars = shown.flatMap((b) => {
    const d = `M${n2(b.x1)},${n2(b.y + b.tick)}V${n2(b.y)}H${n2(b.x2)}V${n2(b.y + b.tick)}`;
    return [
      el('path', [['d', d], ['fill', 'none'], ['stroke', b.color], ['stroke-width', b.widthPt], ['stroke-linecap', 'butt'], ['stroke-linejoin', 'miter']], { id: svgId(`${b.id}:bracket`, 'bar'), hit: hit(b) }),
      el('path', [['d', d], ['fill', 'none'], ['stroke', 'transparent'], ['stroke-width', Math.max(12, b.widthPt + 8)]], { editorOnly: true, hit: hit(b) }),
    ];
  });
  const labels = shown
    .filter((b) => b.label.trim() !== '')
    .flatMap((b) => {
      const at = orient.toScreen((b.x1 + b.x2) / 2, b.y);
      const common = [['font-size', b.fontSizePt], ['fill', b.color]] as const;
      const lines = labelLines(b.label);
      const step = b.fontSizePt * LABEL_LINE_HEIGHT;
      // The first line keeps the id the whole label had, so a label of one line is exactly what it was.
      const id = (i: number) => svgId(`${b.id}:bracket`, 'label', ...(i > 0 ? [i + 1] : []));
      return lines.map((line, i) =>
        orient.horizontal
          ? el('text', [['x', n2(at.x + 6)], ['y', n2(at.y + (i - (lines.length - 1) / 2) * step)], ['dy', '0.35em'], ['text-anchor', 'start'], ...common], { id: id(i), text: line, hit: hit(b) })
          // The last line stands where a label of one line stands, the others above it.
          : el('text', [['x', n2(at.x)], ['y', n2(at.y - labelLift(line, b.fontSizePt) - (lines.length - 1 - i) * step)], ['text-anchor', 'middle'], ...common], { id: id(i), text: line, hit: hit(b) }),
      );
    });
  return [el('g', [['clip-path', 'url(#plot-clip)']], { children: [...(orient.matrix ? [el('g', [['transform', orient.matrix]], { children: bars })] : bars), ...labels] })];
}

/** Where a bracket that was dragged ends up: its lift when the drag began plus the movement of the pointer in the direction away from the data (up on a chart over categories, right on a horizontal one and on an XY chart), to a tenth of a point and within the limit. */
export function liftAfterDrag(start: number, direction: 'up' | 'right', dx: number, dy: number): number {
  const moved = start + (direction === 'up' ? -dy : dx);
  return Math.max(-BRACKET_LIFT_LIMIT, Math.min(BRACKET_LIFT_LIMIT, Math.round(moved * 10) / 10));
}
