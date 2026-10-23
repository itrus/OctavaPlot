import type { Annotation, AxisConfig, BreakMark, Chart, Selection } from '../model/types';
import { n2 } from '../model/units';
import type { hitAttrs } from './hitTest';
import type { Layout, Rect } from './layout';
import { majorStepOf, type YAxisScale } from './scales';
import { measureText } from './text';

/** Pieces every kind of chart draws the same way: the backgrounds, the clip of the plotting region, the frame and the titles. */

/** Colour of the editor's selection outlines (never drawn in an export). */
export const SELECT_COLOR = '#2b7fff';

/** The editor's hit attributes of a mark; empty when the chart is drawn for export. */
type HitProps = (kind: Parameters<typeof hitAttrs>[0], groupId?: string, objectId?: string, axis?: string) => Record<string, unknown>;

/** The clip of the plotting region that the data marks use (`url(#plot-clip)`). */
export function PlotClip({ plot, xPieces, yPieces }: { plot: Rect; xPieces?: Array<[number, number]> | null; yPieces?: Array<[number, number]> | null }) {
  // A broken axis leaves its gaps out of the clip, so what is drawn across a gap is cut off there.
  const xs = xPieces ?? [[plot.x, plot.x + plot.width] as [number, number]];
  const ys = yPieces ?? [[plot.y, plot.y + plot.height] as [number, number]];
  return (
    <defs>
      <clipPath id="plot-clip">
        {xs.flatMap(([x0, x1]) => ys.map(([y0, y1]) => <rect key={`${x0}:${y0}`} x={n2(x0)} y={n2(y0)} width={n2(x1 - x0)} height={n2(y1 - y0)} />))}
      </clipPath>
    </defs>
  );
}

/** Path data of an axis line from `from` to `to` at `fixed` across it; a broken axis is drawn in its pieces, with no line in the gaps. */
export function axisLineD(along: 'x' | 'y', fixed: number, from: number, to: number, pieces?: Array<[number, number]> | null): string {
  const ranges = pieces ?? [[from, to] as [number, number]];
  return ranges.map(([a, b]) => (along === 'y' ? `M${n2(fixed)},${n2(a)}V${n2(b)}` : `M${n2(a)},${n2(fixed)}H${n2(b)}`)).join('');
}

const MARK_HALF = 4;
const MARK_SLANT = 3;

/** The marks at the ends of the gaps of a broken axis: one slash or two, across the axis line. */
export function BreakMarks({ along, fixed, gaps, mark, color, width }: { along: 'x' | 'y'; fixed: number; gaps: Array<[number, number]>; mark: BreakMark; color: string; width: number }) {
  if (mark === 'none' || gaps.length === 0) return null;
  const slash = (p: number, shift: number) =>
    along === 'y' ? `M${n2(fixed - MARK_HALF)},${n2(p + shift + MARK_SLANT)}L${n2(fixed + MARK_HALF)},${n2(p + shift - MARK_SLANT)}` : `M${n2(p + shift - MARK_SLANT)},${n2(fixed + MARK_HALF)}L${n2(p + shift + MARK_SLANT)},${n2(fixed - MARK_HALF)}`;
  const at = gaps.flatMap(([a, b]) => [a, b]);
  const d = at.map((p) => (mark === 'doubleSlash' ? slash(p, -1.5) + slash(p, 1.5) : slash(p, 0))).join('');
  return <path d={d} stroke={color} strokeWidth={width} fill="none" strokeLinecap="butt" />;
}

/** The chart background is the hit target for chart-level selection; the plotting region has its own colour. */
export function Backgrounds({ chart, width, height, plot, hit }: { chart: Chart; width: number; height: number; plot: Rect; hit: HitProps }) {
  return (
    <>
      <rect x={0} y={0} width={n2(width)} height={n2(height)} fill={chart.pageColor ?? '#ffffff'} fillOpacity={chart.pageColor ? undefined : 0} {...hit('background')} />
      <rect x={n2(plot.x)} y={n2(plot.y)} width={n2(plot.width)} height={n2(plot.height)} fill={chart.plotColor ?? '#ffffff'} fillOpacity={chart.plotColor ? undefined : 0} {...hit('background')} />
    </>
  );
}

/** A box round the plotting region, when the chart asks for one. */
export function FrameBox({ chart, plot, lineWidthPt }: { chart: Chart; plot: Rect; lineWidthPt: number }) {
  if (chart.frame !== 'box') return null;
  return <rect x={n2(plot.x)} y={n2(plot.y)} width={n2(plot.width)} height={n2(plot.height)} fill="none" stroke={chart.axisColor} strokeWidth={lineWidthPt} />;
}

/**
 * The chart title and the titles of the axes. `bottom` and `left` are the settings of the axes drawn along the bottom and
 * down the left (on a horizontal chart those are the value and the category axis); `right` is the right-hand Y axis, if drawn.
 */
