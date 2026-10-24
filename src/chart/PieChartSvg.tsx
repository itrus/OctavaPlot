import { forwardRef } from 'react';
import type { Chart } from '../model/types';
import { n2 } from '../model/units';
import { AnnotationLayer, Backgrounds, ChartTitles, type EditorState, PlotClip, SELECT_COLOR } from './ChartParts';
import { hitAttrs } from './hitTest';
import { keyWidthOf, LEGEND_KEY } from './layout';
import type { PieModel } from './pieModel';

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
  const { widthPt: W, heightPt: H, layout, pies, parts, legendParts } = model;
  const { plot } = layout;
  const ed = !!editor;
  const hit = (kind: Parameters<typeof hitAttrs>[0], g?: string, o?: string, a?: string) => (ed ? hitAttrs(kind, g, o, a) : {});
  const selectedGroup = editor?.selection.kind === 'group' ? editor.selection.groupId : null;
  const fontPt = chart.xAxis.tickFontSizePt;

  return (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={cssWidth} height={cssHeight} viewBox={`0 0 ${n2(W)} ${n2(H)}`} fontFamily={chart.fontFamily} style={{ background: chart.pageColor ?? 'transparent' }}>
      <PlotClip plot={plot} />
      <Backgrounds chart={chart} width={W} height={H} plot={plot} hit={hit} />

      {pies.map((pie) => (
        <g key={pie.row}>
          {pie.slices.map(
            (s) =>
              s.path !== '' && (
                <path
                  key={s.id}
                  d={s.path}
                  fill={s.style.barFill}
                  fillOpacity={s.style.barOpacity}
                  fillRule="evenodd"
                  stroke={s.style.barBorderColor}
                  strokeWidth={s.style.barBorderWidthPt}
                  strokeLinejoin="round"
                  {...hit('bar', s.groupId, s.id)}
                />
              ),
          )}
          {ed && selectedGroup && pie.slices.map((s) => s.groupId === selectedGroup && s.path !== '' && <path key={`sel-${s.id}`} data-editor-only d={s.path} fill="none" stroke={SELECT_COLOR} strokeWidth={3} strokeDasharray="6 4" pointerEvents="none" />)}
          {pie.slices.map(
            (s) =>
              s.text && (
                <text key={`t-${s.id}`} x={n2(s.text.x)} y={n2(s.text.y)} dy="0.35em" textAnchor={s.text.anchor} fontSize={chart.legend.fontSizePt} fill={chart.textColor}>
                  {s.text.content}
                </text>
              ),
          )}
          <text x={n2(pie.titleAt.x)} y={n2(pie.titleAt.y)} textAnchor="middle" fontSize={fontPt} fontWeight={chart.xAxis.tickBold ? 'bold' : undefined} fill={chart.textColor}>
            {pie.title}
          </text>
          {pie.totalText &&
            (pie.totalInHole ? (
              <text x={n2(pie.cx)} y={n2(pie.cy)} dy="0.35em" textAnchor="middle" fontSize={fontPt} fill={chart.textColor}>
                {pie.totalText}
              </text>
            ) : (
              <text x={n2(pie.titleAt.x)} y={n2(pie.titleAt.y + fontPt * 1.3)} textAnchor="middle" fontSize={fontPt} fill={chart.textColor}>
                {pie.totalText}
              </text>
            ))}
        </g>
      ))}

      <ChartTitles chart={chart} layout={layout} bottom={chart.xAxis} left={chart.yAxis} hit={hit} />

      <AnnotationLayer chart={chart} editor={editor} width={W} height={H} hit={hit} />

      {layout.legend && (
        <g>
          {layout.legend.items.map((it) => {
            const part = parts[legendParts[it.index]];
            const w = keyWidthOf(chart.legend);
            return (
              <g key={part.groupId} {...hit('legend', part.groupId)}>
                <rect x={n2(it.x)} y={n2(it.y - 10)} width={w} height={20} fill={part.style.barFill} fillOpacity={part.style.barOpacity} stroke={part.style.barBorderColor} strokeWidth={part.style.barBorderWidthPt} />
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
