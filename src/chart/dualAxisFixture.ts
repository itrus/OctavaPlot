import { createChart, createGroup } from '../model/defaults';
import { newId } from '../model/ids';
import { createRows } from '../model/rows';
import type { AxisBinding, Id, Project } from '../model/types';
import { composeCommands, patchStyle, patchSummary } from '../state/commands';

/** Spec 22.3 L1515: data sets A and B share a small scale, C and D a large one. */
export const DUAL_AXIS_DATA: ReadonlyArray<readonly [string, readonly number[]]> = [
  ['A', [1, 2, 3]],
  ['B', [2, 4, 6]],
  ['C', [100, 200, 300]],
  ['D', [150, 250, 350]],
];

const bindTo = (binding: AxisBinding) => (project: Project, groupIds: readonly Id[]): Project => {
  const chart = project.charts[0];
  return composeCommands(...groupIds.map((id) => patchStyle(chart.id, id, { axisBinding: binding })))(project);
};

/** Binds the data sets to the right Y axis (a pure project transform). */
export const bindRight = bindTo('secondary');
/** Binds the data sets to the left Y axis. */
export const bindLeft = bindTo('primary');

/** One table with A to D (three rows), SD error bars, and C and D on the right axis unless told otherwise. */
export function dualAxisFixture(opts: { bindRight?: boolean } = {}): Project {
  const groups = DUAL_AXIS_DATA.map(([name, values], i) => createGroup(name, i, values.length, [...values]));
  const table = { id: newId('table'), name: 'Dual axis', rowCount: 3, rows: createRows(3), groups };
  const chart = createChart(table.id);
  let project: Project = { id: newId('project'), name: 'Dual axis', dataTables: [table], charts: [chart] };
  project = patchSummary(chart.id, 'all', { spread: 'sd' })(project);
  return opts.bindRight === false ? project : bindRight(project, [groups[2].id, groups[3].id]);
}
