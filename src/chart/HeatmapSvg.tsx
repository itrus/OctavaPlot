import { forwardRef } from 'react';
import { numberStartPt } from '../model/axis';
import type { Chart } from '../model/types';
import { n2 } from '../model/units';
import { AnnotationLayer, Backgrounds, ChartTitles, type EditorState, PlotClip } from './ChartParts';
import type { HeatModel } from './heatmapModel';
import { hitAttrs } from './hitTest';
import { X_TICK_LABEL_GAP, Y_TICK_LABEL_GAP } from './layout';
import { measureText } from './text';

const SMALLEST_LABEL_PT = 8;

/**
 * The font size at which a cell's text fits both its width and its height, or null when even the smallest legible size does
 * not fit: a label that cannot be read is left out (its value stays in the tooltip), not squeezed or spilled over the neighbours.
 */
export function fitCellLabel(text: string, widthPt: number, heightPt: number, maxFontPt: number, family?: string): number | null {
  const room = Math.min(maxFontPt, heightPt * 0.8);
  if (!(room >= SMALLEST_LABEL_PT) || !(widthPt > 0)) return null;
  const wide = measureText(text, room, false, false, family);
  const size = wide <= widthPt * 0.95 ? room : (room * widthPt * 0.95) / wide;
  return size >= SMALLEST_LABEL_PT ? size : null;
}

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
  const { widthPt: W, heightPt: H, layout, cells, bar } = model;
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

      {cells.map((c) => {
        const labelSize = c.text ? fitCellLabel(c.text, c.width, c.height, chart.legend.fontSizePt, chart.fontFamily) : null;
        return (
        <g key={c.id}>
          <rect x={n2(c.x)} y={n2(c.y)} width={n2(c.width)} height={n2(c.height)} fill={c.fill} {...hit('bar', c.seriesId, c.id)} />
          {c.text && labelSize !== null && (
            <text x={n2(c.x + c.width / 2)} y={n2(c.y + c.height / 2)} dy="0.35em" textAnchor="middle" fontSize={n2(labelSize)} fill={c.textColour} pointerEvents="none">
              {c.text}
            </text>
          )}
        </g>
        );
      })}

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

      {bar && (
        <g>
          {bar.strips.map((s, i) => (
            <rect key={i} x={n2(bar.rect.x)} y={n2(s.y)} width={n2(bar.rect.width)} height={n2(s.height)} fill={s.fill} />
          ))}
          <rect x={n2(bar.rect.x)} y={n2(bar.rect.y)} width={n2(bar.rect.width)} height={n2(bar.rect.height)} fill="none" stroke={chart.axisColor} strokeWidth={1.5} />
          {bar.ticks.map((t) => (
            <g key={t.value}>
              <path d={`M${n2(bar.rect.x + bar.rect.width)},${n2(t.y)}h6`} stroke={chart.axisColor} strokeWidth={1.5} fill="none" />
              <text x={n2(bar.rect.x + bar.rect.width + 12)} y={n2(t.y)} dy="0.35em" fontSize={chart.legend.fontSizePt} fill={chart.textColor}>
                {String(Number(t.value.toPrecision(6)))}
              </text>
            </g>
          ))}
        </g>
      )}

      <ChartTitles chart={chart} layout={layout} bottom={xa} left={ya} hit={hit} />
      <AnnotationLayer chart={chart} editor={editor} width={W} height={H} hit={hit} />
    </svg>
  );
});
