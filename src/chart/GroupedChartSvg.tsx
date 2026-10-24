import { forwardRef } from 'react';
import type { Chart } from '../model/types';
import { n2 } from '../model/units';
import type { GroupedModel } from './groupedModel';
import { GridLines } from './GridLines';
import { BarLabelText } from './BarLabelText';
import { axisGaps, axisPieces } from './axisScale';
import { AnnotationLayer, Turned, axisLineD, Backgrounds, BreakMarks, ChartTitles, type EditorState, FrameBox, PlotClip, ScaleBar, SELECT_COLOR } from './ChartParts';
import { ReferenceLinesLayer } from './ReferenceLinesLayer';
import { referenceLinesOf } from './referenceLines';
import { hitAttrs } from './hitTest';
import { crossingPosition, tickPath, tickPaths, labelOffset } from './axisTicks';
import { keyWidthOf, LEGEND_KEY, X_TICK_LABEL_GAP, Y_TICK_LABEL_GAP } from './layout';
import { linePattern } from '../model/look';
import { symbolPath } from './symbols';

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
  const { widthPt: W, heightPt: H, layout, series, categories, y, yScale, orient } = model;
  const { plot } = layout;
  const horizontal = orient.horizontal;
  const ed = !!editor;
  const hit = (kind: Parameters<typeof hitAttrs>[0], g?: string, o?: string, a?: string) => (ed ? hitAttrs(kind, g, o, a) : {});
  const xa = chart.xAxis;
  const ya = chart.yAxis;
  const bottom = plot.y + plot.height;
  const right = plot.x + plot.width;
  // Horizontal: the model is the vertical drawing, turned into place by one matrix; symbols and text stay upright.
  const valueX = (t: number) => orient.toScreen(0, yScale(t)).x;
  const categoryY = (cx: number) => orient.toScreen(cx, 0).y;
  const valueOrigin = horizontal ? orient.virtual.y + orient.virtual.height : bottom;
  const valueSpan = horizontal ? -orient.virtual.height : -plot.height;
  const valuePieces = axisPieces(y, valueOrigin, valueSpan);
  const valueGaps = axisGaps(y, valueOrigin, valueSpan);
  const onPage = (ranges: Array<[number, number]>): Array<[number, number]> => (horizontal ? ranges.map(([a, b]) => [orient.toScreen(0, b).x, orient.toScreen(0, a).x] as [number, number]) : ranges);
  const yPieces = horizontal ? null : valuePieces;
  const xPieces = horizontal && valuePieces ? onPage(valuePieces) : null;
  const yGaps = valueGaps;
  const categoryAxisY = crossingPosition(chart.origin.y, y, yScale, bottom);
  const categoryAxisX = crossingPosition(chart.origin.y, y, valueX, plot.x);
  const at = (p: { px: number; py: number }) => orient.toScreen(p.px, p.py);
  const selectedGroup = editor?.selection.kind === 'group' ? editor.selection.groupId : null;

  // Lines and error bars go over the bars and symbols, under them, or (auto) over the bars and under the symbols.
  const lineOrder = chart.lineOrder;
  const onTop = lineOrder === 'onTop';
  const bars = (
    <Turned matrix={orient.matrix}>
        {series.map((s) =>
          s.bars.map((b) => (
            <rect
              key={b.id}
              x={n2(b.x)}
              y={n2(b.y)}
              width={n2(b.width)}
              height={n2(b.height)}
              fill={s.style.barFillMode === 'none' ? 'none' : s.style.barFill}
              fillOpacity={s.style.barOpacity < 1 ? s.style.barOpacity : undefined}
              stroke={s.style.barBorderWidthPt > 0 ? s.style.barBorderColor : 'none'}
              strokeWidth={s.style.barBorderWidthPt}
              {...hit('bar', s.groupId, b.id)}
            />
          )),
        )}
        {series.map((s) =>
          s.style.showMeanLine
            ? s.bars.map((b) => b.centerLine && <path key={`mid-${b.id}`} d={`M${n2(b.centerLine.x1)},${n2(b.centerLine.y)}H${n2(b.centerLine.x2)}`} fill="none" stroke={s.style.lineColor} strokeWidth={s.style.lineWidthPt} strokeLinecap="butt" {...hit('meanLine', s.groupId, b.id)} />)
            : null,
        )}
    </Turned>
  );
  const linesAndErrors = (
    <Turned matrix={orient.matrix}>
        {series.map(
          (s) =>
            s.style.showLines &&
            s.linePath !== '' && (
              <g key={`line-${s.groupId}`}>
                <path d={s.linePath} fill="none" stroke={s.style.lineColor} strokeWidth={s.style.lineWidthPt} {...linePattern(s.style)} strokeLinejoin="round" {...hit('line', s.groupId)} />
                {selectedGroup === s.groupId && <path data-editor-only d={s.linePath} fill="none" stroke={SELECT_COLOR} strokeOpacity={0.35} strokeWidth={s.style.lineWidthPt + 10} strokeLinecap="round" pointerEvents="none" />}
              </g>
            ),
        )}
        {series.map(
          (s) =>
            s.errorPath !== '' && (
              <path key={`err-${s.groupId}`} d={s.errorPath} fill="none" stroke={s.style.errorColor} strokeWidth={s.style.errorLineWidthPt} strokeLinecap="butt" {...hit('error', s.groupId)} />
            ),
        )}
    </Turned>
  );
  const symbols = (
    <>
        {series.map(
          (s) =>
            s.style.showSymbols &&
            s.points.map((p) => (
              <path key={p.id} d={symbolPath(s.style.symbolShape, at(p).x, at(p).y, s.style.symbolSizePt)} fill={s.style.symbolColor} fillOpacity={s.style.symbolFillOpacity < 1 ? s.style.symbolFillOpacity : undefined} stroke={s.style.symbolBorderColor} strokeWidth={s.style.symbolBorderWidthPt} {...hit('point', s.groupId, p.id)} />
            )),
        )}
        {series.map((s) =>
          s.dots.map((p) => (
            <path key={p.id} d={symbolPath(s.style.symbolShape, at(p).x, at(p).y, s.style.symbolSizePt)} fill={s.style.symbolColor} fillOpacity={s.style.symbolFillOpacity < 1 ? s.style.symbolFillOpacity : undefined} stroke={s.style.symbolBorderColor} strokeWidth={s.style.symbolBorderWidthPt} {...hit('point', s.groupId, p.id)} />
          )),
        )}
    </>
  );

  return (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={cssWidth} height={cssHeight} viewBox={`0 0 ${n2(W)} ${n2(H)}`} fontFamily={chart.fontFamily} style={{ background: chart.pageColor ?? 'transparent' }}>
      <PlotClip plot={plot} xPieces={xPieces} yPieces={yPieces} />
      <Backgrounds chart={chart} width={W} height={H} plot={plot} hit={hit} />

      {ya.visible && (horizontal ? (
        <GridLines dir="v" grid={chart.grid} major={y.ticks} minor={y.minorTicks ?? []} showMajor={ya.showGrid} showMinor={ya.showMinorGrid} at={valueX} from={plot.y} to={bottom} />
      ) : (
        <GridLines dir="h" grid={chart.grid} major={y.ticks} minor={y.minorTicks ?? []} showMajor={ya.showGrid} showMinor={ya.showMinorGrid} at={yScale} from={plot.x} to={right} />
      ))}

      <ReferenceLinesLayer lines={referenceLinesOf(chart, { family: 'grouped', model }).placed} fontSizePt={ya.tickFontSizePt} />

      {/* Data, clipped to the plotting region: bars, then error bars, then lines and their symbols. */}
      <g clipPath="url(#plot-clip)">
        {onTop ? (
          <>
            {bars}
            {symbols}
            {linesAndErrors}
          </>
        ) : lineOrder === 'underneath' ? (
          <>
            {linesAndErrors}
            {bars}
            {symbols}
          </>
        ) : (
          <>
            {bars}
            {linesAndErrors}
            {symbols}
          </>
        )}
        <Turned matrix={orient.matrix}>
          {ed &&
            selectedGroup &&
            series
              .filter((s) => s.groupId === selectedGroup)
              .flatMap((s) => s.bars.map((b) => <rect key={`sel-${b.id}`} data-editor-only x={n2(b.x - 3)} y={n2(b.y - 3)} width={n2(b.width + 6)} height={n2(b.height + 6)} fill="none" stroke={SELECT_COLOR} strokeWidth={2.4} strokeDasharray="6 4" pointerEvents="none" />))}
        </Turned>
      </g>

      {/* Labels above the bars. */}
      {chart.barLabels.show !== 'none' && series.map((s) => s.bars.map((bar) => bar.label && <BarLabelText key={bar.label.id} label={bar.label} cfg={chart.barLabels} textColor={chart.textColor} orient={orient} />))}

      {/* Axes. */}
      {!horizontal && ya.visible && (
        <g stroke={chart.axisColor} strokeWidth={ya.lineWidthPt} fill="none" strokeLinecap="square" {...hit('axis', undefined, 'y')}>
          <path d={axisLineD('y', plot.x, plot.y, bottom, yPieces)} />
          {ed && <path d={axisLineD('y', plot.x, plot.y, bottom, yPieces)} stroke="transparent" strokeWidth={28} />}
          <BreakMarks along="y" fixed={plot.x} gaps={yGaps} mark={ya.breakMark} color={chart.axisColor} width={ya.lineWidthPt} />
          {tickPaths('left', plot.x, ya, y.ticks, y.minorTicks ?? [], yScale).map((p) => (
            <path key={p.key} d={p.d} strokeLinecap="butt" />
          ))}
        </g>
      )}
      {!horizontal && ya.visible &&
        y.ticks.map((t) => (
          <text key={t} x={n2(plot.x - labelOffset(ya) - Y_TICK_LABEL_GAP)} y={n2(yScale(t))} dy="0.35em" textAnchor="end" fontSize={ya.tickFontSizePt} fontWeight={ya.tickBold ? 'bold' : undefined} fill={chart.textColor} {...hit('axis', undefined, 'y')}>
            {y.tickLabel(t)}
          </text>
        ))}
      {!horizontal && xa.visible && (
        <g stroke={chart.axisColor} strokeWidth={xa.lineWidthPt} fill="none" strokeLinecap="square" {...hit('axis', undefined, 'x')}>
          <path d={`M${n2(plot.x)},${n2(categoryAxisY)}H${n2(right)}`} />
          {ed && <path d={`M${n2(plot.x)},${n2(categoryAxisY)}H${n2(right)}`} stroke="transparent" strokeWidth={28} />}
          {categories.map((c) => (
            <path key={c.row} d={tickPath('bottom', c.centerX, categoryAxisY, xa)} strokeLinecap="butt" />
          ))}
        </g>
      )}
      {!horizontal && xa.visible &&
        categories.map((c) => {
          const ty = bottom + labelOffset(xa) + X_TICK_LABEL_GAP + xa.tickFontSizePt * 0.8;
          const common = { fontSize: xa.tickFontSizePt, ...(xa.tickBold ? { fontWeight: 'bold' as const } : {}), fill: chart.textColor, ...hit('axis', undefined, 'x') };
          return layout.xTickRotated ? (
            <text key={c.row} x={n2(c.centerX)} y={n2(ty - xa.tickFontSizePt * 0.4)} textAnchor="end" transform={`rotate(-45 ${n2(c.centerX)} ${n2(ty - xa.tickFontSizePt * 0.4)})`} {...common}>
              {c.label}
            </text>
          ) : (
            <text key={c.row} x={n2(c.centerX)} y={n2(ty)} textAnchor="middle" {...common}>
              {c.label}
            </text>
          );
        })}

      {horizontal && (
        <>
          {ya.visible && (
            <g stroke={chart.axisColor} strokeWidth={ya.lineWidthPt} fill="none" strokeLinecap="square" {...hit('axis', undefined, 'y')}>
              <path d={axisLineD('x', bottom, plot.x, right, xPieces)} />
              {ed && <path d={axisLineD('x', bottom, plot.x, right, xPieces)} stroke="transparent" strokeWidth={28} />}
              <BreakMarks along="x" fixed={bottom} gaps={onPage(yGaps)} mark={ya.breakMark} color={chart.axisColor} width={ya.lineWidthPt} />
              {tickPaths('bottom', bottom, ya, y.ticks, y.minorTicks ?? [], valueX).map((p) => (
                <path key={p.key} d={p.d} strokeLinecap="butt" />
              ))}
            </g>
          )}
          {ya.visible &&
            y.ticks.map((t) => (
              <text key={t} x={n2(valueX(t))} y={n2(bottom + labelOffset(ya) + X_TICK_LABEL_GAP + ya.tickFontSizePt * 0.8)} textAnchor="middle" fontSize={ya.tickFontSizePt} fontWeight={ya.tickBold ? 'bold' : undefined} fill={chart.textColor} {...hit('axis', undefined, 'y')}>
                {y.tickLabel(t)}
              </text>
            ))}
          {xa.visible && (
            <g stroke={chart.axisColor} strokeWidth={xa.lineWidthPt} fill="none" strokeLinecap="square" {...hit('axis', undefined, 'x')}>
              <path d={`M${n2(categoryAxisX)},${n2(plot.y)}V${n2(bottom)}`} />
              {ed && <path d={`M${n2(categoryAxisX)},${n2(plot.y)}V${n2(bottom)}`} stroke="transparent" strokeWidth={28} />}
              {categories.map((c) => (
                <path key={c.row} d={tickPath('left', categoryY(c.centerX), categoryAxisX, xa)} strokeLinecap="butt" />
              ))}
            </g>
          )}
          {xa.visible &&
            categories.map((c) => (
              <text key={c.row} x={n2(plot.x - labelOffset(xa) - Y_TICK_LABEL_GAP)} y={n2(categoryY(c.centerX))} dy="0.35em" textAnchor="end" fontSize={xa.tickFontSizePt} fontWeight={xa.tickBold ? 'bold' : undefined} fill={chart.textColor} {...hit('axis', undefined, 'x')}>
                {c.label}
              </text>
            ))}
        </>
      )}

      <FrameBox chart={chart} plot={plot} lineWidthPt={ya.lineWidthPt} />

      <ScaleBar chart={chart} axis={ya} along={horizontal ? 'x' : 'y'} scale={y} map={horizontal ? valueX : yScale} plot={plot} />
      <ChartTitles chart={chart} layout={layout} bottom={horizontal ? ya : xa} left={horizontal ? xa : ya} hit={hit} />

      {/* Legend: a filled key for bars, a line and symbol for lines. */}
      {layout.legend && (
        <g>
          {layout.legend.items.map((it) => {
            const s = series[model.legendSeries[it.index]];
            const w = keyWidthOf(chart.legend);
            const bars = !model.asLines;
            return (
              <g key={s.groupId} {...hit('legend', s.groupId)}>
                {bars && <rect x={n2(it.x)} y={n2(it.y - 10)} width={w} height={20} fill={s.style.barFill} stroke={s.style.barBorderWidthPt > 0 ? s.style.barBorderColor : 'none'} strokeWidth={s.style.barBorderWidthPt} />}
                {!bars && s.style.showLines && <path d={`M${n2(it.x)},${n2(it.y)}H${n2(it.x + w)}`} stroke={s.style.lineColor} strokeWidth={s.style.lineWidthPt} {...linePattern(s.style)} fill="none" />}
                {!bars && s.style.showSymbols && <path d={symbolPath(s.style.symbolShape, it.x + w / 2, it.y, s.style.symbolSizePt)} fill={s.style.symbolColor} fillOpacity={s.style.symbolFillOpacity < 1 ? s.style.symbolFillOpacity : undefined} stroke={s.style.symbolBorderColor} strokeWidth={s.style.symbolBorderWidthPt} />}
                <text x={n2(it.x + w + LEGEND_KEY.gap)} y={n2(it.y)} dy="0.35em" fontSize={layout.legend!.fontSizePt} fill={chart.textColor}>
                  {it.label}
                </text>
              </g>
            );
          })}
        </g>
      )}

      <AnnotationLayer chart={chart} editor={editor} width={W} height={H} hit={hit} />
    </svg>
  );
});
