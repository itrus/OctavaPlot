import { forwardRef } from 'react';
import type { Annotation, Chart, Selection } from '../../../model/types';
import { n2 } from '../../../model/units';
import { annotationElements } from './annotations';
import { scopeRefs, useSvgIdPrefix } from './idPrefix';
import type { Scene } from './scene';
import type { SceneElement } from './sceneElement';
import { SceneElements } from './SceneElements';
import { SceneSvg } from './SceneSvg';

/** What the editor adds to a drawing: the selection, and an annotation being dragged. Absent when a chart is exported. */
export interface EditorState {
  selection: Selection;
  /** Annotation being dragged: its live position (fractions) overrides the stored one. */
  dragging?: { id: string; xFrac: number; yFrac: number } | null;
}

/** One part of a drawing, in the order it is written. */
type ChartSection =
  /** Scene elements as they are. */
  | { nodes: ReadonlyArray<SceneElement> }
  /** The data layers of an XY scene, clipped to the plotting region. */
  | { xyData: Scene }
  /** The text annotations (the ones that are not hidden); the editor's drag and selection apply to them. */
  | { annotations: ReadonlyArray<Annotation>; place?: (a: Annotation) => { x: number; y: number } | null };

/** What a chart is drawn from, whatever its family: its size and its sections. The family builds it from its model. */
export interface ChartDrawing {
  widthPt: number;
  heightPt: number;
  sections: ReadonlyArray<ChartSection>;
  /** The editor's own marks for the selection, written last and only in the editor; never in an export. */
  selection?: (selected: { groupIds: readonly string[]; pointId: string | null }) => SceneElement[];
}

interface Props {
  chart: Chart;
  drawing: ChartDrawing;
  /** Present only in the editor; export renders without it (no selection or hit attributes). */
  editor?: EditorState;
  /** CSS size of the <svg>. Export uses physical mm; the editor applies preview zoom. */
  cssWidth: string;
  cssHeight: string;
}

/**
 * The one renderer of every kind of chart: an <svg> that writes the sections of a drawing in order. Nothing here draws a mark;
 * the screen, an export and the editor's hit testing all come from the scene elements the family compiled.
 */
export const SceneChart = forwardRef<SVGSVGElement, Props>(function SceneChart({ chart, drawing, editor, cssWidth, cssHeight }, ref) {
  const idPrefix = useSvgIdPrefix();
  const ed = !!editor;
  const { widthPt: W, heightPt: H } = drawing;
  // The data sets that are selected (one, or several edited together); a selected point is not a selected data set.
  const groupIds = editor?.selection.kind === 'group' ? [editor.selection.groupId] : editor?.selection.kind === 'groups' ? editor.selection.groupIds : [];
  const selectedGroups: ReadonlySet<string> = new Set(groupIds);
  const selectedPoint = editor?.selection.kind === 'point' ? editor.selection.pointId : null;
  const selectedAnnotation = editor?.selection.kind === 'annotation' ? editor.selection.annotationId : null;
  return (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={cssWidth} height={cssHeight} viewBox={`0 0 ${n2(W)} ${n2(H)}`} fontFamily={chart.fontFamily} style={{ background: chart.pageColor ?? 'transparent' }}>
      {drawing.sections.map((s, i) =>
        'nodes' in s ? (
          <SceneElements key={i} nodes={s.nodes} editor={ed} selectedGroups={selectedGroups} />
        ) : 'xyData' in s ? (
          <g key={i} clipPath={scopeRefs(idPrefix, 'url(#plot-clip)')}>
            <SceneSvg scene={s.xyData} editor={ed} selectedGroups={selectedGroups} />
          </g>
        ) : (
          <SceneElements key={i} nodes={annotationElements(s.annotations, W, H, editor?.dragging, s.place)} editor={ed} selectedAnnotation={selectedAnnotation} />
        ),
      )}
      {ed && drawing.selection && <SceneElements nodes={drawing.selection({ groupIds, pointId: selectedPoint })} editor />}
    </svg>
  );
});
