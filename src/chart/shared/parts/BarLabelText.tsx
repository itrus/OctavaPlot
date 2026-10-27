import type { BarLabels } from '../../../model/types';
import { n2 } from '../../../model/units';
import type { BarLabelGeom, InsideLabelGeom } from './barLabels';
import type { Orientation } from './orientation';

/**
 * The label of one bar: centred above it (below a bar that points down), in the chart's text colour unless the labels
 * have their own. On a horizontal chart it sits beside the end of the bar instead, upright.
 */
export function BarLabelText({ label, cfg, textColor, orient }: { label: BarLabelGeom; cfg: BarLabels; textColor: string; orient?: Orientation }) {
  if (!orient || !orient.horizontal) {
    return (
      <text x={n2(label.x)} y={n2(label.y)} textAnchor="middle" fontSize={cfg.sizePt} fill={cfg.color ?? textColor}>
        {label.text}
      </text>
    );
  }
  // The text baseline of a label below a bar was lowered for upright text: undo that before turning the point.
  const at = orient.toScreen(label.x, label.up ? label.y : label.y - cfg.sizePt * 0.8);
  return (
    <text x={n2(at.x)} y={n2(at.y)} dy="0.35em" textAnchor={label.up ? 'start' : 'end'} fontSize={cfg.sizePt} fill={cfg.color ?? textColor}>
      {label.text}
    </text>
  );
}

/** The label inside a bar: centred across it, against its end or its base; on a horizontal chart it is upright and reads along the bar. */
export function InsideBarLabelText({ label, sizePt, orient }: { label: InsideLabelGeom; sizePt: number; orient?: Orientation }) {
  if (!orient || !orient.horizontal) {
    return (
      <text x={n2(label.x)} y={n2(label.y)} textAnchor="middle" fontSize={sizePt} fill={label.color}>
        {label.text}
      </text>
    );
  }
  const at = orient.toScreen(label.x, label.y);
  return (
    <text x={n2(at.x)} y={n2(at.y)} dy="0.35em" textAnchor={label.anchor} fontSize={sizePt} fill={label.color}>
      {label.text}
    </text>
  );
}
