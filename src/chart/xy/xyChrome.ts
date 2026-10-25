import type { Chart } from '../../model/types';
import { type SceneElement, el } from '../shared/scene/sceneElement';
import { n2 } from '../../model/units';
import type { XySeries } from './xyModel';
import { fitLines } from './fitCurve';

/** The parts of an XY chart's chrome that only an XY chart (or a survival curve) has: the at-risk table and the fitted parameters. */
export interface AtRiskGeometry {
  xs: number[];
  y0: number;
  rowHeight: number;
  fontSizePt: number;
  rows: Array<{ label: string; color: string; counts: number[] }>;
}

/** The number of subjects still under observation at each time tick, under a survival plot. */
export function atRiskElements(chart: Chart, table: AtRiskGeometry, plotX: number, labelX: number): SceneElement[] {
  return [
    el('g', [['font-size', table.fontSizePt], ['fill', chart.textColor]], {
      id: 'at-risk-table',
      children: [
        el('text', [['x', n2(plotX)], ['y', n2(table.y0 + table.rowHeight * 0.8)], ['font-weight', 'bold'], ['text-anchor', 'start']], { text: 'Number at risk' }),
        ...table.rows.map((r, ri) => {
          const y = table.y0 + table.rowHeight * (ri + 1.8);
          return el('g', [], {
            children: [
              el('text', [['x', n2(labelX)], ['y', n2(y)], ['text-anchor', 'end'], ['fill', r.color], ['font-weight', 'bold']], { text: r.label }),
              ...r.counts.map((n, ci) => el('text', [['x', n2(table.xs[ci])], ['y', n2(y)], ['text-anchor', 'middle'], ['fill', r.color]], { text: String(n) })),
            ],
          });
        }),
      ],
    }),
  ];
}

/** The fitted parameters of each series, one block of lines per curve in the colour of the curve. */
export function fitParameterElements(series: XySeries[], x: number, y: number, fontSizePt: number, level: number): SceneElement[] {
  const size = fontSizePt * 0.7;
  const line = size * 1.3;
  let row = 0;
  const blocks = series.flatMap((s) => (s.fit?.summary ? [{ s, lines: [s.label, ...fitLines(s.fit.summary, level)] }] : []));
  return [
    el('g', [['font-size', size], ['pointer-events', 'none']], {
      id: 'fit-parameters',
      children: blocks.flatMap(({ s, lines }) =>
        lines.map((text, i) => el('text', [['x', x], ['y', y + (row++ + 1) * line], ['fill', s.fitCurveLook?.color ?? s.style.lineColor], ['font-weight', i === 0 ? 'bold' : undefined]], { text })),
      ),
    }),
  ];
}
