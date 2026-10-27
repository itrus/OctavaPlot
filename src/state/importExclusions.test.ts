import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../model/defaults';
import { importCsv, tableToCsv } from '../ui/data/csv';
import { composeCommands, replaceTableData, setCells, setExcluded } from './commands';

describe('importing a CSV with exclusion columns', () => {
  it('puts the exclusions back on the values, so export then import closes the round trip', () => {
    const p0 = createExampleProject();
    const id = p0.dataTables[0].id;
    const p1 = composeCommands(setCells(id, [{ row: 0, col: 0, value: 5 }, { row: 1, col: 0, value: 6 }]), setExcluded(id, [{ row: 1, col: 0 }], true, 'outlier'))(p0);
    const csv = tableToCsv(p1.dataTables[0], 'auto', 'withExclusions');
    const r = importCsv(csv);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const t = replaceTableData(id, r.data)(p0).dataTables[0];
    expect(t.groups.length).toBe(p1.dataTables[0].groups.length);
    expect(t.groups[0].observations[1]).toMatchObject({ value: 6, excluded: true, excludedReason: 'outlier' });
    expect(t.groups[0].observations[0].excluded).toBeUndefined();
  });
});
