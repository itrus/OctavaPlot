import { forwardRef, type ReactElement } from 'react';
import type { Chart } from '../model/types';
import { n2 } from '../model/units';
import { BarLabelText } from './BarLabelText';
import { axisGaps, axisPieces } from './axisScale';
import { Turned, AnnotationLayer, axisLineD, Backgrounds, BreakMarks, ChartTitles, type EditorState, FrameBox, PlotClip, ScaleBar, SELECT_COLOR } from './ChartParts';
import { ReferenceLinesLayer } from './ReferenceLinesLayer';
import { referenceLinesOf } from './referenceLines';
import { BarMark, KeyMark } from './FillMarks';
import { GridLines } from './GridLines';
import { hitAttrs } from './hitTest';
import { crossingPosition, tickPath, tickPaths, labelOffset } from './axisTicks';
import { keyWidthOf, LEGEND_KEY, X_TICK_LABEL_GAP, Y_TICK_LABEL_GAP } from './layout';
import type { ChartModel, GroupGeom } from './model';
import { linePattern } from '../model/look';
import { symbolPath } from './symbols';

interface Props {
  chart: Chart;
  model: ChartModel;
  /** Present only in the editor; export renders without it (no selection or hit attributes). */
  editor?: EditorState;
  /** CSS size of the <svg>. Export uses physical mm; the editor applies preview zoom. */
  cssWidth: string;
  cssHeight: string;
}


function LegendSwatch({ g, x, y, chartId, editor, w }: { g: GroupGeom; x: number; y: number; chartId: string; editor: boolean; w: number }): ReactElement {
  const s = g.style;
  if (s.showBars) return <KeyMark style={s} x={x} y={y} chartId={chartId} groupId={g.groupId} editor={editor} width={w} />;
  return (
    <g>
      {s.showLines && <path d={`M${n2(x)},${n2(y)}H${n2(x + w)}`} stroke={s.lineColor} strokeWidth={s.lineWidthPt} {...linePattern(s)} fill="none" />}
      {s.showSymbols && (
        <path d={symbolPath(s.symbolShape, x + w / 2, y, s.symbolSizePt)} fill={s.symbolColor} fillOpacity={s.symbolFillOpacity < 1 ? s.symbolFillOpacity : undefined} stroke={s.symbolBorderColor} strokeWidth={s.symbolBorderWidthPt} />
      )}
    </g>
  );
}