export function ChartTitles({ chart, layout, bottom, left, right, hit }: { chart: Chart; layout: Layout; bottom: AxisConfig; left: AxisConfig; right?: AxisConfig | null; hit: HitProps }) {
  const weight = (bold: boolean) => (bold ? 'bold' : undefined);
  const turned = (t: { x: number; y: number }) => `rotate(-90 ${n2(t.x)} ${n2(t.y)})`;
  return (
    <>
      {layout.title && (
        <text x={n2(layout.title.x)} y={n2(layout.title.y)} textAnchor="middle" fontSize={layout.title.fontSizePt} fontWeight={weight(chart.titleBold)} fill={chart.textColor} {...hit('title')}>
          {chart.title}
        </text>
      )}
      {layout.xTitle && (
        <text x={n2(layout.xTitle.x)} y={n2(layout.xTitle.y)} textAnchor="middle" fontSize={bottom.titleFontSizePt} fontWeight={weight(bottom.titleBold)} fill={chart.textColor} {...hit('title')}>
          {bottom.title}
        </text>
      )}
      {layout.yTitle && (
        <text x={n2(layout.yTitle.x)} y={n2(layout.yTitle.y)} textAnchor="middle" transform={turned(layout.yTitle)} fontSize={left.titleFontSizePt} fontWeight={weight(left.titleBold)} fill={chart.textColor} {...hit('title')}>
          {left.title}
        </text>
      )}
      {right && layout.y2Title && (
        <text x={n2(layout.y2Title.x)} y={n2(layout.y2Title.y)} textAnchor="middle" transform={turned(layout.y2Title)} fontSize={right.titleFontSizePt} fontWeight={weight(right.titleBold)} fill={chart.textColor} {...hit('title')}>
          {right.title}
        </text>
      )}
    </>
  );
}

/** What the editor adds to a drawing: the selection, and an annotation being dragged. Absent when a chart is exported. */
export interface EditorState {
  selection: Selection;
  /** Annotation being dragged: its live position (fractions) overrides the stored one. */
  dragging?: { id: string; xFrac: number; yFrac: number } | null;
}

function annotationBox(a: Annotation, x: number, y: number) {
  const lines = a.text.split('\n');
  const w = Math.max(...lines.map((l) => measureText(l, a.fontSizePt)), 4);
  const h = lines.length * a.fontSizePt * 1.2;
  return { x, y, w, h, lines };
}

/** The text annotations of a chart, positioned as fractions of its size. */
export function AnnotationLayer({ chart, editor, width, height, hit }: { chart: Chart; editor?: EditorState; width: number; height: number; hit: HitProps }) {
  const ed = !!editor;
  const selected = editor?.selection.kind === 'annotation' ? editor.selection.annotationId : null;
  return (
    <>
      {chart.annotations.map((a) => {
        const drag = editor?.dragging?.id === a.id ? editor.dragging : null;
        const x = (drag ? drag.xFrac : a.xFrac) * width;
        const y = (drag ? drag.yFrac : a.yFrac) * height;
        const box = annotationBox(a, x, y);
        return (
          <g key={a.id} {...hit('annotation', undefined, undefined, a.id)}>
            {ed && <rect x={n2(box.x - 3)} y={n2(box.y - 3)} width={n2(box.w + 6)} height={n2(box.h + 6)} fill="transparent" />}
            <text x={n2(x)} fontSize={a.fontSizePt} fill={a.color}>
              {box.lines.map((line, i) => (
                <tspan key={i} x={n2(x)} y={n2(y + a.fontSizePt * 0.9 + i * a.fontSizePt * 1.2)}>
                  {line === '' ? ' ' : line}
                </tspan>
              ))}
            </text>
            {selected === a.id && (
              <rect data-editor-only x={n2(box.x - 3)} y={n2(box.y - 3)} width={n2(box.w + 6)} height={n2(box.h + 6)} fill="none" stroke={SELECT_COLOR} strokeWidth={1} strokeDasharray="3 2" pointerEvents="none" />
            )}
          </g>
        );
      })}
    </>
  );
}

/** Gap between a scale bar and the corner of the plotting region it stands in, pt. */
const BAR_INSET = 10;

/**
 * The scale bar of a hidden axis: a line as long as one major tick interval, with that interval written beside it, in
 * the lower left corner of the plotting region. `along` is the direction the axis runs; `map` its mapping to the page.
 */
export function ScaleBar({ chart, axis, along, scale, map, plot }: { chart: Chart; axis: AxisConfig; along: 'x' | 'y'; scale: YAxisScale; map: (v: number) => number; plot: Rect }) {
  if (axis.visible || !axis.scaleBar || scale.log) return null;
  const step = majorStepOf(scale);
  const lo = Math.min(scale.domain[0], scale.domain[1]);
  const length = Math.abs(map(lo + step) - map(lo));
  if (!(length > 0) || !Number.isFinite(length)) return null;
  const label = scale.tickLabel(step);
  const x0 = plot.x + BAR_INSET;
  const yBottom = plot.y + plot.height - BAR_INSET;
  const font = axis.tickFontSizePt;
  const stroke = { stroke: chart.axisColor, strokeWidth: axis.lineWidthPt, strokeLinecap: 'butt' as const, fill: 'none' };
  const caps = 3;
  if (along === 'x') {
    return (
      <g>
        <path d={`M${n2(x0)},${n2(yBottom)}H${n2(x0 + length)}M${n2(x0)},${n2(yBottom - caps)}v${caps * 2}M${n2(x0 + length)},${n2(yBottom - caps)}v${caps * 2}`} {...stroke} />
        <text x={n2(x0 + length / 2)} y={n2(yBottom - caps - 3)} textAnchor="middle" fontSize={font} fontWeight={axis.tickBold ? 'bold' : undefined} fill={chart.textColor}>
          {label}
        </text>
      </g>
    );
  }
  return (
    <g>
      <path d={`M${n2(x0)},${n2(yBottom)}V${n2(yBottom - length)}M${n2(x0 - caps)},${n2(yBottom)}h${caps * 2}M${n2(x0 - caps)},${n2(yBottom - length)}h${caps * 2}`} {...stroke} />
      <text x={n2(x0 + caps + 4)} y={n2(yBottom - length / 2)} dy="0.35em" fontSize={font} fontWeight={axis.tickBold ? 'bold' : undefined} fill={chart.textColor}>
        {label}
      </text>
    </g>
  );
}
