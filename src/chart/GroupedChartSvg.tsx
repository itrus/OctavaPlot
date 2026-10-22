import { forwardRef } from 'react';
import { FONT_FAMILY } from '../model/defaults';
import type { Chart } from '../model/types';
import { n2 } from '../model/units';
import { annotationBox, type EditorState } from './ChartSvg';
import type { GroupedModel } from './groupedModel';
import { hitAttrs } from './hitTest';
import { LEGEND_KEY, TICK_LENGTH, X_TICK_LABEL_GAP, Y_TICK_LABEL_GAP } from './layout';
import { symbolPath } from './symbols';

interface Props {
  chart: Chart;
  model: GroupedModel;
  /** Present only in the editor; export renders without it (no selection or hit attributes). */
  editor?: EditorState;
  cssWidth: string;
  cssHeight: string;
}

const AXIS_COLOR = '#000000';
const GRID_COLOR = '#d0d0d0';
const SELECT_COLOR = '#2b7fff';

/** Bars (side by side, stacked or as shares) or lines over the categories of a grouped or contingency table. */
export const GroupedChartSvg = forwardRef<SVGSVGElement, Props>(function GroupedChartSvg({ chart, model, editor, cssWidth, cssHeight }, ref) {
  const { widthPt: W, heightPt: H, layout, series, categories, y, yScale } = model;
  const { plot } = layout;
  const ed = !!editor;
  const hit = (kind: Parameters<typeof hitAttrs>[0], g?: string, o?: string, a?: string) => (ed ? hitAttrs(kind, g, o, a) : {});
  const xa = chart.xAxis;
  const ya = chart.yAxis;
  const bottom = plot.y + plot.height;
  const right = plot.x + plot.width;
  const selectedGroup = editor?.selection.kind === 'group' ? editor.selection.groupId : null;
  const selectedAnnotation = editor?.selection.kind === 'annotation' ? editor.selection.annotationId : null;

  return (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={cssWidth} height={cssHeight} viewBox={`0 0 ${n2(W)} ${n2(H)}`} fontFamily={FONT_FAMILY} style={{ background: '#ffffff' }}>
      <defs>
        <clipPath id="plot-clip">
          <rect x={n2(plot.x)} y={n2(plot.y)} width={n2(plot.width)} height={n2(plot.height)} />
        </clipPath>
      </defs>
      <rect x={0} y={0} width={n2(W)} height={n2(H)} fill="#ffffff" {...hit('background')} />
      <rect x={n2(plot.x)} y={n2(plot.y)} width={n2(plot.width)} height={n2(plot.height)} fill="#ffffff" {...hit('background')} />

      {ya.visible && ya.showGrid && (
        <g stroke={GRID_COLOR} strokeWidth={0.5} fill="none">
          {y.ticks.map((t) => (
            <path key={t} d={`M${n2(plot.x)},${n2(yScale(t))}H${n2(right)}`} />
          ))}
        </g>
      )}

      {/* Data, clipped to the plotting region: bars, then error bars, then lines and their symbols. */}
      <g clipPath="url(#plot-clip)">
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
        {series.map(
          (s) =>
            s.style.showLines &&
            s.linePath !== '' && (
              <g key={`line-${s.groupId}`}>
                <path d={s.linePath} fill="none" stroke={s.style.lineColor} strokeWidth={s.style.lineWidthPt} strokeLinecap="round" strokeLinejoin="round" {...hit('line', s.groupId)} />
                {selectedGroup === s.groupId && <path data-editor-only d={s.linePath} fill="none" stroke={SELECT_COLOR} strokeOpacity={0.35} strokeWidth={s.style.lineWidthPt + 5} strokeLinecap="round" pointerEvents="none" />}
              </g>
            ),
        )}
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
              <path key={p.id} d={symbolPath(s.style.symbolShape, p.px, p.py, s.style.symbolSizePt)} fill={s.style.symbolColor} stroke={s.style.symbolBorderColor} strokeWidth={s.style.symbolBorderWidthPt} {...hit('point', s.groupId, p.id)} />
            )),
        )}
        {series.map((s) =>
          s.dots.map((p) => (
            <path key={p.id} d={symbolPath(s.style.symbolShape, p.px, p.py, s.style.symbolSizePt)} fill={s.style.symbolColor} stroke={s.style.symbolBorderColor} strokeWidth={s.style.symbolBorderWidthPt} {...hit('point', s.groupId, p.id)} />
          )),
        )}
        {ed &&
          selectedGroup &&
          series
            .filter((s) => s.groupId === selectedGroup)
            .flatMap((s) => s.bars.map((b) => <rect key={`sel-${b.id}`} data-editor-only x={n2(b.x - 1.5)} y={n2(b.y - 1.5)} width={n2(b.width + 3)} height={n2(b.height + 3)} fill="none" stroke={SELECT_COLOR} strokeWidth={1.2} strokeDasharray="3 2" pointerEvents="none" />))}
      </g>

      {/* Axes. */}
      {ya.visible && (
        <g stroke={AXIS_COLOR} strokeWidth={ya.lineWidthPt} fill="none" strokeLinecap="square" {...hit('axis', undefined, 'y')}>
          <path d={`M${n2(plot.x)},${n2(plot.y)}V${n2(bottom)}`} />
          {ed && <path d={`M${n2(plot.x)},${n2(plot.y)}V${n2(bottom)}`} stroke="transparent" strokeWidth={14} />}
          {y.ticks.map((t) => (
            <path key={t} d={`M${n2(plot.x)},${n2(yScale(t))}h${-TICK_LENGTH}`} strokeLinecap="butt" />
          ))}
        </g>
      )}
      {ya.visible &&
        y.ticks.map((t) => (
          <text key={t} x={n2(plot.x - TICK_LENGTH - Y_TICK_LABEL_GAP)} y={n2(yScale(t))} dy="0.35em" textAnchor="end" fontSize={ya.tickFontSizePt} fontWeight="bold" fill={AXIS_COLOR} {...hit('axis', undefined, 'y')}>
            {y.tickLabel(t)}
          </text>
        ))}
      {xa.visible && (
        <g stroke={AXIS_COLOR} strokeWidth={xa.lineWidthPt} fill="none" strokeLinecap="square" {...hit('axis', undefined, 'x')}>
          <path d={`M${n2(plot.x)},${n2(bottom)}H${n2(right)}`} />
          {ed && <path d={`M${n2(plot.x)},${n2(bottom)}H${n2(right)}`} stroke="transparent" strokeWidth={14} />}
          {categories.map((c) => (
            <path key={c.row} d={`M${n2(c.centerX)},${n2(bottom)}v${TICK_LENGTH}`} strokeLinecap="butt" />
          ))}
        </g>
      )}
      {xa.visible &&
        categories.map((c) => {
          const ty = bottom + TICK_LENGTH + X_TICK_LABEL_GAP + xa.tickFontSizePt * 0.8;
          const common = { fontSize: xa.tickFontSizePt, fontWeight: 'bold' as const, fill: AXIS_COLOR, ...hit('axis', undefined, 'x') };
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

      {/* Titles. */}
      {layout.title && (
        <text x={n2(layout.title.x)} y={n2(layout.title.y)} textAnchor="middle" fontSize={layout.title.fontSizePt} fontWeight="bold" fill={AXIS_COLOR} {...hit('title')}>
          {chart.title}
        </text>
      )}
      {layout.xTitle && (
        <text x={n2(layout.xTitle.x)} y={n2(layout.xTitle.y)} textAnchor="middle" fontSize={xa.titleFontSizePt} fontWeight="bold" fill={AXIS_COLOR} {...hit('title')}>
          {xa.title}
        </text>
      )}
      {layout.yTitle && (
        <text x={n2(layout.yTitle.x)} y={n2(layout.yTitle.y)} textAnchor="middle" transform={`rotate(-90 ${n2(layout.yTitle.x)} ${n2(layout.yTitle.y)})`} fontSize={ya.titleFontSizePt} fontWeight="bold" fill={AXIS_COLOR} {...hit('title')}>
          {ya.title}
        </text>
      )}

      {/* Legend: a filled key for bars, a line and symbol for lines. */}
      {layout.legend && (
        <g>
          {layout.legend.items.map((it) => {
            const s = series[model.legendSeries[it.index]];
            const w = LEGEND_KEY.width;
            const bars = !model.asLines;
            return (
              <g key={s.groupId} {...hit('legend', s.groupId)}>
                {bars && <rect x={n2(it.x)} y={n2(it.y - 5)} width={w} height={10} fill={s.style.barFill} stroke={s.style.barBorderWidthPt > 0 ? s.style.barBorderColor : 'none'} strokeWidth={s.style.barBorderWidthPt} />}
                {!bars && s.style.showLines && <path d={`M${n2(it.x)},${n2(it.y)}H${n2(it.x + w)}`} stroke={s.style.lineColor} strokeWidth={s.style.lineWidthPt} fill="none" />}
                {!bars && s.style.showSymbols && <path d={symbolPath(s.style.symbolShape, it.x + w / 2, it.y, s.style.symbolSizePt)} fill={s.style.symbolColor} stroke={s.style.symbolBorderColor} strokeWidth={s.style.symbolBorderWidthPt} />}
                <text x={n2(it.x + w + LEGEND_KEY.gap)} y={n2(it.y)} dy="0.35em" fontSize={layout.legend!.fontSizePt} fill={AXIS_COLOR}>
                  {it.label}
                </text>
              </g>
            );
          })}
        </g>
      )}

      {/* Annotations. */}
      {chart.annotations.map((a) => {
        const drag = editor?.dragging?.id === a.id ? editor.dragging : null;
        const ax = (drag ? drag.xFrac : a.xFrac) * W;
        const ay = (drag ? drag.yFrac : a.yFrac) * H;
        const box = annotationBox(a, ax, ay);
        return (
          <g key={a.id} {...hit('annotation', undefined, undefined, a.id)}>
            {ed && <rect x={n2(box.x - 3)} y={n2(box.y - 3)} width={n2(box.w + 6)} height={n2(box.h + 6)} fill="transparent" />}
            <text x={n2(ax)} fontSize={a.fontSizePt} fill={a.color}>
              {box.lines.map((line, i) => (
                <tspan key={i} x={n2(ax)} y={n2(ay + a.fontSizePt * 0.9 + i * a.fontSizePt * 1.2)}>
                  {line === '' ? ' ' : line}
                </tspan>
              ))}
            </text>
            {selectedAnnotation === a.id && <rect data-editor-only x={n2(box.x - 3)} y={n2(box.y - 3)} width={n2(box.w + 6)} height={n2(box.h + 6)} fill="none" stroke={SELECT_COLOR} strokeWidth={1} strokeDasharray="3 2" pointerEvents="none" />}
          </g>
        );
      })}
    </svg>
  );
});
