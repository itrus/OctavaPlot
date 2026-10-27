import { forwardRef } from 'react';
import type { Chart } from '../../model/types';
import { n2 } from '../../model/units';
import { AnnotationLayer, type EditorState, SELECT_COLOR } from '../shared/scene/ChartParts';
import { hitAttrs } from '../shared/scene/hitTest';
import { scopeRefs, useSvgIdPrefix } from '../shared/scene/idPrefix';
import { SceneElements } from '../shared/scene/SceneElements';
import { SceneSvg } from '../shared/scene/SceneSvg';
import type { XyModel } from './xyModel';
import { compileXyScene } from './xyScene';

interface Props {
  chart: Chart;
  model: XyModel;
  /** Present only in the editor; export renders without it (no selection or hit attributes). */
  editor?: EditorState;
  cssWidth: string;
  cssHeight: string;
}


/** The XY chart: a numeric X axis and one numeric Y axis, with a symbol layer and a path layer per series. */
export const XyChartSvg = forwardRef<SVGSVGElement, Props>(function XyChartSvg({ chart, model, editor, cssWidth, cssHeight }, ref) {
  const idPrefix = useSvgIdPrefix();
  const { widthPt: W, heightPt: H, series } = model;
  const ed = !!editor;
  const hit = (kind: Parameters<typeof hitAttrs>[0], g?: string, o?: string, a?: string) => (ed ? hitAttrs(kind, g, o, a) : {});
  // Layers taken out of the drawing by ID; only a chart drawn from layers has any.
  const hiddenIds = new Set(model.layers ? chart.hiddenLayerIds : []);
  const selectedGroup = editor?.selection.kind === 'group' ? editor.selection.groupId : null;
  const selectedPoint = editor?.selection.kind === 'point' ? editor.selection.pointId : null;

  // Everything but the annotations and the editor's own marks is drawn from the scene: the same shapes in the editor and in an export.
  const scene = model.scene ?? compileXyScene(chart, model);

  return (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={cssWidth} height={cssHeight} viewBox={`0 0 ${n2(W)} ${n2(H)}`} fontFamily={chart.fontFamily} style={{ background: chart.pageColor ?? 'transparent' }}>
      <SceneElements nodes={scene.defs} editor={ed} />
      <SceneElements nodes={scene.back} editor={ed} />

      {/* Data: the bars of a histogram, bands, lines, then symbols over them, clipped to the plotting region. */}
      <g clipPath={scopeRefs(idPrefix, 'url(#plot-clip)')}>
        <SceneSvg scene={scene} editor={ed} selectedGroup={selectedGroup} />
      </g>

      <SceneElements nodes={scene.front} editor={ed} />

      <AnnotationLayer chart={hiddenIds.size === 0 ? chart : { ...chart, annotations: chart.annotations.filter((a) => !hiddenIds.has(`${a.id}:annotation`)) }} editor={editor} width={W} height={H} hit={hit} />

      {/* Editor-only ring around the selected point. */}
      {ed &&
        selectedPoint &&
        series.flatMap((s) =>
          s.points
            .filter((p) => p.id === selectedPoint)
            .map((p) => <circle key={`ring-${p.id}`} data-editor-only cx={n2(p.px)} cy={n2(p.py)} r={n2(s.style.symbolSizePt / 2 + 6)} fill="none" stroke={SELECT_COLOR} strokeWidth={2.4} pointerEvents="none" />),
        )}
    </svg>
  );
});
