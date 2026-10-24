import type { ReactNode } from 'react';
import type { Annotation, AxisConfig, BreakMark, Chart, Selection } from '../model/types';
import { n2 } from '../model/units';
import { backgroundElements, breakMarkElement, frameElement, plotClipElement, scaleBarElement, titleElements } from './chrome';
import type { hitAttrs } from './hitTest';
import type { Layout, Rect } from './layout';
import { SceneElements } from './SceneElements';
import { svgId } from './svgIds';
import type { YAxisScale } from './scales';
import { measureText } from './text';

/**
 * Pieces every kind of chart draws the same way: the backgrounds, the clip of the plotting region, the frame, the break marks,
 * the scale bars and the titles. They are made by the chrome functions (chrome.ts) as scene elements; these components only
 * write them as SVG, with the editor's hit attributes when the drawing is for the editor.
 */

/** Colour of the editor's selection outlines (never drawn in an export). */
export const SELECT_COLOR = '#2b7fff';

/** The editor's hit attributes of a mark; empty when the chart is drawn for export. */
type HitProps = (kind: Parameters<typeof hitAttrs>[0], groupId?: string, objectId?: string, axis?: string) => Record<string, unknown>;

/** Whether the drawing is for the editor: its hit function gives attributes. */
const isEditor = (hit: HitProps): boolean => Object.keys(hit('background')).length > 0;

/** The clip of the plotting region that the data marks use (`url(#plot-clip)`). */
export function PlotClip({ plot, xPieces, yPieces }: { plot: Rect; xPieces?: Array<[number, number]> | null; yPieces?: Array<[number, number]> | null }) {
  return <SceneElements nodes={[plotClipElement(plot, xPieces, yPieces)]} editor={false} />;
}

export { axisLineD } from './chrome';

/** The marks at the ends of the gaps of a broken axis: one slash or two, across the axis line. */
export function BreakMarks(props: { along: 'x' | 'y'; fixed: number; gaps: Array<[number, number]>; mark: BreakMark; color: string; width: number }) {
  const node = breakMarkElement(props);
  return node ? <SceneElements nodes={[node]} editor={false} /> : null;
}

/** The chart background is the hit target for chart-level selection; the plotting region has its own colour. */
export function Backgrounds({ chart, width, height, plot, hit }: { chart: Chart; width: number; height: number; plot: Rect; hit: HitProps }) {
  return <SceneElements nodes={backgroundElements(chart, width, height, plot)} editor={isEditor(hit)} />;
}

/** A box round the plotting region, when the chart asks for one. */
export function FrameBox({ chart, plot, lineWidthPt }: { chart: Chart; plot: Rect; lineWidthPt: number }) {
  const node = frameElement(chart, plot, lineWidthPt);
  return node ? <SceneElements nodes={[node]} editor={false} /> : null;
}

/**
 * The chart title and the titles of the axes. `bottom` and `left` are the settings of the axes drawn along the bottom and
 * down the left (on a horizontal chart those are the value and the category axis); `right` is the right-hand Y axis, if drawn.
 */
export function ChartTitles({ chart, layout, bottom, left, right, hit }: { chart: Chart; layout: Layout; bottom: AxisConfig; left: AxisConfig; right?: AxisConfig | null; hit: HitProps }) {
  return <SceneElements nodes={titleElements(chart, layout, bottom, left, right)} editor={isEditor(hit)} />;
}

/** What the editor adds to a drawing: the selection, and an annotation being dragged. Absent when a chart is exported. */
export interface EditorState {
  selection: Selection;
  /** Annotation being dragged: its live position (fractions) overrides the stored one. */
  dragging?: { id: string; xFrac: number; yFrac: number } | null;
}

function annotationBox(a: Annotation, x: number, y: number) {
  const lines = a.text.split('\n');
  const w = Math.max(...lines.map((l) => measureText(l, a.fontSizePt)), 8);
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
          <g key={a.id} {...hit('annotation', undefined, undefined, a.id)} id={svgId('annotation', a.id)}>
            {ed && <rect x={n2(box.x - 6)} y={n2(box.y - 6)} width={n2(box.w + 12)} height={n2(box.h + 12)} fill="transparent" />}
            <text x={n2(x)} fontSize={a.fontSizePt} fill={a.color} fillOpacity={a.opacity < 1 ? a.opacity : undefined}>
              {box.lines.map((line, i) => (
                <tspan key={i} x={n2(x)} y={n2(y + a.fontSizePt * 0.9 + i * a.fontSizePt * 1.2)}>
                  {line === '' ? ' ' : line}
                </tspan>
              ))}
            </text>
            {selected === a.id && (
              <rect data-editor-only x={n2(box.x - 6)} y={n2(box.y - 6)} width={n2(box.w + 12)} height={n2(box.h + 12)} fill="none" stroke={SELECT_COLOR} strokeWidth={2} strokeDasharray="6 4" pointerEvents="none" />
            )}
          </g>
        );
      })}
    </>
  );
}

/**
 * The scale bar of a hidden axis: a line as long as one major tick interval, with that interval written beside it, in
 * the lower left corner of the plotting region. `along` is the direction the axis runs; `map` its mapping to the page.
 */
export function ScaleBar({ chart, axis, along, scale, map, plot }: { chart: Chart; axis: AxisConfig; along: 'x' | 'y'; scale: YAxisScale; map: (v: number) => number; plot: Rect }) {
  const node = scaleBarElement(chart, axis, along, scale, map, plot);
  return node ? <SceneElements nodes={[node]} editor={false} /> : null;
}

/** Shapes of a horizontal chart, turned into place by the model's matrix; a vertical chart draws them as they are. */
export function Turned({ matrix, children }: { matrix: string | null; children: ReactNode }) {
  return matrix ? <g transform={matrix}>{children}</g> : <>{children}</>;
}
