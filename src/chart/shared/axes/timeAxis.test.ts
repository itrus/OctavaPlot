import { describe, expect, it } from 'vitest';
import { civilFromDays, timeColumn } from '../../../util/timeColumn';
import { axisMapper, inBreak } from './axisScale';
import { resolveTimeAxis } from './timeAxis';

// Day numbers are from 1970-01-01 and were worked out from published Unix times (2025-01-01 = 20089, 2024-01-01 = 19723, 2015-01-01 = 16436,
// 2016-01-01 = 16801, 2018-01-01 = 17532, 2020-01-01 = 18262, 2022-01-01 = 18993); 2025-03-04 was a Tuesday, so 2025-03-03 (20150) is a Monday.
const DATE = timeColumn('date');
const DATETIME = timeColumn('datetime');
const cfg = { reverse: false, minorTicks: 0, tickFontSizePt: 12 };
const input = (values: number[], over: Partial<{ min: number | null; max: number | null; majorInterval: number | null; tickCountHint: number }> = {}) => ({
  values,
  includeZero: false,
  min: null,
  max: null,
  majorInterval: null,
  tickCountHint: 6,
  ...over,
});
const labels = (a: ReturnType<typeof resolveTimeAxis>) => a.ticks.map(a.tickLabel);

describe('date axes', () => {
  it('puts ticks on the first of the month, every three months for a year of data', () => {
    const a = resolveTimeAxis(input([19723, 20089]), cfg, DATE);
    expect(a.ticks).toEqual([19631, 19723, 19814, 19905, 19997, 20089, 20179]);
    expect(labels(a)).toEqual(['2023-10', '2024-01', '2024-04', '2024-07', '2024-10', '2025-01', '2025-04']);
    expect(a.domain).toEqual([19631, 20179]);
    expect(a.log).toBeNull();
    expect(a.warnings).toEqual([]);
  });

  it('puts ticks on Mondays for a month of data, and writes the whole date', () => {
    const a = resolveTimeAxis(input([20150, 20178], { tickCountHint: 4 }), cfg, DATE);
    expect(a.ticks).toEqual([20143, 20150, 20157, 20164, 20171, 20178, 20185]);
    for (const t of a.ticks) expect(Math.abs((t - 20150) % 7)).toBe(0);
    expect(labels(a)[1]).toBe('2025-03-03');
  });

  it('puts ticks on 1 January of every second year for nine years of data', () => {
    const a = resolveTimeAxis(input([16601, 19889]), cfg, DATE);
    expect(a.ticks).toEqual([16071, 16801, 17532, 18262, 18993, 19723, 20454]);
    expect(labels(a)).toEqual(['2014', '2016', '2018', '2020', '2022', '2024', '2026']);
    for (const t of a.ticks) {
      const { month, day } = civilFromDays(t);
      expect([month, day]).toEqual([1, 1]);
    }
  });

  it('never puts a tick between two days, and not at an even number of days from the first value', () => {
    const a = resolveTimeAxis(input([20151, 20156], { tickCountHint: 8 }), cfg, DATE);
    for (const t of a.ticks) expect(Number.isInteger(t)).toBe(true);
    expect(a.ticks.length).toBeGreaterThanOrEqual(3);
  });

  it('gives a lone value a day on each side', () => {
    const a = resolveTimeAxis(input([20151]), cfg, DATE);
    expect(a.domain).toEqual([20150, 20152]);
    expect(a.ticks).toEqual([20150, 20151, 20152]);
  });

  it('has an axis with no values', () => {
    const a = resolveTimeAxis(input([]), cfg, DATE);
    expect(a.domain[1]).toBeGreaterThan(a.domain[0]);
    expect(a.ticks.length).toBeGreaterThan(0);
  });

  it('follows manual limits exactly, in days, and ticks inside them', () => {
    const a = resolveTimeAxis(input([19723, 20089], { min: 19800, max: 20000 }), cfg, DATE);
    expect(a.domain).toEqual([19800, 20000]);
    expect(Math.min(...a.ticks)).toBeGreaterThanOrEqual(19800);
    expect(Math.max(...a.ticks)).toBeLessThanOrEqual(20000);
  });

  it('ignores a pair of limits that cannot be one, and says so', () => {
    const a = resolveTimeAxis(input([19723, 20089], { min: 20000, max: 19800 }), cfg, DATE);
    expect(a.domain).toEqual([19631, 20179]);
    expect(a.warnings[0]).toContain('minimum must be below the maximum');
  });

  it('says that a major tick interval and minor ticks are not used', () => {
    const a = resolveTimeAxis(input([19723, 20089], { majorInterval: 10 }), { ...cfg, minorTicks: 2 }, DATE);
    expect(a.warnings.join(' ')).toContain('major tick interval is not used');
    expect(a.warnings.join(' ')).toContain('Minor ticks are not drawn');
    expect(a.minorTicks).toEqual([]);
  });
});

