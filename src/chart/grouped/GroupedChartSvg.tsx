import { forwardRef } from 'react';
import type { Chart } from '../../model/types';
import { n2 } from '../../model/units';
import { BarLabelText, InsideBarLabelText } from '../shared/parts/BarLabelText';
import { AnnotationLayer, type EditorState } from '../shared/scene/ChartParts';
import type { GroupedModel } from './groupedModel';
import { compileGroupedMarks } from './groupedMarks';
import { hitAttrs } from '../shared/scene/hitTest';
import { SceneElements } from '../shared/scene/SceneElements';
import { compileGroupedScene } from './groupedChrome';

interface Props {
  chart: Chart;
  model: GroupedModel;
  /** Present only in the editor; export renders without it (no selection or hit attributes). */
  editor?: EditorState;
  cssWidth: string;
  cssHeight: string;
}


/** Bars (side by side, stacked or as shares) or lines over the categories of a grouped or contingency table. */
export const GroupedChartSvg = forwardRef<SVGSVGElement, Props>(function GroupedChartSvg({ chart, model, editor, cssWidth, cssHeight }, ref) {
  const { widthPt: W, heightPt: H, series, orient } = model;
  const ed = !!editor;
  const hit = (kind: Parameters<typeof hitAttrs>[0], g?: string, o?: string, a?: string) => (ed ? hitAttrs(kind, g, o, a) : {});
  // Horizontal: the model is the vertical drawing, turned into place by one matrix; symbols and text stay upright.
  // The chrome (clip, backgrounds, grids, axes, titles, legend) is drawn from the scene.
  const scene = model.scene ?? compileGroupedScene(chart, model);
  const selectedGroup = editor?.selection.kind === 'group' ? editor.selection.groupId : null;

  return (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={cssWidth} height={cssHeight} viewBox={`0 0 ${n2(W)} ${n2(H)}`} fontFamily={chart.fontFamily} style={{ background: chart.pageColor ?? 'transparent' }}>
      <SceneElements nodes={scene.defs} editor={ed} />
      <SceneElements nodes={scene.back} editor={ed} />

      {/* Data marks, clipped to the plotting region: from the scene, like the chrome. */}
      <SceneElements nodes={scene.marks ?? compileGroupedMarks(chart, model)} editor={ed} selectedGroup={selectedGroup} />

      {/* Labels above the bars. */}
      {chart.barLabels.show !== 'none' && series.map((s) => s.bars.map((bar) => bar.label && <BarLabelText key={bar.label.id} label={bar.label} cfg={chart.barLabels} textColor={chart.textColor} orient={orient} />))}
      {series.map((s) => s.bars.map((bar) => bar.insideLabel && <InsideBarLabelText key={bar.insideLabel.id} label={bar.insideLabel} sizePt={chart.barLabels.sizePt} orient={orient} />))}

      <SceneElements nodes={scene.front} editor={ed} />

      <AnnotationLayer chart={chart.hiddenLayerIds.length === 0 ? chart : { ...chart, annotations: chart.annotations.filter((a) => !chart.hiddenLayerIds.includes(`${a.id}:annotation`)) }} editor={editor} width={W} height={H} hit={hit} />
    </svg>
  );
});
