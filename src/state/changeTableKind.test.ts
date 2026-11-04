import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../model/defaults';
import type { Project } from '../model/types';
import { addAnalysis, addChart, addDataTable, changeTableKind, composeCommands } from './commands';

const table = (p: Project) => p.dataTables.find((t) => t.id === 't1')!;
const chart = (p: Project) => p.charts.find((c) => c.id === 'c1')!;
const xyProject = () => composeCommands(addDataTable('t1', 'xy', { sample: true, layout: { kind: 'replicates', n: 3 } }), addChart('c1', 't1', undefined, 'xyScatter'), addAnalysis('a1', 't1', 'curvefit'))(createEmptyProject());

describe('changeTableKind', () => {
  it('keeps the data, drops the layout of subcolumns and gives the graphs a type of the new kind', () => {
    const p = xyProject();
    const columns = table(p).groups.map((g) => g.observations.map((o) => o.value));
    const q = changeTableKind('t1', 'column')(p);
    expect(table(q).kind).toBe('column');
    expect(table(q).layout).toBeUndefined();
    expect(table(q).groups.map((g) => g.observations.map((o) => o.value))).toEqual(columns);
    expect(chart(q).type).toBe('bar');
  });

  it('removes the calculations that do not apply to the new type', () => {
    const p = xyProject();
    expect((p.analyses ?? []).some((a) => a.id === 'a1')).toBe(true);
    const q = changeTableKind('t1', 'contingency')(p);
    expect((q.analyses ?? []).some((a) => a.id === 'a1')).toBe(false);
    expect(chart(q).type).toBe('pie');
  });

  it('keeps a graph whose type belongs to the new kind, and does nothing for the same kind or a missing table', () => {
    const p = composeCommands(addDataTable('t1', 'column', { sample: true }), addChart('c1', 't1', undefined, 'histogram'))(createEmptyProject());
    expect(chart(p).type).toBe('histogram');
    expect(changeTableKind('t1', 'column')(p)).toBe(p);
    expect(changeTableKind('nope', 'xy')(p)).toBe(p);
  });

  describe('the subtype (the layout of the series)', () => {
    const names = (p: Project) => table(p).groups.map((g) => g.name);
    const values = (p: Project) => table(p).groups.map((g) => g.observations.map((o) => o.value));

    it('single to replicates: the columns are read in series of n, a series the columns do not fill is completed, and the values stay', () => {
      const p = composeCommands(addDataTable('t1', 'xy', { sample: true }))(createEmptyProject());
      const before = values(p);
      // X and two Y columns: three subcolumns make one series, so one empty column is added.
      const q = changeTableKind('t1', 'xy', { kind: 'replicates', n: 3 })(p);
      expect(table(q).layout).toEqual({ kind: 'replicates', n: 3 });
      expect(names(q)).toEqual(['X', 'Y1', 'Y2', 'Y3']);
      expect(table(q).groups[1].title).not.toBe('');
      expect(values(q).slice(0, 3)).toEqual(before);
      expect(table(q).groups[3].observations.every((o) => o.value === null)).toBe(true);
    });

    it('replicates to single: each subcolumn is a column of its own, named after its series', () => {
      const p = composeCommands(addDataTable('t1', 'xy', { sample: true, layout: { kind: 'replicates', n: 3 } }))(createEmptyProject());
      const before = values(p);
      const title = table(p).groups[1].title;
      const q = changeTableKind('t1', 'xy', { kind: 'single' })(p);
      expect(table(q).layout).toBeUndefined();
      expect(values(q)).toEqual(before);
      expect(names(q)[1]).toBe(title);
      expect(names(q)[2]).toBe(`${title} Y2`);
    });

    it('replicates to a layout of the same width keeps the series names and changes the headings', () => {
      const p = composeCommands(addDataTable('t1', 'xy', { sample: true, layout: { kind: 'replicates', n: 3 } }))(createEmptyProject());
      const title = table(p).groups[1].title;
      const q = changeTableKind('t1', 'xy', { kind: 'summary', format: 'mean-sd-n' })(p);
      expect(names(q).slice(1, 4)).toEqual(['Mean', 'SD', 'N']);
      expect(table(q).groups[1].title).toBe(title);
    });

    it('the same type and layout does nothing', () => {
      const p = composeCommands(addDataTable('t1', 'xy', { sample: true, layout: { kind: 'replicates', n: 3 } }))(createEmptyProject());
      expect(changeTableKind('t1', 'xy', { kind: 'replicates', n: 3 })(p)).toBe(p);
    });
  });
});
