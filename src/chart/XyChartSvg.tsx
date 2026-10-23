import { forwardRef } from 'react';
import type { Chart } from '../model/types';
import { n2 } from '../model/units';
import { axisGaps, axisPieces } from './axisScale';
import { AnnotationLayer, axisLineD, Backgrounds, BreakMarks, ChartTitles, type EditorState, FrameBox, PlotClip, ScaleBar, SELECT_COLOR } from './ChartParts';
import { FitParameters } from './FitParameters';
import { GridLines } from './GridLines';
import { hitAttrs } from './hitTest';
import { crossingPosition, tickPaths, labelOffset } from './axisTicks';
import { keyWidthOf, LEGEND_KEY, X_TICK_LABEL_GAP, Y_TICK_LABEL_GAP } from './layout';
import { symbolPath } from './symbols';
import { BAND_OPACITY } from './survivalModel';
import type { XyModel } from './xyModel';

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
  const { widthPt: W, heightPt: H, layout, series, x, y, xScale, yScale } = model;
  const { plot } = layout;
  const ed = !!editor;
  const hit = (kind: Parameters<typeof hitAttrs>[0], g?: string, o?: string, a?: string) => (ed ? hitAttrs(kind, g, o, a) : {});
  const xa = chart.xAxis;
  const ya = chart.yAxis;
  const bottom = plot.y + plot.height;
  // Where the axis lines cross (default: the low edges); the numbers stay at the edges.
  // Broken axes: the pieces of each that are drawn, and where its gaps are.
  const xPieces = axisPieces(x, plot.x, plot.width);
  const yPieces = axisPieces(y, bottom, -plot.height);
  const xGaps = axisGaps(x, plot.x, plot.width);
  const yGaps = axisGaps(y, bottom, -plot.height);
  const yAxisX = crossingPosition(chart.origin.x, x, xScale, plot.x);
  const xAxisY = crossingPosition(chart.origin.y, y, yScale, bottom);
  const right = plot.x + plot.width;
  const selectedGroup = editor?.selection.kind === 'group' ? editor.selection.groupId : null;
  const selectedPoint = editor?.selection.kind === 'point' ? editor.selection.pointId : null;

  return (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={cssWidth} height={cssHeight} viewBox={`0 0 ${n2(W)} ${n2(H)}`} fontFamily={chart.fontFamily} style={{ background: chart.pageColor ?? 'transparent' }}>
      <PlotClip plot={plot} xPieces={xPieces} yPieces={yPieces} />

      <Backgrounds chart={chart} width={W} height={H} plot={plot} hit={hit} />

      {/* Gridlines (behind data). */}
      {ya.visible && <GridLines dir="h" grid={chart.grid} major={y.ticks} minor={y.minorTicks ?? []} showMajor={ya.showGrid} showMinor={ya.showMinorGrid} at={yScale} from={plot.x} to={right} />}
      {xa.visible && <GridLines dir="v" grid={chart.grid} major={x.ticks} minor={x.minorTicks ?? []} showMajor={xa.showGrid} showMinor={xa.showMinorGrid} at={xScale} from={plot.y} to={bottom} />}

      {/* Data: bands, then lines, then symbols over them, clipped to the plotting region. */}
      <g clipPath="url(#plot-clip)">
        {series.map((s) =>
          s.bars?.map((b) => (
            <rect key={b.id} x={n2(b.x)} y={n2(b.y)} width={n2(b.width)} height={n2(b.height)} fill={s.style.barFill} fillOpacity={s.style.barOpacity} stroke={s.style.barBorderColor} strokeWidth={s.style.barBorderWidthPt} {...hit('bar', s.groupId, b.id)} />
          )),
        )}
        {series.map((s) => s.bandPath && <path key={`band-${s.groupId}`} d={s.bandPath} fill={s.style.lineColor} fillOpacity={BAND_OPACITY} stroke="none" {...hit('line', s.groupId)} />)}
        {series.map(
          (s) =>
            s.style.showLines &&
            s.linePath !== '' && (
              <g key={`line-${s.groupId}`}>
                <path d={s.linePath} fill="none" stroke={s.style.lineColor} strokeWidth={s.style.lineWidthPt} strokeLinecap="round" strokeLinejoin="round" {...hit('line', s.groupId)} />
                {ed && <path d={s.linePath} fill="none" stroke="transparent" strokeWidth={Math.max(10, s.style.lineWidthPt + 6)} {...hit('line', s.groupId)} />}
                {selectedGroup === s.groupId && <path data-editor-only d={s.linePath} fill="none" stroke={SELECT_COLOR} strokeOpacity={0.35} strokeWidth={s.style.lineWidthPt + 5} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />}
              </g>
            ),
        )}
        {series.map((s) => s.fit?.bandPath && <path key={`fit-band-${s.groupId}`} d={s.fit.bandPath} fill={s.style.lineColor} fillOpacity={BAND_OPACITY} stroke="none" {...hit('line', s.groupId)} />)}
        {series.map((s) => s.fit?.path && <path key={`fit-${s.groupId}`} d={s.fit.path} fill="none" stroke={s.style.lineColor} strokeWidth={s.style.lineWidthPt} strokeLinecap="round" strokeLinejoin="round" {...hit('line', s.groupId)} />)}
        {series.map(
          (s) =>
            s.errorPath !== '' && (
              <path key={`err-${s.groupId}`} d={s.errorPath} fill="none" stroke={s.style.errorColor} strokeWidth={s.style.errorLineWidthPt} strokeLinecap="butt" {...hit('error', s.groupId)} />
            ),
        )}
        {series.map(
          (s) =>
            s.style.showSymbols &&
            s.points.map((p) => (
              <path
                key={p.id}
                d={symbolPath(s.style.symbolShape, p.px, p.py, s.style.symbolSizePt)}
                fill={s.style.symbolColor}
                stroke={s.style.symbolBorderColor}
                strokeWidth={s.style.symbolBorderWidthPt}
                {...hit('point', s.groupId, p.id)}
              />
            )),
        )}
      </g>

      {/* Fitted parameters, written in the corner of the plot in the colour of each curve. */}
      {chart.fit.showParameters && <FitParameters series={series} x={plot.x + 8} y={plot.y + 4} fontSizePt={chart.yAxis.tickFontSizePt} level={chart.fit.level} />}

      {/* Axes. */}
      {ya.visible && (
        <g stroke={chart.axisColor} strokeWidth={ya.lineWidthPt} fill="none" strokeLinecap="square" {...hit('axis', undefined, 'y')}>
          <path d={axisLineD('y', yAxisX, plot.y, bottom, yPieces)} />
          {ed && <path d={axisLineD('y', yAxisX, plot.y, bottom, yPieces)} stroke="transparent" strokeWidth={14} />}
          <BreakMarks along="y" fixed={yAxisX} gaps={yGaps} mark={ya.breakMark} color={chart.axisColor} width={ya.lineWidthPt} />
          {tickPaths('left', yAxisX, ya, y.ticks, y.minorTicks ?? [], yScale).map((p) => (
            <path key={p.key} d={p.d} strokeLinecap="butt" />
          ))}
        </g>
      )}
      {ya.visible &&
        y.ticks.map((t) => (
          <text key={t} x={n2(plot.x - labelOffset(ya) - Y_TICK_LABEL_GAP)} y={n2(yScale(t))} dy="0.35em" textAnchor="end" fontSize={ya.tickFontSizePt} fontWeight={ya.tickBold ? 'bold' : undefined} fill={chart.textColor} {...hit('axis', undefined, 'y')}>
            {y.tickLabel(t)}
          </text>
        ))}
      {xa.visible && (
        <g stroke={chart.axisColor} strokeWidth={xa.lineWidthPt} fill="none" strokeLinecap="square" {...hit('axis', undefined, 'x')}>
          <path d={axisLineD('x', xAxisY, plot.x, right, xPieces)} />
          {ed && <path d={axisLineD('x', xAxisY, plot.x, right, xPieces)} stroke="transparent" strokeWidth={14} />}
          <BreakMarks along="x" fixed={xAxisY} gaps={xGaps} mark={xa.breakMark} color={chart.axisColor} width={xa.lineWidthPt} />
          {tickPaths('bottom', xAxisY, xa, x.ticks, x.minorTicks ?? [], xScale).map((p) => (
            <path key={p.key} d={p.d} strokeLinecap="butt" />
          ))}
        </g>
      )}
      {xa.visible &&
        x.ticks.map((t) => (
          <text key={t} x={n2(xScale(t))} y={n2(bottom + labelOffset(xa) + X_TICK_LABEL_GAP + xa.tickFontSizePt * 0.8)} textAnchor="middle" fontSize={xa.tickFontSizePt} fontWeight={xa.tickBold ? 'bold' : undefined} fill={chart.textColor} {...hit('axis', undefined, 'x')}>
            {x.tickLabel(t)}
          </text>
        ))}

      <FrameBox chart={chart} plot={plot} lineWidthPt={ya.lineWidthPt} />

      <ScaleBar chart={chart} axis={xa} along="x" scale={x} map={xScale} plot={plot} />
      <ScaleBar chart={chart} axis={ya} along="y" scale={y} map={yScale} plot={plot} />
      <ChartTitles chart={chart} layout={layout} bottom={xa} left={ya} hit={hit} />

      {/* At-risk table: the number of subjects still under observation at each time tick. */}
      {model.atRisk && (
        <g fontSize={model.atRisk.fontSizePt} fill={chart.textColor}>
          <text x={n2(plot.x)} y={n2(model.atRisk.y0 + model.atRisk.rowHeight * 0.8)} fontWeight="bold" textAnchor="start">Number at risk</text>
          {model.atRisk.rows.map((r, ri) => {
            const y = model.atRisk!.y0 + model.atRisk!.rowHeight * (ri + 1.8);
            return (
              <g key={ri}>
                <text x={n2(plot.x - labelOffset(ya) - Y_TICK_LABEL_GAP)} y={n2(y)} textAnchor="end" fill={r.color} fontWeight="bold">{r.label}</text>
                {r.counts.map((n, ci) => (
                  <text key={ci} x={n2(model.atRisk!.xs[ci])} y={n2(y)} textAnchor="middle" fill={r.color}>{n}</text>
                ))}
              </g>
            );
          })}
        </g>
      )}

      {/* Legend: the line and the symbol of each series. */}
      {layout.legend && (
        <g>
          {layout.legend.items.map((it) => {
            const s = series[model.legendSeries[it.index]];
            const w = keyWidthOf(chart.legend);
            return (
              <g key={s.groupId} {...hit('legend', s.groupId)}>
                {s.bars && <rect x={n2(it.x)} y={n2(it.y - 5)} width={w} height={10} fill={s.style.barFill} fillOpacity={s.style.barOpacity} stroke={s.style.barBorderColor} strokeWidth={s.style.barBorderWidthPt} />}
                {s.style.showLines && <path d={`M${n2(it.x)},${n2(it.y)}H${n2(it.x + w)}`} stroke={s.style.lineColor} strokeWidth={s.style.lineWidthPt} fill="none" />}
                {s.style.showSymbols && <path d={symbolPath(s.style.symbolShape, it.x + w / 2, it.y, s.style.symbolSizePt)} fill={s.style.symbolColor} stroke={s.style.symbolBorderColor} strokeWidth={s.style.symbolBorderWidthPt} />}
                <text x={n2(it.x + w + LEGEND_KEY.gap)} y={n2(it.y)} dy="0.35em" fontSize={layout.legend!.fontSizePt} fill={chart.textColor}>
                  {it.label}
                </text>
              </g>
            );
          })}
        </g>
      )}

      <AnnotationLayer chart={chart} editor={editor} width={W} height={H} hit={hit} />

      {/* Editor-only ring around the selected point. */}
      {ed &&
        selectedPoint &&
        series.flatMap((s) =>
          s.points
            .filter((p) => p.id === selectedPoint)
            .map((p) => <circle key={`ring-${p.id}`} data-editor-only cx={n2(p.px)} cy={n2(p.py)} r={n2(s.style.symbolSizePt / 2 + 3)} fill="none" stroke={SELECT_COLOR} strokeWidth={1.2} pointerEvents="none" />),
        )}
    </svg>
  );
});
