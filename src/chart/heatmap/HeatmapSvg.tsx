import { forwardRef } from 'react';
import { numberStartPt } from '../../model/graph/axis';
import type { Chart } from '../../model/types';
import { n2 } from '../../model/units';
import { AnnotationLayer, Backgrounds, ChartTitles, type EditorState, PlotClip } from '../shared/scene/ChartParts';
import type { HeatModel } from './heatmapModel';
import { hitAttrs } from '../shared/scene/hitTest';
import { X_TICK_LABEL_GAP, Y_TICK_LABEL_GAP } from '../shared/parts/layout';
import { compileHeatMarks } from './heatMarks';
import { SceneElements } from '../shared/scene/SceneElements';

interface Props {
  chart: Chart;
  model: HeatModel;
  /** Present only in the editor; export renders without it (no selection or hit attributes). */
  editor?: EditorState;
  cssWidth: string;
  cssHeight: string;
}

/** A heat map: a grid of coloured cells, the labels of its rows and columns, and the colour bar. */
export const HeatmapSvg = forwardRef<SVGSVGElement, Props>(function HeatmapSvg({ chart, model, editor, cssWidth, cssHeight }, ref) {
  const { widthPt: W, heightPt: H, layout } = model;
  const { plot } = layout;
  const ed = !!editor;
  const hit = (kind: Parameters<typeof hitAttrs>[0], g?: string, o?: string, a?: string) => (ed ? hitAttrs(kind, g, o, a) : {});
  const xa = chart.xAxis;
  const ya = chart.yAxis;
  const cw = plot.width / Math.max(1, model.cols.length);
  const ch = plot.height / Math.max(1, model.rows.length);
  const bottom = plot.y + plot.height;

  return (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={cssWidth} height={cssHeight} viewBox={`0 0 ${n2(W)} ${n2(H)}`} fontFamily={chart.fontFamily} style={{ background: chart.pageColor ?? 'transparent' }}>
      <PlotClip plot={plot} />
      <Backgrounds chart={chart} width={W} height={H} plot={plot} hit={hit} />

      {/* The cells, the numbers in them and the colour bar: from the scene, in the order of the layers. */}
      <SceneElements nodes={model.marks ?? compileHeatMarks(chart, model)} editor={ed} />

      {/* Row labels on the left, column labels along the bottom. */}
      {ya.visible &&
        model.rows.map((label, i) => (
          <text
            key={`row-${i}`}
            x={n2(plot.x - numberStartPt(ya) - Y_TICK_LABEL_GAP)}
            y={n2(plot.y + ch * (i + 0.5))}
            dy="0.35em"
            textAnchor="end"
            fontSize={ya.tickFontSizePt}
            fontWeight={ya.tickBold ? 'bold' : undefined}
            fill={chart.textColor}
            {...hit('axis', undefined, 'y')}
          >
            {label}
          </text>
        ))}
      {xa.visible &&
        model.cols.map((label, i) => {
          const x = plot.x + cw * (i + 0.5);
          const y = bottom + numberStartPt(xa) + X_TICK_LABEL_GAP + xa.tickFontSizePt * 0.8;
          const common = { fontSize: xa.tickFontSizePt, ...(xa.tickBold ? { fontWeight: 'bold' as const } : {}), fill: chart.textColor, ...hit('axis', undefined, 'x') };
          return layout.xTickRotated ? (
            <text key={`col-${i}`} x={n2(x)} y={n2(y - xa.tickFontSizePt * 0.4)} textAnchor="end" transform={`rotate(-45 ${n2(x)} ${n2(y - xa.tickFontSizePt * 0.4)})`} {...common}>
              {label}
            </text>
          ) : (
            <text key={`col-${i}`} x={n2(x)} y={n2(y)} textAnchor="middle" {...common}>
              {label}
            </text>
          );
        })}

      <ChartTitles chart={chart} layout={layout} bottom={xa} left={ya} hit={hit} />
      <AnnotationLayer chart={chart.hiddenLayerIds.length === 0 ? chart : { ...chart, annotations: chart.annotations.filter((a) => !chart.hiddenLayerIds.includes(`${a.id}:annotation`)) }} editor={editor} width={W} height={H} hit={hit} />
    </svg>
  );
});