describe('time axes', () => {
  const at = (day: number, h: number, m = 0) => day * 86400 + h * 3600 + m * 60;

  it('puts ticks on the hour for a few hours of data, labelled with date and time', () => {
    const a = resolveTimeAxis(input([at(20151, 10), at(20151, 14)], { tickCountHint: 8 }), cfg, DATETIME);
    expect(a.ticks).toEqual([9, 10, 11, 12, 13, 14, 15].map((h) => at(20151, h)));
    expect(labels(a)[0]).toBe('2025-03-04 09:00');
  });

  it('uses fewer ticks when the labels would not fit between them', () => {
    const a = resolveTimeAxis(input([at(20151, 10), at(20151, 14)], { tickCountHint: 4 }), cfg, DATETIME);
    expect(a.ticks).toEqual([8, 10, 12, 14, 16].map((h) => at(20151, h)));
  });

  it('puts ticks on midnight and on whole seconds of a short span', () => {
    const days = resolveTimeAxis(input([at(20151, 0), at(20154, 0)], { tickCountHint: 4 }), cfg, DATETIME);
    for (const t of days.ticks) expect(t % 3600).toBe(0);
    const seconds = resolveTimeAxis(input([at(20151, 10) + 0.5, at(20151, 10) + 30], { tickCountHint: 6 }), cfg, DATETIME);
    for (const t of seconds.ticks) expect(Number.isInteger(t)).toBe(true);
    expect(labels(seconds)[0]).toMatch(/^2025-03-04 \d\d:\d\d:\d\d$/);
  });

  it('does not depend on the machine time zone', () => {
    const before = process.env.TZ;
    try {
      const results = ['UTC', 'America/Los_Angeles', 'Asia/Kolkata'].map((tz) => {
        process.env.TZ = tz;
        const a = resolveTimeAxis(input([at(20151, 10), at(20151, 14)], { tickCountHint: 8 }), cfg, DATETIME);
        return JSON.stringify([a.ticks, labels(a)]);
      });
      expect(new Set(results).size).toBe(1);
    } finally {
      if (before === undefined) delete process.env.TZ;
      else process.env.TZ = before;
    }
  });

  it('keeps the spring-forward and fall-back days 24 hours long (UTC has no daylight saving)', () => {
    // 2025-03-09 and 2025-11-02 are the US changeover days.
    const a = resolveTimeAxis(input([at(20156, 0), at(20158, 0)], { tickCountHint: 4 }), cfg, DATETIME);
    const gaps = a.ticks.slice(1).map((t, i) => t - a.ticks[i]);
    expect(new Set(gaps).size).toBe(1);
  });
});

