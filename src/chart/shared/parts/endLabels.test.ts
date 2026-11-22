import { describe, expect, it } from 'vitest';
import { createChart, createExampleProject } from '../../../model/defaults';
import { chartPx2Pt } from '../../../model/units';
import { buildColumnModel } from '../../column/columnModel';
import { measureText } from './text';

describe('the numbers at the ends of a horizontal value axis', () => {
  it('stay inside the image: the last one (100) has room beyond the plot, with the legend off', () => {
    const p = createExampleProject();
    const table = p.dataTables[0];
    const base = createChart(table.id, undefined, 'bar');
    const chart = { ...base, orientation: 'horizontal' as const, legend: { ...base.legend, visible: false }, yAxis: { ...base.yAxis, min: 0, max: 100 } };
    const m = buildColumnModel(chart, table);
    const W = chartPx2Pt(chart.widthPx);
    const f = chart.yAxis.tickFontSizePt;
    const last = measureText('100', f, chart.yAxis.tickBold, false, chart.fontFamily);
    expect(m.layout.plot.x + m.layout.plot.width + last / 2).toBeLessThanOrEqual(W);
  });
});
