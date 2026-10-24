import type { ReactElement } from 'react';
import type { FillSpec } from '../model/fill';
import { legendKeyFill, resolveBarFill } from '../model/fill';
import type { ChartStyle } from '../model/types';
import { n2 } from '../model/units';
import { marksToPathData, patternMarks, type PatternMarks, type Rect } from './hatch';
import { hitAttrs } from './hitTest';
import { LEGEND_KEY } from './layout';
import type { BarGeom } from './model';

/** Extra half-height (pt) of the editor-only hit rect over a bar that renders with no height. */
const ZERO_BAR_HIT_PAD_PT = 8;

/** Deterministic, XML-safe clip id for one fill: no randomness, no characters outside [A-Za-z0-9_-]. */
export function fillClipId(chartId: string, markId: string): string {
  return `fill-clip-${chartId}-${markId}`.replace(/[^A-Za-z0-9_-]/g, '_');
}

/** Pattern background plus all marks as one path, clipped to bounds, under a single group opacity. */
export function FillMarks({
  clipId,
  bounds,
  marks,
  fill,
  editor,
}: {
  clipId: string;
  bounds: Rect | null;
  marks: PatternMarks | null;
  fill: FillSpec;
  editor: boolean;
}): ReactElement | null {
  if (!bounds) return null;
  const d = marks ? marksToPathData(marks) : '';
  if (!fill.background && !d) return null;
  return (
    <g opacity={fill.opacity < 1 ? fill.opacity : undefined} pointerEvents={editor ? 'none' : undefined}>
      <clipPath id={clipId}>
        <rect x={n2(bounds.x)} y={n2(bounds.y)} width={n2(bounds.width)} height={n2(bounds.height)} />
      </clipPath>
      {fill.background && <rect x={n2(bounds.x)} y={n2(bounds.y)} width={n2(bounds.width)} height={n2(bounds.height)} fill={fill.background} />}
      {d && (
        <path
          className="fill-marks"
          d={d}
          clipPath={`url(#${clipId})`}
          fill="none"
          stroke={fill.patternColor}
          strokeWidth={fill.markWidthPt}
          strokeLinecap={marks?.kind === 'dots' ? 'round' : 'butt'}
        />
      )}
    </g>
  );
}

/** Rectangle in pattern or none mode: marks (if any) under a frame rect that carries the border and the hit rules. */
function PatternRect({
  rect,
  clipId,
  bounds,
  marks,
  fill,
  stroke,
  strokeWidth,
  editor,
  hit,
}: {
  rect: Rect;
  clipId: string;
  bounds: Rect | null;
  marks: PatternMarks | null;
  fill: FillSpec;
  stroke: string;
  strokeWidth: number;
  editor: boolean;
  hit?: Record<string, string>;
}): ReactElement {
  return (
    <g>
      {fill.mode === 'pattern' && <FillMarks clipId={clipId} bounds={bounds} marks={marks} fill={fill} editor={editor} />}
      <rect
        x={n2(rect.x)}
        y={n2(rect.y)}
        width={n2(rect.width)}
        height={n2(rect.height)}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="miter"
        pointerEvents={editor ? 'all' : undefined}
        {...hit}
      />
    </g>
  );
}

/** One bar. Solid mode is the exact legacy rect; a bar with no rendered height is a baseline stroke. */
export function BarMark({ bar, chartId, editor }: { bar: BarGeom; chartId: string; editor: boolean }): ReactElement {
  const hit = editor ? hitAttrs('bar', bar.groupId, bar.id) : undefined;
  if (Number(n2(bar.height)) === 0) {
    return (
      <g>
        <path d={`M${n2(bar.x)},${n2(bar.y)}h${n2(bar.width)}`} fill="none" stroke={bar.stroke} strokeWidth={bar.strokeWidth} strokeLinecap="butt" />
        {editor && (
          <rect
            x={n2(bar.x)}
            y={n2(bar.y - ZERO_BAR_HIT_PAD_PT)}
            width={n2(bar.width)}
            height={2 * ZERO_BAR_HIT_PAD_PT}
            fill="transparent"
            {...hit}
          />
        )}
      </g>
    );
  }
  if (bar.fillSpec.mode === 'solid') {
    return (
      <rect
        x={n2(bar.x)}
        y={n2(bar.y)}
        width={n2(bar.width)}
        height={n2(bar.height)}
        fill={bar.fill}
        fillOpacity={bar.opacity}
        stroke={bar.stroke}
        strokeWidth={bar.strokeWidth}
        strokeLinejoin="miter"
        {...hit}
      />
    );
  }
  return (
    <PatternRect
      rect={bar}
      clipId={fillClipId(chartId, bar.id)}
      bounds={bar.bounds}
      marks={bar.marks}
      fill={bar.fillSpec}
      stroke={bar.stroke}
      strokeWidth={bar.strokeWidth}
      editor={editor}
      hit={hit}
    />
  );
}

/** Legend key (36 x 20 pt): solid keeps the legacy rect, pattern and none show the fill at key scale. */
export function KeyMark({
  style,
  x,
  y,
  chartId,
  groupId,
  editor,
  width = LEGEND_KEY.width,
}: {
  style: ChartStyle;
  x: number;
  y: number;
  /** Width of the key, pt (a square key is narrower). */
  width?: number;
  chartId: string;
  groupId: string;
  editor: boolean;
}): ReactElement {
  const w = width;
  const fill = resolveBarFill(style);
  if (fill.mode === 'solid') {
    return (
      <rect
        x={n2(x)}
        y={n2(y - 10)}
        width={w}
        height={20}
        fill={style.barFill}
        fillOpacity={style.barOpacity}
        stroke={style.barBorderColor}
        strokeWidth={style.barBorderWidthPt}
      />
    );
  }
  const key = legendKeyFill(fill);
  const rect: Rect = { x, y: y - 10, width: w, height: 20 };
  const marks = key.mode === 'pattern' ? patternMarks(key.pattern, rect, { x: x + w / 2, y: y + 10 }, key.spacingPt) : null;
  return (
    <PatternRect
      rect={rect}
      clipId={fillClipId(chartId, `legend-${groupId}`)}
      bounds={rect}
      marks={marks}
      fill={key}
      stroke={style.barBorderColor}
      strokeWidth={style.barBorderWidthPt}
      editor={editor}
    />
  );
}