describe('duration axes', () => {
  const H = timeColumn('duration', 'h');

  it('puts ticks at multiples of a round step from zero', () => {
    const a = resolveTimeAxis(input([0, 10], { tickCountHint: 5 }), cfg, H);
    expect(a.ticks).toEqual([-2, 0, 2, 4, 6, 8, 10, 12]);
    expect(labels(a)).toEqual(['-2:00', '0:00', '2:00', '4:00', '6:00', '8:00', '10:00', '12:00']);
  });

  it('counts whole days for long spans', () => {
    const a = resolveTimeAxis(input([0, 30], { tickCountHint: 6 }), cfg, timeColumn('duration', 'd'));
    expect(a.ticks).toEqual([-5, 0, 5, 10, 15, 20, 25, 30, 35]);
    expect(labels(a)[1]).toBe('0 d');
    expect(labels(a)[2]).toBe('5 d');
  });

  it('writes seconds when the step is below a minute, and the step in the unit of the column', () => {
    const a = resolveTimeAxis(input([0, 50], { tickCountHint: 5 }), cfg, timeColumn('duration', 's'));
    expect(a.ticks.slice(0, 3)).toEqual([-10, 0, 10]);
    expect(labels(a)[1]).toBe('0:00:00');
    expect(labels(a)[2]).toBe('0:00:10');
    const min = resolveTimeAxis(input([0, 50], { tickCountHint: 5 }), cfg, timeColumn('duration', 'min'));
    expect(min.ticks.slice(0, 3)).toEqual([-10, 0, 10]);
    expect(labels(min)[2]).toBe('0:10');
  });

  it('draws minor ticks evenly between the major ones', () => {
    const a = resolveTimeAxis(input([0, 10], { tickCountHint: 5 }), { ...cfg, minorTicks: 1 }, H);
    expect(a.minorTicks).toEqual([-1, 1, 3, 5, 7, 9, 11]);
    expect(a.warnings).toEqual([]);
  });
});

describe('breaks, reversal and positions', () => {
  it('omits a range and keeps ticks out of the gap, on calendar boundaries', () => {
    const a = resolveTimeAxis(input([19723, 20089], { tickCountHint: 8 }), { ...cfg, breaks: [{ from: 19800, to: 19950 }] }, DATE);
    expect(a.segments).toEqual([{ lo: a.domain[0], hi: 19800 }, { lo: 19950, hi: a.domain[1] }]);
    for (const t of a.ticks) expect(t > 19800 && t < 19950).toBe(false);
    expect(inBreak(a, 19900)).toBe(true);
    expect(inBreak(a, 19790)).toBe(false);
    // the position of a value is the one of any broken axis: the gap takes room, the ends of the axis are at its ends
    const map = axisMapper(a, 0, 400);
    expect(map(a.domain[0])).toBeCloseTo(0, 9);
    expect(map(a.domain[1])).toBeCloseTo(400, 9);
  });

  it('writes an end value of a short stretch in full, since it is not a boundary', () => {
    // 2025-03-04 and 2025-03-06 are not Mondays, month starts or year starts, and the first stretch has no tick of its own
    const a = resolveTimeAxis(input([20151, 20200], { tickCountHint: 4, min: 20151, max: 20200 }), { ...cfg, breaks: [{ from: 20153, to: 20192 }] }, DATE);
    expect(a.ticks.slice(0, 2)).toEqual([20151, 20153]);
    expect(a.tickLabel(20151)).toBe('2025-03-04');
    expect(a.tickLabel(20153)).toBe('2025-03-06');
  });

  it('reverses and does not break a reversed axis, as a numeric axis does', () => {
    const a = resolveTimeAxis(input([19723, 20089]), { ...cfg, reverse: true, breaks: [{ from: 19800, to: 19950 }] }, DATE);
    expect(a.reverse).toBe(true);
    expect(a.segments).toBeUndefined();
    const map = axisMapper(a, 0, 400);
    expect(map(a.domain[0])).toBeCloseTo(400, 9);
  });

  it('ignores one limit that lies beyond the data, with a warning, instead of a reversed domain', () => {
    const lowOnly = resolveTimeAxis(input([20089, 20148], { min: 20240 }), cfg, DATE);
    expect(lowOnly.domain[0]).toBeLessThan(lowOnly.domain[1]);
    expect(lowOnly.domain[0]).toBeLessThanOrEqual(20089);
    expect(lowOnly.ticks.length).toBeGreaterThan(1);
    expect(lowOnly.warnings).toContain('Manual X limit conflicts with the data range; using automatic limits.');
    const durations = resolveTimeAxis(input([10, 20], { max: 2 }), cfg, timeColumn('duration', 'h'));
    expect(durations.domain[0]).toBeLessThan(durations.domain[1]);
    expect(durations.warnings).toContain('Manual X limit conflicts with the data range; using automatic limits.');
  });
});
