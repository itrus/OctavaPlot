import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../../../model/defaults';
import { legendOffset, sanitizeLegendLayout } from '../../../model/graph/legendEntries';
import type { Project } from '../../../model/types';
import { patchLegend, setLegendOffset } from '../../../state/commands';
import { parseProject, stringifyProject } from '../../../state/serialize';
import { buildColumnModel } from '../../column/columnModel';

const withLegend = (patch: Parameters<typeof patchLegend>[1]): Project => {
  const p0 = createExampleProject();
  return patchLegend(p0.charts[0].id, { visible: true, position: 'right', ...patch })(p0);
};
const layoutOf = (p: Project) => buildColumnModel(p.charts[0], p.dataTables[0]).layout;

describe('the legend offset', () => {
  it('reads from a file as pt within 1000, and none when 0, absent or not a number', () => {
    expect(sanitizeLegendLayout({ offsetXPt: 12.34, offsetYPt: -5 })).toEqual({ offsetXPt: 12.3, offsetYPt: -5 });
    expect(sanitizeLegendLayout({ offsetXPt: 5000, offsetYPt: -5000 })).toEqual({ offsetXPt: 1000, offsetYPt: -1000 });
    expect(sanitizeLegendLayout({ offsetXPt: 0, offsetYPt: 'x' })).toEqual({});
    expect(sanitizeLegendLayout({ offsetXPt: NaN })).toEqual({});
    expect(legendOffset({})).toEqual({ x: 0, y: 0 });
  });

  it('moves the entries and the box of the legend and nothing else', () => {
    const base = layoutOf(withLegend({}));
    const moved = layoutOf(withLegend({ offsetXPt: -40, offsetYPt: 25 }));
    expect(base.legend).not.toBeNull();
    expect(moved.plot).toEqual(base.plot);
    expect(moved.legend!.rect).toEqual({ ...base.legend!.rect, x: base.legend!.rect.x - 40, y: base.legend!.rect.y + 25 });
    expect(moved.legend!.items.map((i) => [i.x, i.y])).toEqual(base.legend!.items.map((i) => [i.x - 40, i.y + 25]));
    expect(moved.legend!.items.map((i) => i.label)).toEqual(base.legend!.items.map((i) => i.label));
  });

  it('moves the legend of every position, and warns when it ends up outside the chart', () => {
    for (const position of ['right', 'top', 'bottom'] as const) {
      const base = layoutOf(withLegend({ position }));
      const moved = layoutOf(withLegend({ position, offsetYPt: 10 }));
      expect(moved.legend!.rect.y).toBeCloseTo(base.legend!.rect.y + 10, 6);
      expect(moved.plot).toEqual(base.plot);
    }
    expect(layoutOf(withLegend({ offsetXPt: 900 })).warnings).toContain('The legend has been moved partly outside the chart.');
    expect(layoutOf(withLegend({ offsetXPt: 2 })).warnings).not.toContain('The legend has been moved partly outside the chart.');
  });

  it('is set by one command, 0 and 0 puts the legend back, and it survives saving', () => {
    const p0 = createExampleProject();
    const id = p0.charts[0].id;
    const moved = setLegendOffset(id, 15, -8)(p0);
    expect(legendOffset(moved.charts[0].legend)).toEqual({ x: 15, y: -8 });
    const reread = parseProject(stringifyProject(moved));
    expect(legendOffset(reread.charts[0].legend)).toEqual({ x: 15, y: -8 });
    const back = setLegendOffset(id, 0, 0)(moved);
    expect('offsetXPt' in back.charts[0].legend || 'offsetYPt' in back.charts[0].legend).toBe(false);
  });

  it('is left out of an old file, which opens unchanged', () => {
    const p = createExampleProject();
    const legend = parseProject(stringifyProject(p)).charts[0].legend;
    expect('offsetXPt' in legend).toBe(false);
  });
});
