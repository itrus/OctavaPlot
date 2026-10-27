import type { Annotation, AxisConfig, Chart, Selection } from '../../../model/types';
import { n2 } from '../../../model/units';
import { backgroundElements, plotClipElement, titleElements } from './chrome';
import type { hitAttrs } from './hitTest';
import type { Layout, Rect } from '../parts/layout';
import { prefixed, useSvgIdPrefix } from './idPrefix';
import { SceneElements } from './SceneElements';
import { svgId } from './svgIds';
import { measureText } from '../parts/text';

/**
 * Pieces every kind of chart draws the same way: the backgrounds, the clip of the plotting region and the titles. They are made by the chrome functions (chrome.ts) as scene elements; these components only
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

/** The chart background is the hit target for chart-level selection; the plotting region has its own colour. */
export function Backgrounds({ chart, width, height, plot, hit }: { chart: Chart; width: number; height: number; plot: Rect; hit: HitProps }) {
  return <SceneElements nodes={backgroundElements(chart, width, height, plot)} editor={isEditor(hit)} />;
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
  const idPrefix = useSvgIdPrefix();
  const selected = editor?.selection.kind === 'annotation' ? editor.selection.annotationId : null;
  return (
    <>
      {chart.annotations.map((a) => {
        const drag = editor?.dragging?.id === a.id ? editor.dragging : null;
        const x = (drag ? drag.xFrac : a.xFrac) * width;
        const y = (drag ? drag.yFrac : a.yFrac) * height;
        const box = annotationBox(a, x, y);
        return (
          <g key={a.id} {...hit('annotation', undefined, undefined, a.id)} id={prefixed(idPrefix, svgId('annotation', a.id))}>
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
