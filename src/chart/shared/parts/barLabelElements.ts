import type { BarLabels } from '../../../model/types';
import { n2 } from '../../../model/units';
import { el, type SceneElement } from '../scene/sceneElement';
import type { BarLabelGeom, InsideLabelGeom } from './barLabels';
import type { Orientation } from './orientation';

/**
 * The label of one bar as a scene element: centred above it (below a bar that points down), in the chart's text colour unless
 * the labels have their own. On a horizontal chart it sits beside the end of the bar instead, upright.
 */
export function barLabelElement(label: BarLabelGeom, cfg: BarLabels, textColor: string, orient?: Orientation, id?: string): SceneElement {
  const fill = cfg.color ?? textColor;
  if (!orient || !orient.horizontal) return el('text', [['x', n2(label.x)], ['y', n2(label.y)], ['text-anchor', 'middle'], ['font-size', cfg.sizePt], ['fill', fill]], { text: label.text, id });
  // The text baseline of a label below a bar was lowered for upright text: undo that before turning the point.
  const at = orient.toScreen(label.x, label.up ? label.y : label.y - cfg.sizePt * 0.8);
  return el('text', [['x', n2(at.x)], ['y', n2(at.y)], ['dy', '0.35em'], ['text-anchor', label.up ? 'start' : 'end'], ['font-size', cfg.sizePt], ['fill', fill]], { text: label.text, id });
}

/** The label inside a bar: centred across it, against its end or its base; on a horizontal chart it is upright and reads along the bar. */
export function insideBarLabelElement(label: InsideLabelGeom, sizePt: number, orient?: Orientation, id?: string): SceneElement {
  if (!orient || !orient.horizontal) return el('text', [['x', n2(label.x)], ['y', n2(label.y)], ['text-anchor', 'middle'], ['font-size', sizePt], ['fill', label.color]], { text: label.text, id });
  const at = orient.toScreen(label.x, label.y);
  return el('text', [['x', n2(at.x)], ['y', n2(at.y)], ['dy', '0.35em'], ['text-anchor', label.anchor], ['font-size', sizePt], ['fill', label.color]], { text: label.text, id });
}
