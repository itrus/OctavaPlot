import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../defaults';
import { analysesOf, analysisApplies, analysisColumns } from './analysis';
import type { Project } from '../types';
import { addAnalysis, addDataTable, patchAnalysis, removeAnalysis } from '../../state/commands';
import { parseProject, stringifyProject } from '../../state/serialize';
import { describeValues } from '../../stats/descriptive';

const withTable = (kind: Parameters<typeof addDataTable>[1], options?: Parameters<typeof addDataTable>[2]): Project =>
  addDataTable('t', kind, { sample: true, ...options })(createExampleProject());
const table = (p: Project) => p.dataTables.find((t) => t.id === 't')!;

describe('which tables an analysis applies to', () => {
  it('column, XY and grouped tables, not counts or event flags', () => {
    expect(['column', 'xy', 'grouped'].every((k) => analysisApplies(k as never))).toBe(true);
    expect(analysisApplies('contingency')).toBe(false);
    expect(analysisApplies('survival')).toBe(false);
  });
});

describe('the columns analysed', () => {
  it('every column of a column table', () => {
    const cols = analysisColumns(createExampleProject().dataTables[0]);
    expect(cols.map((c) => c.label)).toEqual(['Group A', 'Group B', 'Group C', 'Group D']);
    expect(cols[0].values.slice(0, 5)).toEqual([1.1, 1.2, 1.3, 1.2, 1.4]);
    expect(describeValues(cols[0].values).mean).toBeCloseTo(1.24, 12);
  });

  it('the X column and each Y series of an XY table', () => {
    expect(analysisColumns(table(withTable('xy'))).map((c) => c.label)).toEqual(['X', 'Series A', 'Series B']);
  });

  it('each sub-column of a series, named after the series', () => {
    const p = withTable('xy', { layout: { kind: 'replicates', n: 2 } });
    expect(analysisColumns(table(p)).map((c) => c.label)).toEqual(['X', 'Series A Y1', 'Series A Y2', 'Series B Y1', 'Series B Y2']);
    const g = withTable('grouped', { layout: { kind: 'summary', format: 'mean-sd-n' } });
    expect(analysisColumns(table(g)).map((c) => c.label)).toEqual(['Group A Mean', 'Group A SD', 'Group A N', 'Group B Mean', 'Group B SD', 'Group B N']);
  });

  it('nothing for a table the analysis does not apply to', () => {
    expect(analysisColumns(table(withTable('contingency')))).toEqual([]);
    expect(analysisColumns(table(withTable('survival')))).toEqual([]);
  });

  it('empty cells stay missing, never zero', () => {
    const empty = analysisColumns(table(addDataTable('t', 'column')(createExampleProject())))[0];
    expect(empty.values.every((v) => v === null)).toBe(true);
    expect(describeValues(empty.values).n).toBe(0);
  });
});

describe('analyses in the project', () => {
  it('are added to a suitable table, named after it, and numbered when repeated', () => {
    let p = createExampleProject();
    const id = p.dataTables[0].id;
    p = addAnalysis('a1', id)(p);
    p = addAnalysis('a2', id)(p);
    expect(analysesOf(p).map((a) => a.name)).toEqual(['Descriptive statistics of Data 1', 'Descriptive statistics of Data 1 (2)']);
    expect(analysesOf(p)[0]).toMatchObject({ kind: 'descriptive', dataTableId: id, level: 0.95 });
  });

  it('are refused for a table of counts or event flags', () => {
    const p = addAnalysis('a', 't')(withTable('contingency'));
    expect(analysesOf(p)).toEqual([]);
  });

  it('can be renamed, given another confidence level, and removed', () => {
    let p = addAnalysis('a', createExampleProject().dataTables[0].id)(createExampleProject());
    p = { ...createExampleProject() };
    p = addAnalysis('a', p.dataTables[0].id)(p);
    p = patchAnalysis('a', { name: 'Controls', level: 0.99 })(p);
    expect(analysesOf(p)[0]).toMatchObject({ name: 'Controls', level: 0.99 });
    expect(analysesOf(removeAnalysis('a')(p))).toEqual([]);
  });

  it('are saved and loaded, and one whose table is gone or whose level is bad is repaired or dropped', () => {
    let p = createExampleProject();
    p = addAnalysis('a', p.dataTables[0].id)(p);
    p = patchAnalysis('a', { level: 0.9 })(p);
    expect(parseProject(stringifyProject(p)).analyses).toEqual(p.analyses);
    const file = JSON.parse(stringifyProject(p));
    file.project.analyses[0].level = 7;
    expect(parseProject(JSON.stringify(file)).analyses![0].level).toBe(0.95);
    file.project.analyses.push({ id: 'x', name: 'x', kind: 'descriptive', dataTableId: 'missing', level: 0.95 });
    file.project.analyses.push({ id: 'y', name: 'y', kind: 'nonsense', dataTableId: file.project.dataTables[0].id, level: 0.95 });
    expect(parseProject(JSON.stringify(file)).analyses).toHaveLength(1);
  });

  it('a project from before analyses existed has none', () => {
    const file = JSON.parse(stringifyProject(createExampleProject()));
    expect('analyses' in file.project).toBe(false);
    expect(analysesOf(parseProject(JSON.stringify(file)))).toEqual([]);
  });
});
