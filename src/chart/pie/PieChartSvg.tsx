import { forwardRef } from 'react';
import type { Chart } from '../../model/types';
import { n2 } from '../../model/units';
import { AnnotationLayer, Backgrounds, ChartTitles, type EditorState, PlotClip } from '../shared/scene/ChartParts';
import { hitAttrs } from '../shared/scene/hitTest';
import { keyWidthOf, LEGEND_KEY } from '../shared/parts/layout';
import { compilePieMarks } from './pieMarks';
import type { PieModel } from './pieModel';
import { SceneElements } from '../shared/scene/SceneElements';

interface Props {
  chart: Chart;
  model: PieModel;
  /** Present only in the editor; export renders without it (no selection or hit attributes). */
  editor?: EditorState;
  cssWidth: string;
  cssHeight: string;
}

/** Pie and doughnut charts: one pie for each row of the table, the parts in the colours of their data sets. */
export const PieChartSvg = forwardRef<SVGSVGElement, Props>(function PieChartSvg({ chart, model, editor, cssWidth, cssHeight }, ref) {
  const { widthPt: W, heightPt: H, layout, parts, legendParts } = model;
  const { plot } = layout;
  const ed = !!editor;
  const hit = (kind: Parameters<typeof hitAttrs>[0], g?: string, o?: string, a?: string) => (ed ? hitAttrs(kind, g, o, a) : {});
  const selectedGroup = editor?.selection.kind === 'group' ? editor.selection.groupId : null;

  return (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={cssWidth} height={cssHeight} viewBox={`0 0 ${n2(W)} ${n2(H)}`} fontFamily={chart.fontFamily} style={{ background: chart.pageColor ?? 'transparent' }}>
      <PlotClip plot={plot} />
      <Backgrounds chart={chart} width={W} height={H} plot={plot} hit={hit} />

      {/* The slices, the text beside them and the titles of the pies: from the scene, in the order of the layers. */}
      <SceneElements nodes={model.marks ?? compilePieMarks(chart, model)} editor={ed} selectedGroup={selectedGroup} />

      <ChartTitles chart={chart} layout={layout} bottom={chart.xAxis} left={chart.yAxis} hit={hit} />

      <AnnotationLayer chart={chart.hiddenLayerIds.length === 0 ? chart : { ...chart, annotations: chart.annotations.filter((a) => !chart.hiddenLayerIds.includes(`${a.id}:annotation`)) }} editor={editor} width={W} height={H} hit={hit} />

      {layout.legend && (
        <g>
          {layout.legend.items.map((it) => {
            const part = parts[legendParts[it.index]];
            const w = keyWidthOf(chart.legend);
            return (
              <g key={part.groupId} {...hit('legend', part.groupId)}>
                <rect x={n2(it.x)} y={n2(it.y - 10)} width={w} height={20} fill={part.style.barFill} fillOpacity={part.style.barOpacity} stroke={part.style.barBorderColor} strokeWidth={part.style.barBorderWidthPt} strokeOpacity={part.style.barBorderOpacity < 1 ? part.style.barBorderOpacity : undefined} />
                <text x={n2(it.x + w + LEGEND_KEY.gap)} y={n2(it.y)} dy="0.35em" fontSize={layout.legend!.fontSizePt} fill={chart.textColor}>
                  {it.label}
                </text>
              </g>
            );
          })}
        </g>
      )}
    </svg>
  );
});
