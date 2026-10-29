import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../../model/defaults';
import { NO_FIT_SETTINGS } from '../../model/options/fitOptions';
import type { Project } from '../../model/types';
import { addChart, addDataTable, patchAxis, patchChart, replaceTableData, setColumnTime } from '../../state/commands';
import { parseProject, stringifyProject } from '../../state/serialize';
import { civilFromDays, timeColumn } from '../../util/timeColumn';
import { fitObservations } from '../../model/project/curveFit';
import { chartToSvgString } from '../export/export';
import { xyTooltipLines } from '../tooltip';
import { buildXyModel } from './xyModel';

// Days from 1970-01-01 of the first day of each quarter from 2024 to 2025 (2024-01-01 = 19723, 2025-01-01 = 20089 by their Unix times).
const QUARTERS = [19723, 19814, 19905, 19997, 20089];
const Y = [1, 2, 3, 4, 5];

const tableOf = (p: Project) => p.dataTables.find((t) => t.id === 't')!;
const chartOf = (p: Project) => p.charts.find((c) => c.id === 'c')!;
const model = (p: Project, fit = NO_FIT_SETTINGS) => buildXyModel(chartOf(p), tableOf(p), fit);
const setup = (x: number[] = QUARTERS, time: ReturnType<typeof timeColumn> | null = timeColumn('date')): Project => {
  let p = addDataTable('t', 'xy', { sample: true })(createExampleProject());
  p = replaceTableData('t', { names: ['Day', 'A'], titles: null, values: x.map((v, i) => [v, Y[i]]) })(p);
  p = addChart('c', 't', undefined, 'xyLineSymbols')(p);
  return time ? setColumnTime('t', time)(p) : p;
};

describe('an XY chart with dates on X', () => {
  it('puts the ticks on the first of the month and labels them as dates', () => {
    const m = model(setup());
    expect(m.x.ticks.length).toBeGreaterThanOrEqual(4);
    for (const t of m.x.ticks) expect(civilFromDays(t).day).toBe(1);
    expect(m.x.ticks.map(m.x.tickLabel)).toContain('2024-07');
    expect(m.x.ticks.map(m.x.tickLabel)).toContain('2025-01');
    expect(m.x.log).toBeNull();
  });

  it('places each date in proportion to the days between them', () => {
    const m = model(setup());
    const px = m.series[0].points.map((p) => p.px);
    const days = QUARTERS.map((d) => d - QUARTERS[0]);
    px.forEach((v, i) => expect((v - px[0]) / (px[4] - px[0])).toBeCloseTo(days[i] / days[4], 9));
    // the quarters are not equally long (91, 91, 92, 92 days), and the axis shows it
    expect(px[2] - px[1]).toBeLessThan(px[3] - px[2]);
  });

  it('writes the tick labels and the hovered date into the drawing and the tooltip', () => {
    const p = setup();
    const svg = chartToSvgString(chartOf(p), tableOf(p));
    expect(svg).toContain('>2024-07<');
    const m = model(p);
    const point = m.series[0].points[1];
    const lines = xyTooltipLines(m, tableOf(p), { kind: 'point', groupId: m.series[0].groupId, objectId: point.id } as never)!;
    expect(lines).toContain('X: 2024-04-01');
  });

  it('shows the same numbers without the type: it changes what they are read as, not their values', () => {
    const typed = setup();
    const plain = setup(QUARTERS, null);
    expect(tableOf(typed).groups[0].observations.map((o) => o.value)).toEqual(tableOf(plain).groups[0].observations.map((o) => o.value));
    expect(model(plain).x.ticks.map(model(plain).x.tickLabel)[0]).toMatch(/^\d+$/);
    expect(model(typed).x.ticks.map(model(typed).x.tickLabel)[0]).toMatch(/^\d{4}-\d{2}$/);
  });

  it('keeps the axis when the title changes (the axis is made from the data)', () => {
    const a = model(setup());
    const b = model(patchChart('c', { title: 'Another title', showTitle: true })(setup()));
    expect(b.x.domain).toEqual(a.x.domain);
    expect(b.x.ticks.map(b.x.tickLabel).slice(0, 2)).toEqual(a.x.ticks.map(a.x.tickLabel).slice(0, 2));
  });

  it('is unchanged when the rows are in another order', () => {
    const a = model(setup());
    const reversed = model(setup([...QUARTERS].reverse()));
    expect(reversed.x.domain).toEqual(a.x.domain);
    expect(reversed.x.ticks).toEqual(a.x.ticks);
  });

  it('is linear, with a notice, when the log scale is chosen, and the ticks stay on the calendar', () => {
    const m = model(patchAxis('c', 'xAxis', { scale: 'log10' })(setup()));
    expect(m.x.log).toBeNull();
    expect(m.warnings.join(' ')).toContain('log scale is not applied');
    for (const t of m.x.ticks) expect(civilFromDays(t).day).toBe(1);
  });

  it('makes no curve fit, with a notice', () => {
    const m = model(setup(), { ...NO_FIT_SETTINGS, model: 'linear' });
    expect(m.series[0].fit).toBeUndefined();
    expect(m.warnings.join(' ')).toContain('curve fit is not made on a date');
    expect(model(setup(QUARTERS, null), { ...NO_FIT_SETTINGS, model: 'linear' }).series[0].fit).toBeDefined();
  });

  it('leaves out a range of dates when the axis has a break, and does not draw the dates inside it', () => {
    const m = model(patchAxis('c', 'xAxis', { breaks: [{ from: 19830, to: 19990 }] })(setup()));
    // 2024-07-01 (19905) lies inside the gap
    expect(m.series[0].points.map((p) => p.x)).toEqual([19723, 19814, 19997, 20089]);
    expect(m.x.segments).toHaveLength(2);
    for (const t of m.x.ticks) expect(t > 19830 && t < 19990).toBe(false);
  });

  it('can be reversed', () => {
    const m = model(patchAxis('c', 'xAxis', { reverse: true })(setup()));
    expect(m.xScale(QUARTERS[0])).toBeGreaterThan(m.xScale(QUARTERS[4]));
  });

  it('draws one date as a day on each side of it', () => {
    const m = model(setup([20151]));
    expect(m.x.domain).toEqual([20150, 20152]);
    expect(m.series[0].points).toHaveLength(1);
  });
});

