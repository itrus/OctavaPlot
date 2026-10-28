import { describe, expect, it } from 'vitest';
import { buildSurvivalModel, kaplanMeier, medianSurvival, readSurvivalSubjects } from '../../chart/survival/survivalModel';
import { createExampleProject } from '../../model/defaults';
import { ANALYSIS_TYPES, analysisKindApplies } from '../../model/project/analysis';
import type { Project } from '../../model/types';
import { addAnalysis, addChart, addDataTable, replaceTableData, setExcluded } from '../../state/commands';
import { parseProject, stringifyProject } from '../../state/serialize';
import { survivalSheet } from './survivalSheet';

const tableOf = (p: Project) => p.dataTables.find((t) => t.id === 't')!;
/** A survival table: the times down the first column and, for each group, 1 (event) or 0 (censored) on the row of the subject. */
const make = (rows: Array<Array<number | null>>, names = ['Time', 'A', 'B']): Project =>
  replaceTableData('t', { names, titles: null, values: rows })(addDataTable('t', 'survival', { sample: true })(createExampleProject()));
const row = (sheet: ReturnType<typeof survivalSheet>, key: string) => sheet.rows.find((r) => r.key === key)!;

describe('survival summary: the Results of a survival table', () => {
  // A: events at 10, 50 and 90, a censoring at 95 (the estimate is 0.75, 0.5, 0.25). B: one event of four.
  const rows = [[10, 1, 1], [50, 1, 0], [90, 1, 0], [95, 0, 0]];

  it('gives the subjects, events and censored of each group', () => {
    const s = survivalSheet(tableOf(make(rows)));
    expect(s.columns.map((c) => c.label)).toEqual(['A', 'B']);
    expect(row(s, 'n').cells).toEqual(['4', '4']);
    expect(row(s, 'events').cells).toEqual(['3', '1']);
    expect(row(s, 'censored').cells).toEqual(['1', '3']);
  });
  it('gives the median as the first time the Kaplan-Meier estimate is 0.5 or below, and "Not reached" when it never gets there', () => {
    const s = survivalSheet(tableOf(make(rows)));
    expect(row(s, 'median').cells).toEqual(['50', 'Not reached']);
    expect(row(s, 'median').exact).toEqual(['50', 'Not reached']);
  });
  it('agrees with the estimate the chart draws: the same subjects, the same median', () => {
    const t = tableOf(make(rows));
    const [a, b] = readSurvivalSubjects(t).map((g) => kaplanMeier(g.subjects));
    expect(medianSurvival(a)).toBe(50);
    expect(medianSurvival(b)).toBeNull();
    // The chart's own steps for group A: 0.75, 0.5, 0.25.
    const p = addChart('c', 't', undefined, 'survival')(make(rows));
    const m = buildSurvivalModel(p.charts.find((c) => c.id === 'c')!, tableOf(p));
    expect(m.series).toHaveLength(2);
    expect(a.steps.map((x) => x.survival)).toEqual([0.75, 0.5, 0.25]);
  });
  it('is the exact time in the copy and files, and five significant digits on the screen', () => {
    const s = survivalSheet(tableOf(make([[12.3456789, 1], [20, 1], [30, 0]], ['Time', 'A'])));
    // Two events of three: 2/3 after the first, then 1/3 after the second: the median is the second time, 20.
    expect(row(s, 'median').cells).toEqual(['20']);
    const t = survivalSheet(tableOf(make([[12.3456789, 1], [12.3456789, 1], [30, 0]], ['Time', 'A'])));
    expect(row(t, 'median').cells).toEqual(['12.346']);
    expect(row(t, 'median').exact).toEqual(['12.3456789']);
  });
  it('counts the entries that are neither 1 nor 0 and the subjects with no valid time as left out, as the chart does', () => {
    const p = make([[10, 1, 2], [-5, 1, 1], [null, 1, 0], [40, 0, 1]]);
    const s = survivalSheet(tableOf(p));
    // A: the row with a negative time and the row with no time are left out. B: the entry 2 is left out, and the same two rows.
    expect(row(s, 'left').cells).toEqual(['2', '3']);
    expect(row(s, 'n').cells).toEqual(['2', '1']);
    const withChart = addChart('c', 't', undefined, 'survival')(p);
    const w = buildSurvivalModel(withChart.charts.find((c) => c.id === 'c')!, tableOf(withChart)).warnings.join(' ');
    expect(w).toMatch(/1 entry is neither 1 \(event\) nor 0 \(censored\)/);
    // The chart counts over all groups: A has two rows with no valid time, B has the same two.
    expect(w).toMatch(/4 subjects have no valid time/);
  });
  it('leaves out an excluded value, as the chart does', () => {
    let p = make(rows);
    p = setExcluded('t', [{ col: 1, row: 0 }], true)(p);
    const s = survivalSheet(tableOf(p));
    expect(row(s, 'n').cells[0]).toBe('3');
    expect(row(s, 'events').cells[0]).toBe('2');
  });
  it('has no groups for a table with none, and does not fail on an empty column', () => {
    expect(survivalSheet(tableOf(make([[null, null, null]]))).rows.length).toBeGreaterThan(0);
    const s = survivalSheet(tableOf(make([[null, null, null]])));
    expect(row(s, 'n').cells).toEqual(['0', '0']);
    expect(row(s, 'median').cells).toEqual(['Not reached', 'Not reached']);
  });
});

describe('survival summary: the analysis', () => {
  it('applies to survival tables only, and descriptive statistics do not apply to them', () => {
    expect(analysisKindApplies('survival', 'survival')).toBe(true);
    for (const kind of ['column', 'xy', 'grouped', 'contingency'] as const) expect(analysisKindApplies('survival', kind)).toBe(false);
    expect(analysisKindApplies('descriptive', 'survival')).toBe(false);
    expect(ANALYSIS_TYPES.map((a) => a.kind)).toContain('survival');
  });
  it('can be added to a survival table and not to another, and survives save and reopen', () => {
    const p = make([[10, 1, 1]]);
    const added = addAnalysis('a', 't', 'survival')(p);
    expect(added.analyses).toHaveLength(1);
    expect(added.analyses![0].kind).toBe('survival');
    expect(added.analyses![0].name).toBe('Survival summary of ' + tableOf(p).name);
    const back = parseProject(stringifyProject(added));
    expect(back.analyses?.[0]).toMatchObject({ kind: 'survival', dataTableId: 't' });
    const other = addDataTable('c', 'column', { sample: true })(p);
    expect(addAnalysis('b', 'c', 'survival')(other).analyses ?? []).toHaveLength(0);
  });
});
