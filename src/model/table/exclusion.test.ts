import { describe, expect, it } from 'vitest';
import { setExcluded } from '../../state/commands';
import { parseProject, stringifyProject } from '../../state/serialize';
import { analysisColumns } from '../project/analysis';
import { effectiveTable } from './chartTable';
import { createExampleProject } from '../defaults';
import { excludedCount, withoutExcluded } from './exclusion';

describe('excluded values', () => {
  const p0 = createExampleProject();
  const t0 = p0.dataTables[0];
  const p1 = setExcluded(t0.id, [{ row: 0, col: 0 }], true, 'pipetting error')(p0);
  const t1 = p1.dataTables[0];

  it('are kept in the table with their reason, and are not missing values', () => {
    expect(t1.groups[0].observations[0]).toMatchObject({ value: t0.groups[0].observations[0].value, excluded: true, excludedReason: 'pipetting error' });
    expect(excludedCount(t1)).toBe(1);
  });
  it('are left out of the charts and the calculations', () => {
    expect(effectiveTable(p1, p1.charts[0])!.groups[0].observations[0].value).toBeNull();
    expect(analysisColumns(t1)[0].values[0]).toBeNull();
    expect(analysisColumns(t0)[0].values[0]).not.toBeNull();
    expect(withoutExcluded(t0)).toBe(t0);
  });
  it('can be included again, and cannot exclude an empty cell', () => {
    const back = setExcluded(t0.id, [{ row: 0, col: 0 }], false)(p1);
    expect(excludedCount(back.dataTables[0])).toBe(0);
    expect(back.dataTables[0].groups[0].observations[0]).toEqual(t0.groups[0].observations[0]);
    const empty = { ...p0, dataTables: [{ ...t0, groups: t0.groups.map((g, i) => (i === 0 ? { ...g, observations: g.observations.map((o, r) => (r === 0 ? { ...o, value: null } : o)) } : g)) }] };
    expect(setExcluded(t0.id, [{ row: 0, col: 0 }], true)(empty)).toBe(empty);
  });
  it('survive saving and opening a project', () => {
    const again = parseProject(stringifyProject(p1));
    expect(again.dataTables[0].groups[0].observations[0]).toMatchObject({ excluded: true, excludedReason: 'pipetting error' });
  });
});