describe('an XY chart with times and durations on X', () => {
  it('puts ticks on whole hours for an afternoon of times and shows them as dates and times', () => {
    const t0 = 20151 * 86400 + 10 * 3600;
    const m = model(setup([t0, t0 + 3600, t0 + 7200, t0 + 10800, t0 + 14400], timeColumn('datetime')));
    for (const t of m.x.ticks) expect(t % 3600).toBe(0);
    expect(m.x.ticks.map(m.x.tickLabel)[0]).toBe('2025-03-04 09:00');
  });

  it('puts ticks at round multiples for durations, in the unit of the column', () => {
    const m = model(setup([0, 2, 4, 6, 8], timeColumn('duration', 'h')));
    expect(m.x.ticks.every((t) => t % 2 === 0)).toBe(true);
    expect(m.x.tickLabel(4)).toBe('4:00');
  });
});

describe('the type of a column in a file and a command', () => {
  it('is written to the file and read back, and absent when there is none', () => {
    const p = setup();
    const text = stringifyProject(p);
    expect(JSON.parse(text).project.dataTables.find((t: { id: string }) => t.id === 't').groups[0].time).toEqual({ kind: 'date', unit: 'd' });
    expect(tableOf(parseProject(text)).groups[0].time).toEqual({ kind: 'date', unit: 'd' });
    expect(stringifyProject(setup(QUARTERS, null))).not.toContain('"time"');
  });

  it('reads a duration unit, and refuses a type that is not one', () => {
    const edit = (time: unknown, table = 't', group = 0): string => {
      const o = JSON.parse(stringifyProject(setup()));
      const t = o.project.dataTables.find((x: { id: string }) => x.id === table);
      t.groups[group].time = time;
      return JSON.stringify(o);
    };
    expect(tableOf(parseProject(edit({ kind: 'duration', unit: 'min' }))).groups[0].time).toEqual({ kind: 'duration', unit: 'min' });
    expect(() => parseProject(edit({ kind: 'date', unit: 's' }))).toThrow('groups[0].time');
    expect(() => parseProject(edit({ kind: 'epoch', unit: 's' }))).toThrow('must be');
    expect(() => parseProject(edit('date'))).toThrow('must be');
    // a Y column has no type: refusing is better than reading its numbers as plain ones
    expect(() => parseProject(edit({ kind: 'date', unit: 'd' }, 't', 1))).toThrow('only read for the X column of an XY table');
  });

  it('reads a file written before the type existed as plain numbers', () => {
    const o = JSON.parse(stringifyProject(setup(QUARTERS, null)));
    expect(tableOf(parseProject(JSON.stringify(o))).groups[0].time).toBeUndefined();
  });

  it('sets, changes and clears the type without touching a number, and does nothing on another table kind', () => {
    const p = setup(QUARTERS, null);
    const values = (q: Project) => tableOf(q).groups.map((g) => g.observations.map((o) => o.value));
    const typed = setColumnTime('t', timeColumn('date'))(p);
    expect(tableOf(typed).groups[0].time).toEqual({ kind: 'date', unit: 'd' });
    expect(values(typed)).toEqual(values(p));
    const changed = setColumnTime('t', timeColumn('duration', 'h'))(typed);
    expect(tableOf(changed).groups[0].time).toEqual({ kind: 'duration', unit: 'h' });
    expect(setColumnTime('t', timeColumn('duration', 'h'))(changed)).toBe(changed);
    const cleared = setColumnTime('t', null)(changed);
    expect(tableOf(cleared).groups[0].time).toBeUndefined();
    expect(setColumnTime('t', null)(cleared)).toBe(cleared);
    expect(values(cleared)).toEqual(values(p));
    const column = addDataTable('c1', 'column', { sample: true })(p);
    expect(setColumnTime('c1', timeColumn('date'))(column)).toBe(column);
  });

  it('keeps the type of the X column when a file replaces the values of the table', () => {
    const p = setup();
    const next = replaceTableData('t', { names: ['Day', 'A'], titles: null, values: [[20151, 1], [20152, 2]] })(p);
    expect(tableOf(next).groups[0].time).toEqual({ kind: 'date', unit: 'd' });
    const typed = replaceTableData('t', { names: ['Day', 'A'], titles: null, values: [[20151, 1]], times: [timeColumn('datetime'), undefined] })(p);
    expect(tableOf(typed).groups[0].time).toEqual({ kind: 'datetime', unit: 's' });
    const plain = replaceTableData('t', { names: ['Day', 'A'], titles: null, values: [[1, 1]], times: [undefined, undefined] })(p);
    expect(tableOf(plain).groups[0].time).toBeUndefined();
  });

  it('makes no Results sheet fit on a date, time or duration X column, as the graph makes none', () => {
    expect(fitObservations(tableOf(setup()))).toEqual([]);
    expect(fitObservations(tableOf(setup(QUARTERS, null))).length).toBeGreaterThan(0);
  });
});
