import { n2 } from '../../../model/units';
import { el, type SceneElement } from '../scene/sceneElement';
import { svgId } from '../scene/svgIds';
import type { Orientation } from './orientation';

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

/**
 * The brackets of a chart as scene elements: a bar with a short stem at each end, and its label centred above it (on a horizontal
 * chart: beside it, upright). Clipped to the plotting region. A bracket whose layer is hidden is not drawn.
 */
export function bracketElements(brackets: readonly BracketGeom[], orient: Orientation, hidden: ReadonlySet<string>): SceneElement[] {
  const shown = brackets.filter((b) => !hidden.has(`${b.id}:bracket`));
  if (shown.length === 0) return [];
  const bars = shown.map((b) =>
    el('path', [['d', `M${n2(b.x1)},${n2(b.y + b.tick)}V${n2(b.y)}H${n2(b.x2)}V${n2(b.y + b.tick)}`], ['fill', 'none'], ['stroke', b.color], ['stroke-width', b.widthPt], ['stroke-linecap', 'butt'], ['stroke-linejoin', 'miter']], { id: svgId(`${b.id}:bracket`, 'bar') }),
  );
  const labels = shown
    .filter((b) => b.label.trim() !== '')
    .map((b) => {
      const at = orient.toScreen((b.x1 + b.x2) / 2, b.y);
      const common = [['font-size', b.fontSizePt], ['fill', b.color]] as const;
      return orient.horizontal
        ? el('text', [['x', n2(at.x + 6)], ['y', n2(at.y)], ['dy', '0.35em'], ['text-anchor', 'start'], ...common], { id: svgId(`${b.id}:bracket`, 'label'), text: b.label })
        : el('text', [['x', n2(at.x)], ['y', n2(at.y - 4)], ['text-anchor', 'middle'], ...common], { id: svgId(`${b.id}:bracket`, 'label'), text: b.label });
    });
  return [el('g', [['clip-path', 'url(#plot-clip)']], { children: [...(orient.matrix ? [el('g', [['transform', orient.matrix]], { children: bars })] : bars), ...labels] })];
}
