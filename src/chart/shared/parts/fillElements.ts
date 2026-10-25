import type { FillSpec } from '../model/fill';
import { legendKeyFill, resolveBarFill } from '../model/fill';
import type { ChartStyle } from '../model/types';
import { n2 } from '../model/units';
import { marksToPathData, patternMarks, type PatternMarks, type Rect } from './hatch';
import { LEGEND_KEY } from './layout';
import type { BarGeom } from './model';
import { el, type SceneElement } from './sceneElement';

/** Extra half-height (pt) of the editor-only hit rect over a bar that renders with no height. */
const ZERO_BAR_HIT_PAD_PT = 8;

/** Deterministic, XML-safe clip id for one fill: no randomness, no characters outside [A-Za-z0-9_-]. */
export function fillClipId(chartId: string, markId: string): string {
  return `fill-clip-${chartId}-${markId}`.replace(/[^A-Za-z0-9_-]/g, '_');
}

const rectAttrs = (r: Rect) => [['x', n2(r.x)], ['y', n2(r.y)], ['width', n2(r.width)], ['height', n2(r.height)]] as const;

/** Pattern background plus all marks as one path, clipped to bounds, under a single group opacity. */
function fillMarksElement(clipId: string, bounds: Rect | null, marks: PatternMarks | null, fill: FillSpec): SceneElement | null {
  if (!bounds) return null;
  const d = marks ? marksToPathData(marks) : '';
  if (!fill.background && !d) return null;
  return el('g', [['opacity', fill.opacity < 1 ? fill.opacity : undefined]], {
    editorAttrs: [['pointer-events', 'none']],
    children: [
      el('clipPath', [], { id: clipId, children: [el('rect', [...rectAttrs(bounds)])] }),
      ...(fill.background ? [el('rect', [...rectAttrs(bounds), ['fill', fill.background]])] : []),
      ...(d ? [el('path', [['class', 'fill-marks'], ['d', d], ['clip-path', `url(#${clipId})`], ['fill', 'none'], ['stroke', fill.patternColor], ['stroke-width', fill.markWidthPt], ['stroke-linecap', marks?.kind === 'dots' ? 'round' : 'butt']])] : []),
    ],
  });
}

/** Rectangle in pattern or none mode: marks (if any) under a frame rect that carries the border and the hit rules. */
function patternRectElement(p: { rect: Rect; clipId: string; bounds: Rect | null; marks: PatternMarks | null; fill: FillSpec; stroke: string; strokeWidth: number; strokeOpacity: number; hit?: SceneElement['hit'] }): SceneElement {
  const marks = p.fill.mode === 'pattern' ? fillMarksElement(p.clipId, p.bounds, p.marks, p.fill) : null;
  return el('g', [], {
    children: [
      ...(marks ? [marks] : []),
      el('rect', [...rectAttrs(p.rect), ['fill', 'none'], ['stroke', p.stroke], ['stroke-width', p.strokeWidth], ['stroke-opacity', p.strokeOpacity < 1 ? p.strokeOpacity : undefined], ['stroke-linejoin', 'miter']], { editorAttrs: [['pointer-events', 'all']], ...(p.hit ? { hit: p.hit } : {}) }),
    ],
  });
}

/** One bar. Solid mode is the exact legacy rect; a bar with no rendered height is a baseline stroke. */
export function barMarkElement(bar: BarGeom, chartId: string): SceneElement {
  const hit = { kind: 'bar' as const, groupId: bar.groupId, objectId: bar.id };
  if (Number(n2(bar.height)) === 0) {
    return el('g', [], {
      children: [
        el('path', [['d', `M${n2(bar.x)},${n2(bar.y)}h${n2(bar.width)}`], ['fill', 'none'], ['stroke', bar.stroke], ['stroke-width', bar.strokeWidth], ['stroke-opacity', bar.strokeOpacity < 1 ? bar.strokeOpacity : undefined], ['stroke-linecap', 'butt']]),
        el('rect', [['x', n2(bar.x)], ['y', n2(bar.y - ZERO_BAR_HIT_PAD_PT)], ['width', n2(bar.width)], ['height', 2 * ZERO_BAR_HIT_PAD_PT], ['fill', 'transparent']], { editorOnly: true, hit }),
      ],
    });
  }
  if (bar.fillSpec.mode === 'solid') {
    return el('rect', [...rectAttrs(bar), ['fill', bar.fill], ['fill-opacity', bar.opacity], ['stroke', bar.stroke], ['stroke-width', bar.strokeWidth], ['stroke-opacity', bar.strokeOpacity < 1 ? bar.strokeOpacity : undefined], ['stroke-linejoin', 'miter']], { hit });
  }
  return patternRectElement({ rect: bar, clipId: fillClipId(chartId, bar.id), bounds: bar.bounds, marks: bar.marks, fill: bar.fillSpec, stroke: bar.stroke, strokeWidth: bar.strokeWidth, strokeOpacity: bar.strokeOpacity, hit });
}

/** Legend key (36 x 20 pt): solid keeps the legacy rect, pattern and none show the fill at key scale. */
export function keyMarkElement(style: ChartStyle, x: number, y: number, chartId: string, groupId: string, width: number = LEGEND_KEY.width): SceneElement {
  const w = width;
  const fill = resolveBarFill(style);
  if (fill.mode === 'solid') {
    return el('rect', [['x', n2(x)], ['y', n2(y - 10)], ['width', w], ['height', 20], ['fill', style.barFill], ['fill-opacity', style.barOpacity], ['stroke', style.barBorderColor], ['stroke-width', style.barBorderWidthPt], ['stroke-opacity', style.barBorderOpacity < 1 ? style.barBorderOpacity : undefined]]);
  }
  const key = legendKeyFill(fill);
  const rect: Rect = { x, y: y - 10, width: w, height: 20 };
  const marks = key.mode === 'pattern' ? patternMarks(key.pattern, rect, { x: x + w / 2, y: y + 10 }, key.spacingPt) : null;
  return patternRectElement({ rect, clipId: fillClipId(chartId, `legend-${groupId}`), bounds: rect, marks, fill: key, stroke: style.barBorderColor, strokeWidth: style.barBorderWidthPt, strokeOpacity: style.barBorderOpacity });
}
