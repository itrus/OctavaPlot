import { describe, expect, it } from 'vitest';
import { chartBadge, TABLE_BADGE } from './badges';
import { CHART_TYPES } from './chartTypes';

describe('the tags beside tables and graphs', () => {
  it('give every kind of table a short tag and its name in full', () => {
    expect(Object.keys(TABLE_BADGE).sort()).toEqual(['column', 'contingency', 'grouped', 'survival', 'xy']);
    expect(TABLE_BADGE.column).toEqual({ text: 'COL', title: 'Column table' });
    expect(TABLE_BADGE.xy).toEqual({ text: 'XY', title: 'XY table' });
  });

  it('give every chart type a short capital tag, and the name of the type as its title', () => {
    for (const info of CHART_TYPES) {
      const badge = chartBadge(info.type);
      expect(badge.text).toMatch(/^[A-Z0-9%+]{2,4}$/);
      expect(badge.title).toBe(info.label);
    }
  });

  it('tag the same kind of drawing the same way, whatever the table it comes from', () => {
    expect(chartBadge('bar').text).toBe(chartBadge('groupedBar').text);
    expect(chartBadge('bar').text).toBe(chartBadge('contingencyBars').text);
    expect(chartBadge('box').text).toBe(chartBadge('groupedBox').text);
    expect(chartBadge('violin').text).toBe(chartBadge('groupedViolin').text);
    expect(chartBadge('mean').text).not.toBe(chartBadge('bar').text);
  });

  it('keep different drawings of one table apart', () => {
    for (const kind of ['column', 'xy', 'grouped', 'contingency', 'survival'] as const) {
      const types = CHART_TYPES.filter((c) => c.tableKind === kind);
      const labelsByTag = new Map<string, string[]>();
      for (const t of types) labelsByTag.set(chartBadge(t.type).text, [...(labelsByTag.get(chartBadge(t.type).text) ?? []), t.label]);
      // Two types of one table may share a tag only when they are the same drawing turned (horizontal bars are the same type).
      expect([...labelsByTag.values()].filter((l) => l.length > 1)).toEqual([]);
    }
  });
});