export const ChartSvg = forwardRef<SVGSVGElement, Props>(function ChartSvg({ chart, model, editor, cssWidth, cssHeight }, ref) {
  const { widthPt: W, heightPt: H, layout, groups, y } = model;
  const { plot } = layout;
  const ed = !!editor;
  const hit = (kind: Parameters<typeof hitAttrs>[0], g?: string, o?: string, a?: string) => (ed ? hitAttrs(kind, g, o, a) : {});
  const xa = chart.xAxis;
  const ya = chart.yAxis;
  const plotBottom = plot.y + plot.height;
  const plotRight = plot.x + plot.width;
  const y2a = chart.y2Axis;
  // Horizontal columns: the geometry of the model is the vertical drawing; marks are turned into place by one matrix,
  // symbols and text stay upright at their turned positions (see Orientation in model.ts).
  const { orient } = model;
  const horizontal = orient.horizontal;
  const valueX = (t: number) => orient.toScreen(0, model.yScale(t)).x;
  const categoryY = (cx: number) => orient.toScreen(cx, 0).y;
  // The axis drawn along the bottom and the one down the left, whichever of the two settings they are.
  const bottomAxis = horizontal ? ya : xa;
  // A broken value axis: the pieces of axis that are drawn, and where the gaps are, on the page.
  const valueOrigin = orient.horizontal ? orient.virtual.y + orient.virtual.height : plot.y + plot.height;
  const valueSpan = orient.horizontal ? -orient.virtual.height : -plot.height;
  const valuePieces = axisPieces(y, valueOrigin, valueSpan);
  const valueGaps = axisGaps(y, valueOrigin, valueSpan);
  const onPage = (ranges: Array<[number, number]>): Array<[number, number]> => (horizontal ? ranges.map(([a, b]) => [orient.toScreen(0, b).x, orient.toScreen(0, a).x] as [number, number]) : ranges);
  const clipX = horizontal ? (valuePieces ? onPage(valuePieces) : null) : null;
  const clipY = !horizontal ? valuePieces : null;
  // Where the category axis crosses the value axis (default: the low end); the numbers stay where they are.
  const categoryAxisY = crossingPosition(chart.origin.y, model.y, model.yScale, plotBottom);
  const categoryAxisX = crossingPosition(chart.origin.y, model.y, valueX, plot.x);
  const leftAxis = horizontal ? xa : ya;
  // model.y2 is null while no data set is bound to the right axis; a hidden right axis draws nothing.
  const y2R = model.y2 && model.y2Scale && y2a.visible ? model.y2 : null;
  const y2Scale = model.y2Scale as (v: number) => number;

  // The data set that owns each labelled point; label colour and font weight follow its style.
  const labelOwner = new Map<string, GroupGeom>();
  if (model.labels.items.length > 0) for (const g of groups) for (const p of g.points) labelOwner.set(p.id, g);

  const selectedGroup = editor?.selection.kind === 'group' ? editor.selection.groupId : null;
  const selectedPoint = editor?.selection.kind === 'point' ? editor.selection.pointId : null;

  // Lines and error bars go over the bars and symbols, under them, or (auto) over the bars and under the symbols.
  const onTop = chart.lineOrder === 'onTop';
  const bars = (
    <Turned matrix={orient.matrix}>
        {groups.map((g) => g.bar && <BarMark key={g.bar.id} bar={g.bar} chartId={chart.id} editor={ed} />)}
        {groups.map((g) =>
          g.dist && (
            <g key={`${g.groupId}:dist`} fill="none">
              {g.dist.outline && g.style.showBars && (
                <path d={g.dist.outline} fill={g.style.barFill} fillOpacity={g.style.barOpacity} stroke={g.style.barBorderColor} strokeWidth={g.style.barBorderWidthPt} strokeLinejoin="round" {...hit('bar', g.groupId, `${g.groupId}:bar`)} />
              )}
              {g.dist.lines.map((l) => (
                <path key={l.id} d={l.d} stroke={l.color} strokeWidth={l.strokeWidth} strokeDasharray={l.dash} strokeLinecap="butt" {...hit('bar', g.groupId, `${g.groupId}:bar`)} />
              ))}
            </g>
          ),
        )}
    </Turned>
  );
  const linesAndErrors = (
    <Turned matrix={orient.matrix}>
        {model.pairLines.map((l) => (
          <path key={l.id} d={l.d} fill="none" stroke={l.color} strokeWidth={l.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {groups.map((g) => g.connector && (
          <path key={g.connector.id} d={g.connector.d} fill="none" stroke={g.connector.color} strokeWidth={g.connector.strokeWidth} strokeLinecap="round" {...hit('line', g.groupId, g.connector.id)} />
        ))}
        {groups.map((g) => g.errorBar && (
          <g key={g.errorBar.id} {...hit('error', g.groupId, g.errorBar.id)}>
            <path d={g.errorBar.d} fill="none" stroke={g.errorBar.color} strokeWidth={g.errorBar.strokeWidth} strokeLinecap="butt" />
            {ed && <path d={g.errorBar.d} fill="none" stroke="transparent" strokeWidth={16} />}
          </g>
        ))}
        {groups.map((g) => g.meanLine && (
          <path key={g.meanLine.id} d={g.meanLine.d} fill="none" stroke={g.meanLine.color} strokeWidth={g.meanLine.strokeWidth} strokeLinecap="butt" {...hit('meanLine', g.groupId, g.meanLine.id)} />
        ))}
    </Turned>
  );
  const points = (
    <>
        {groups.map((g) =>
          g.points.map((p) => (
            <path
              key={p.id}
              d={symbolPath(p.shape, orient.toScreen(p.cx, p.cy).x, orient.toScreen(p.cx, p.cy).y, p.size)}
              fill={p.color}
              fillOpacity={p.fillOpacity < 1 ? p.fillOpacity : undefined}
              stroke={p.borderColor}
              strokeWidth={p.borderWidth}
              {...hit('point', g.groupId, p.id)}
            />
          )),
        )}
    </>
  );

  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={cssWidth}
      height={cssHeight}
      viewBox={`0 0 ${n2(W)} ${n2(H)}`}
      fontFamily={chart.fontFamily}
      style={{ background: chart.pageColor ?? 'transparent' }}
    >
      <PlotClip plot={plot} xPieces={clipX} yPieces={clipY} />

      <Backgrounds chart={chart} width={W} height={H} plot={plot} hit={hit} />

      {/* Gridlines (behind data). */}
      {ya.visible &&
        (horizontal ? (
          <GridLines dir="v" grid={chart.grid} major={y.ticks} minor={y.minorTicks ?? []} showMajor={ya.showGrid} showMinor={ya.showMinorGrid} at={valueX} from={plot.y} to={plot.y + plot.height} />
        ) : (
          <GridLines dir="h" grid={chart.grid} major={y.ticks} minor={y.minorTicks ?? []} showMajor={ya.showGrid} showMinor={ya.showMinorGrid} at={model.yScale} from={plot.x} to={plot.x + plot.width} />
        ))}

      {/* Right gridlines: dashed when the left grid is also drawn, so the two sets stay distinguishable. */}
      {y2R && <GridLines dir="h" grid={chart.grid} major={y2R.ticks} minor={y2R.minorTicks ?? []} showMajor={y2a.showGrid} showMinor={y2a.showMinorGrid} at={y2Scale} from={plot.x} to={plot.x + plot.width} fallbackDash={ya.visible && ya.showGrid ? '3 3' : undefined} />}

      <ReferenceLinesLayer lines={referenceLinesOf(chart, { family: 'category', model }).placed} fontSizePt={ya.tickFontSizePt} />

      {/* Data marks, clipped to the plotting region. Error bars are independent of bars and symbols. */}
      <g clipPath="url(#plot-clip)">
        {onTop ? (
          <>
            {bars}
            {points}
            {linesAndErrors}
          </>
        ) : chart.lineOrder === 'underneath' ? (
          <>
            {linesAndErrors}
            {bars}
            {points}
          </>
        ) : (
          <>
            {bars}
            {linesAndErrors}
            {points}
          </>
        )}
      </g>

      {/* Labels above the bars. */}
      {chart.barLabels.show !== 'none' && groups.map((g) => g.barLabel && <BarLabelText key={g.barLabel.id} label={g.barLabel} cfg={chart.barLabels} textColor={chart.textColor} orient={orient} />)}

      {/* Axes. */}
      {!horizontal && (
        <>
      {ya.visible && (
        <g stroke={chart.axisColor} strokeWidth={ya.lineWidthPt} fill="none" strokeLinecap="square" {...hit('axis', undefined, 'y')}>
          <path d={axisLineD('y', plot.x, plot.y, plotBottom, valuePieces)} />
          {ed && <path d={axisLineD('y', plot.x, plot.y, plotBottom, valuePieces)} stroke="transparent" strokeWidth={28} />}
          <BreakMarks along="y" fixed={plot.x} gaps={valueGaps} mark={ya.breakMark} color={chart.axisColor} width={ya.lineWidthPt} />
          {tickPaths('left', plot.x, ya, y.ticks, y.minorTicks ?? [], model.yScale).map((p) => (
            <path key={p.key} d={p.d} strokeLinecap="butt" />
          ))}
        </g>
      )}
      {ya.visible &&
        y.ticks.map((t) => (
          <text
            key={t}
            x={n2(plot.x - labelOffset(ya) - Y_TICK_LABEL_GAP)}
            y={n2(model.yScale(t))}
            dy="0.35em"
            textAnchor="end"
            fontSize={ya.tickFontSizePt}
            fontWeight={ya.tickBold ? 'bold' : undefined}
            fill={chart.textColor}
            {...hit('axis', undefined, 'y')}
          >
            {y.tickLabel(t)}
          </text>
        ))}
      {y2R && (
        <g stroke={chart.axisColor} strokeWidth={y2a.lineWidthPt} fill="none" strokeLinecap="square" {...hit('axis', undefined, 'y2')}>
          <path d={`M${n2(plotRight)},${n2(plot.y)}V${n2(plotBottom)}`} />
          {ed && <path d={`M${n2(plotRight)},${n2(plot.y)}V${n2(plotBottom)}`} stroke="transparent" strokeWidth={28} />}
          {tickPaths('right', plotRight, y2a, y2R.ticks, y2R.minorTicks ?? [], y2Scale).map((p) => (
            <path key={p.key} d={p.d} strokeLinecap="butt" />
          ))}
        </g>
      )}
      {y2R &&
        y2R.ticks.map((t) => (
          <text
            key={t}
            x={n2(plotRight + labelOffset(y2a) + Y_TICK_LABEL_GAP)}
            y={n2(y2Scale(t))}
            dy="0.35em"
            textAnchor="start"
            fontSize={y2a.tickFontSizePt}
            fontWeight={y2a.tickBold ? 'bold' : undefined}
            fill={chart.textColor}
            {...hit('axis', undefined, 'y2')}
          >
            {y2R.tickLabel(t)}
          </text>
        ))}
      {xa.visible && (
        <g stroke={chart.axisColor} strokeWidth={xa.lineWidthPt} fill="none" strokeLinecap="square" {...hit('axis', undefined, 'x')}>
          <path d={`M${n2(plot.x)},${n2(categoryAxisY)}H${n2(plot.x + plot.width)}`} />
          {ed && <path d={`M${n2(plot.x)},${n2(categoryAxisY)}H${n2(plot.x + plot.width)}`} stroke="transparent" strokeWidth={28} />}
          {groups.map((g) => (
            <path key={g.groupId} d={tickPath('bottom', g.centerX, categoryAxisY, xa)} strokeLinecap="butt" />
          ))}
        </g>
      )}
      {xa.visible &&
        groups.map((g) => {
          const ty = plotBottom + labelOffset(xa) + X_TICK_LABEL_GAP + xa.tickFontSizePt * 0.8;
          const common = { fontSize: xa.tickFontSizePt, ...(xa.tickBold ? { fontWeight: 'bold' as const } : {}), fill: chart.textColor, ...hit('axis', undefined, 'x') };
          return layout.xTickRotated ? (
            <text key={g.groupId} x={n2(g.centerX)} y={n2(ty - xa.tickFontSizePt * 0.4)} textAnchor="end" transform={`rotate(-45 ${n2(g.centerX)} ${n2(ty - xa.tickFontSizePt * 0.4)})`} {...common}>
              {g.label}
            </text>
          ) : (
            <text key={g.groupId} x={n2(g.centerX)} y={n2(ty)} textAnchor="middle" {...common}>
              {g.label}
            </text>
          );
        })}

        </>
      )}
      {horizontal && (
        <>
          {ya.visible && (
            <g stroke={chart.axisColor} strokeWidth={ya.lineWidthPt} fill="none" strokeLinecap="square" {...hit('axis', undefined, 'y')}>
              <path d={axisLineD('x', plotBottom, plot.x, plotRight, clipX)} />
              {ed && <path d={axisLineD('x', plotBottom, plot.x, plotRight, clipX)} stroke="transparent" strokeWidth={28} />}
              <BreakMarks along="x" fixed={plotBottom} gaps={onPage(valueGaps)} mark={ya.breakMark} color={chart.axisColor} width={ya.lineWidthPt} />
              {tickPaths('bottom', plotBottom, ya, y.ticks, y.minorTicks ?? [], valueX).map((p) => (
                <path key={p.key} d={p.d} strokeLinecap="butt" />
              ))}
            </g>
          )}
          {ya.visible &&
            y.ticks.map((t) => (
              <text
                key={t}
                x={n2(valueX(t))}
                y={n2(plotBottom + labelOffset(ya) + X_TICK_LABEL_GAP + ya.tickFontSizePt * 0.8)}
                textAnchor="middle"
                fontSize={ya.tickFontSizePt}
                fontWeight={ya.tickBold ? 'bold' : undefined}
                fill={chart.textColor}
                {...hit('axis', undefined, 'y')}
              >
                {y.tickLabel(t)}
              </text>
            ))}
          {xa.visible && (
            <g stroke={chart.axisColor} strokeWidth={xa.lineWidthPt} fill="none" strokeLinecap="square" {...hit('axis', undefined, 'x')}>
              <path d={`M${n2(categoryAxisX)},${n2(plot.y)}V${n2(plotBottom)}`} />
              {ed && <path d={`M${n2(categoryAxisX)},${n2(plot.y)}V${n2(plotBottom)}`} stroke="transparent" strokeWidth={28} />}
              {groups.map((g) => (
                <path key={g.groupId} d={tickPath('left', categoryY(g.centerX), categoryAxisX, xa)} strokeLinecap="butt" />
              ))}
            </g>
          )}
          {xa.visible &&
            groups.map((g) => (
              <text
                key={g.groupId}
                x={n2(plot.x - labelOffset(xa) - Y_TICK_LABEL_GAP)}
                y={n2(categoryY(g.centerX))}
                dy="0.35em"
                textAnchor="end"
                fontSize={xa.tickFontSizePt}
                fontWeight={xa.tickBold ? 'bold' : undefined}
                fill={chart.textColor}
                {...hit('axis', undefined, 'x')}
              >
                {g.label}
              </text>
            ))}
        </>
      )}

      <FrameBox chart={chart} plot={plot} lineWidthPt={ya.lineWidthPt} />

      <ScaleBar chart={chart} axis={ya} along={horizontal ? 'x' : 'y'} scale={y} map={horizontal ? valueX : model.yScale} plot={plot} />
      <ChartTitles chart={chart} layout={layout} bottom={bottomAxis} left={leftAxis} right={y2R ? y2a : null} hit={hit} />

      {/* Legend. */}
      {layout.legend && (
        <g>
          {layout.legend.items.map((it) => {
            const g = groups[model.legendGroups[it.index]];
            return (
              <g key={g.groupId} {...hit('legend', g.groupId)}>
                <LegendSwatch g={g} x={it.x} y={it.y} chartId={chart.id} editor={ed} w={keyWidthOf(chart.legend)} />
                <text x={n2(it.x + keyWidthOf(chart.legend) + LEGEND_KEY.gap)} y={n2(it.y)} dy="0.35em" fontSize={layout.legend!.fontSizePt} fill={chart.textColor}>
                  {it.label}
                </text>
              </g>
            );
          })}
        </g>
      )}

      {/* Point labels: outside the plot clip, leaders first. All coordinates come from the model. */}
      {model.labels.items.length > 0 && (
        <g>
          {model.labels.items.map((it) => {
            const color = it.color ?? chart.textColor;
            return it.leader ? (
              <path key={`leader-${it.id}`} d={`M${n2(it.leader.x1)},${n2(it.leader.y1)}L${n2(it.leader.x2)},${n2(it.leader.y2)}`} fill="none" stroke={color} strokeWidth={1} />
            ) : null;
          })}
          {model.labels.items.map((it) => {
            const owner = labelOwner.get(it.id);
            const color = it.color ?? chart.textColor;
            return (
              <g key={`label-${it.id}`} {...hit('label', owner?.groupId, it.id)}>
                {ed && <rect x={n2(it.box.x0)} y={n2(it.box.y0)} width={n2(it.box.x1 - it.box.x0)} height={n2(it.box.y1 - it.box.y0)} fill="transparent" />}
                <text
                  x={n2(it.x)}
                  y={n2(it.y)}
                  fontSize={it.fontSizePt}
                  fill={color}
                  {...(it.bold ? { fontWeight: 'bold' } : {})}
                  {...(it.italic ? { fontStyle: 'italic' } : {})}
                >
                  {it.shown}
                </text>
              </g>
            );
          })}
        </g>
      )}

      <AnnotationLayer chart={chart} editor={editor} width={W} height={H} hit={hit} />

      {/* Editor-only selection overlay: never rendered in export. */}
      {ed && selectedPoint &&
        groups.flatMap((g) => g.points.filter((p) => p.id === selectedPoint)).map((p) => (
          <circle key={`ring-${p.id}`} data-editor-only cx={n2(p.cx)} cy={n2(p.cy)} r={n2(p.size / 2 + 6)} fill="none" stroke={SELECT_COLOR} strokeWidth={2.4} pointerEvents="none" />
        ))}
      {ed && selectedPoint &&
        model.labels.items.filter((it) => it.id === selectedPoint).map((it) => (
          <rect key={`label-sel-${it.id}`} data-editor-only x={n2(it.box.x0 - 4)} y={n2(it.box.y0 - 4)} width={n2(it.box.x1 - it.box.x0 + 8)} height={n2(it.box.y1 - it.box.y0 + 8)} fill="none" stroke={SELECT_COLOR} strokeWidth={2} strokeDasharray="6 4" pointerEvents="none" />
        ))}

      {ed && selectedGroup &&
        groups
          .filter((g) => g.groupId === selectedGroup)
          .map((g) => (
            <rect
              key={g.groupId}
              data-editor-only
              x={n2(g.slotX)}
              y={n2(plot.y)}
              width={n2(g.slotWidth)}
              height={n2(plot.height)}
              fill={SELECT_COLOR}
              fillOpacity={0.07}
              stroke={SELECT_COLOR}
              strokeWidth={2}
              strokeDasharray="8 6"
              pointerEvents="none"
            />
          ))}
    </svg>
  );
});

export type { EditorState };
