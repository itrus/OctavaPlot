import { createChart, createGroup } from '../model/defaults';
import { FILL_PATTERNS } from '../model/fill';
import { newId } from '../model/ids';
import { createRows } from '../model/rows';
import type { ChartStyle, Project } from '../model/types';
import { composeCommands, patchAxis, patchStyle } from '../state/commands';

/**
 * Visual fixture for the bar fill modes (P: spec 22.3 has no pattern row).
 * Nine data sets, in order: the seven patterns, then one solid, then one none.
 * Data set 2 is negative. The Y range is manual, -2 to 3, so zero is inside it.
 */
export const BAR_FILL_FIXTURE_DATA: ReadonlyArray<readonly [string, readonly number[]]> = [
  ['Horizontal', [1.0, 1.2, 1.4]],
  ['Vertical', [1.6, 1.8, 2.0]],
  ['Rising', [-1.4, -1.2, -1.0]],
  ['Falling', [0.6, 0.8, 1.0]],
  ['Crosshatch', [2.0, 2.2, 2.4]],
  ['Diagonal cross', [1.2, 1.4, 1.6]],
  ['Dots', [0.8, 1.0, 1.2]],
  ['Solid', [1.4, 1.6, 1.8]],
  ['None', [1.0, 1.2, 1.4]],
];

/** Number of data sets that use a pattern, one per pattern. */
export const BAR_FILL_PATTERN_COUNT = FILL_PATTERNS.length;

/** Index of the negative data set. */
export const BAR_FILL_NEGATIVE_INDEX = 2;

/** Data sets with a legend key frame: the patterns and the none one. */
export const BAR_FILL_KEY_FRAMES = BAR_FILL_PATTERN_COUNT + 1;

/** Bar fill fixture. With `opacity` every data set is drawn at 0.5 and the gridlines are on. */
export function barFillFixture(opts: { opacity?: boolean } = {}): Project {
  const groups = BAR_FILL_FIXTURE_DATA.map(([name, values], i) => createGroup(name, i, values.length, [...values]));
  const table = { id: newId('table'), name: 'Bar fills', rowCount: 3, rows: createRows(3), groups };
  const chart = createChart(table.id);
  const project: Project = { id: newId('project'), name: 'Bar fills', dataTables: [table], charts: [chart] };
  const common: Partial<ChartStyle> = opts.opacity ? { barOpacity: 0.5 } : {};
  const commands = groups.map((g, i) => {
    const patch: Partial<ChartStyle> =
      i < BAR_FILL_PATTERN_COUNT
        ? { ...common, barFillMode: 'pattern', barPattern: FILL_PATTERNS[i], barPatternSpacingPt: 6, barPatternWidthPt: 1 }
        : i === BAR_FILL_PATTERN_COUNT
          ? { ...common, barFillMode: 'solid' }
          : { ...common, barFillMode: 'none' };
    return patchStyle(chart.id, g.id, patch);
  });
  return composeCommands(
    ...commands,
    patchAxis(chart.id, 'yAxis', { min: -2, max: 3, showGrid: opts.opacity === true }),
    (p) => ({ ...p, charts: p.charts.map((c) => ({ ...c, legend: { ...c.legend, visible: true } })) }),
  )(project);
}
