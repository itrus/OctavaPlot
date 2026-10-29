import { describe, expect, it } from 'vitest';
import { civilFromDays, daysFromCivil, detectTimeColumn, formatTimeCell, MAX_DAY, MIN_DAY, parseTimeBatch, parseTimeCell, timeColumn, timeColumnOf } from './timeColumn';

// Reference values are Unix times and day numbers known from outside this code: 2025-01-01T00:00:00Z is 1735689600 (20089 days),
// 2000-01-01 is 946684800 (10957 days), 2024-01-01 is 1704067200 (19723 days), 0001-01-01 and 9999-12-31 are days -719162 and 2932896
// (Python's date ordinals 1 and 3652059 less 719163 for 1970-01-01).
const DATE = timeColumn('date');
const DATETIME = timeColumn('datetime');
const value = (text: string, col = DATE): number | null => {
  const r = parseTimeCell(text, col);
  if (!r.ok) throw new Error(r.message);
  return r.value;
};
const message = (text: string, col = DATE): string => {
  const r = parseTimeCell(text, col);
  if (r.ok) throw new Error(`"${text}" was read`);
  return r.message;
};

describe('calendar arithmetic', () => {
  it('counts days from 1970-01-01 as the published values do', () => {
    expect(daysFromCivil(1970, 1, 1)).toBe(0);
    expect(daysFromCivil(2000, 1, 1)).toBe(10957);
    expect(daysFromCivil(2000, 3, 1)).toBe(11017);
    expect(daysFromCivil(2024, 1, 1)).toBe(19723);
    expect(daysFromCivil(2025, 1, 1)).toBe(20089);
    expect(daysFromCivil(1969, 12, 31)).toBe(-1);
    expect(daysFromCivil(1900, 1, 1)).toBe(-25567);
    expect(MIN_DAY).toBe(-719162);
    expect(MAX_DAY).toBe(2932896);
  });

  it('is its own inverse over every day of the stored range', () => {
    for (let d = MIN_DAY; d <= MAX_DAY; d += 17) {
      const { year, month, day } = civilFromDays(d);
      expect(daysFromCivil(year, month, day)).toBe(d);
    }
    expect(civilFromDays(11016)).toEqual({ year: 2000, month: 2, day: 29 });
    expect(civilFromDays(MAX_DAY)).toEqual({ year: 9999, month: 12, day: 31 });
  });
});

describe('dates', () => {
  it('reads ISO 8601 dates as days', () => {
    expect(value('2025-03-04')).toBe(20151);
    expect(value(' 2025-03-04 ')).toBe(20151);
    expect(value('1970-01-01')).toBe(0);
    expect(value('')).toBeNull();
    expect(value('   ')).toBeNull();
  });

  it('knows leap days: 2024 and 2000 have one, 2023 and 1900 do not', () => {
    expect(value('2024-02-29')).toBe(19782);
    expect(value('2000-02-29')).toBe(11016);
    expect(message('2023-02-29')).toContain('has no day 29');
    expect(message('1900-02-29')).toContain('has no day 29');
    expect(message('2025-04-31')).toContain('has no day 31');
    expect(message('2025-13-01')).toContain('no month 13');
    expect(message('0000-01-01')).toContain('before the year 0001');
  });

  it('does not guess other orders, separators or partial dates', () => {
    for (const t of ['03/04/2025', '4 March 2025', '2025-3-4', '2025-03', '20250304', '2025', 'March']) expect(message(t)).toContain('ISO 8601');
  });

  it('refuses a time of day instead of cutting it off', () => {
    expect(message('2025-03-04T10:30:00')).toContain('set the column to date and time');
  });

  it('writes a date back as it was read, and a fraction of a day as a date and time', () => {
    for (const t of ['2025-03-04', '1970-01-01', '0001-01-01', '9999-12-31', '2024-02-29']) expect(formatTimeCell(value(t), DATE)).toBe(t);
    expect(formatTimeCell(20151.5, DATE)).toBe('2025-03-04T12:00:00');
    expect(formatTimeCell(null, DATE)).toBe('');
  });

  it('writes a number outside the years 0001 to 9999 as the number, never as a wrong date', () => {
    expect(formatTimeCell(MAX_DAY + 1, DATE)).toBe(String(MAX_DAY + 1));
    expect(formatTimeCell(MIN_DAY - 1, DATE)).toBe(String(MIN_DAY - 1));
  });
});

describe('times and the time zone policy', () => {
  it('reads a time without a zone as a wall-clock reading, stored as if it were UTC', () => {
    expect(value('2025-03-04T10:30:00', DATETIME)).toBe(1741084200);
    expect(value('2025-03-04 10:30', DATETIME)).toBe(1741084200);
    expect(value('2025-01-01T00:00:00', DATETIME)).toBe(1735689600);
    const r = parseTimeCell('2025-03-04T10:30:00', DATETIME);
    expect(r.ok && r.offset).toBeUndefined();
  });

  it('converts an offset to UTC and says so', () => {
    for (const t of ['2025-03-04T10:30:00Z', '2025-03-04T12:30:00+02:00', '2025-03-04T12:30:00+0200', '2025-03-04T12:30+02', '2025-03-04T05:30:00-05:00']) {
      const r = parseTimeCell(t, DATETIME);
      expect(r).toEqual({ ok: true, value: 1741084200, offset: true });
    }
    // an offset with minutes
    expect(value('2025-03-04T16:00:00+05:30', DATETIME)).toBe(1741084200);
  });

  it('applies an offset across midnight and year ends', () => {
    expect(value('2025-01-01T01:00:00+02:00', DATETIME)).toBe(1735689600 - 3600);
    expect(value('2024-12-31T23:00:00-02:00', DATETIME)).toBe(1735689600 + 3600);
  });

  it('keeps fractions of a second to a microsecond and refuses more', () => {
    expect(value('2025-01-01T00:00:00.5', DATETIME)).toBe(1735689600.5);
    expect(value('2025-01-01T00:00:00,25', DATETIME)).toBe(1735689600.25);
    expect(message('2025-01-01T00:00:00.1234567', DATETIME)).toContain('not a date and time');
  });

  it('refuses what is not a time: leap seconds, 24:00, bad offsets, a bare date', () => {
    expect(message('2025-06-30T23:59:60', DATETIME)).toContain('leap seconds');
    expect(message('2025-03-04T24:00:00', DATETIME)).toContain('24:00');
    expect(message('2025-03-04T10:60:00', DATETIME)).toContain('no minute 60');
    expect(message('2025-03-04T10:30:00+25:00', DATETIME)).toContain('offset');
    expect(message('2025-03-04T10:30:00+02:61', DATETIME)).toContain('offset');
    expect(message('2025-03-04', DATETIME)).toContain('no time of day');
    expect(message('10:30', DATETIME)).toContain('not a date and time');
    expect(message('2025-03-04T10:30:00 PST', DATETIME)).toContain('not a date and time');
    expect(message('9999-12-31T23:30:00-02:00', DATETIME)).toContain('outside the years');
    expect(message('0001-01-01T00:30:00+01:00', DATETIME)).toContain('outside the years');
  });

  it('writes a time in UTC without a zone, with the fraction only when there is one', () => {
    expect(formatTimeCell(1741084200, DATETIME)).toBe('2025-03-04T10:30:00');
    expect(formatTimeCell(1735689600.5, DATETIME)).toBe('2025-01-01T00:00:00.5');
    expect(formatTimeCell(1735689600.25, DATETIME)).toBe('2025-01-01T00:00:00.25');
    expect(formatTimeCell(-1, DATETIME)).toBe('1969-12-31T23:59:59');
    // a fraction that rounds up to the next second carries, never "24:00:00" or ":60"
    expect(formatTimeCell(1735689599.9999999, DATETIME)).toBe('2025-01-01T00:00:00');
  });

  it('round-trips a time through its text', () => {
    for (const t of ['2025-03-04T10:30:00', '1999-12-31T23:59:59', '2024-02-29T00:00:00.125', '0001-01-01T00:00:00', '9999-12-31T23:59:59']) expect(formatTimeCell(value(t, DATETIME), DATETIME)).toBe(t);
  });

  it('gives the same numbers whatever the machine time zone is (no Date is involved)', () => {
    const before = process.env.TZ;
    try {
      for (const tz of ['UTC', 'America/Los_Angeles', 'Asia/Kolkata', 'Pacific/Auckland']) {
        process.env.TZ = tz;
        expect(value('2025-03-04T10:30:00', DATETIME)).toBe(1741084200);
        expect(formatTimeCell(1741084200, DATETIME)).toBe('2025-03-04T10:30:00');
        expect(value('2025-03-09', DATE)).toBe(20156);
      }
    } finally {
      if (before === undefined) delete process.env.TZ;
      else process.env.TZ = before;
    }
  });
});

describe('batches of one column', () => {
  it('counts the times converted from an offset and notes it', () => {
    const b = parseTimeBatch(['2025-03-04T12:30:00+02:00', '', '2025-03-04T10:31:00Z'], DATETIME);
    expect(b.values).toEqual([1741084200, null, 1741084260]);
    expect(b.problems).toEqual([]);
    expect(b.notes).toEqual(['2 times had a UTC offset and were converted to UTC (times are stored and shown in UTC)']);
    expect(parseTimeBatch(['2025-03-04T12:30:00+02:00'], DATETIME).notes[0]).toContain('1 time had a UTC offset and was converted');
  });

  it('has no note when nothing was converted', () => {
    expect(parseTimeBatch(['2025-03-04T10:30:00', '2025-03-05T10:30:00'], DATETIME).notes).toEqual([]);
    expect(parseTimeBatch(['2025-03-04', '2025-03-05'], DATE).notes).toEqual([]);
  });

  it('refuses a mixture of wall-clock times and times with an offset, whichever comes first', () => {
    const a = parseTimeBatch(['2025-03-04T10:30:00', '2025-03-04T10:30:00Z'], DATETIME);
    expect(a.problems.map((p) => p.index)).toEqual([1]);
    expect(a.problems[0].message).toContain('has a UTC offset, but the values before it have none');
    const b = parseTimeBatch(['2025-03-04T10:30:00Z', '2025-03-04T10:30:00'], DATETIME);
    expect(b.problems.map((p) => p.index)).toEqual([1]);
    expect(b.problems[0].message).toContain('has no UTC offset');
    expect(b.values).toEqual([1741084200, null]);
  });

  it('lists every cell that cannot be read, by position', () => {
    const b = parseTimeBatch(['2025-03-04', 'soon', '', '2025-02-30'], DATE);
    expect(b.problems.map((p) => [p.index, p.text])).toEqual([[1, 'soon'], [3, '2025-02-30']]);
  });
});

describe('durations', () => {
  const H = timeColumn('duration', 'h');
  const MIN = timeColumn('duration', 'min');
  const S = timeColumn('duration', 's');

  it('reads clock text in the unit of the column', () => {
    expect(value('1:30:00', S)).toBe(5400);
    expect(value('1:30:00', MIN)).toBe(90);
    expect(value('1:30:00', H)).toBe(1.5);
    expect(value('1:30', S)).toBe(5400);
    expect(value('0:00:00.5', S)).toBe(0.5);
    expect(value('-0:30:00', H)).toBe(-0.5);
    // hours go past 24
    expect(value('36:00:00', timeColumn('duration', 'd'))).toBe(1.5);
    expect(value('100:00', H)).toBe(100);
  });

  it('reads ISO 8601 durations, weeks and days included, and refuses years and months', () => {
    expect(value('PT1H30M', S)).toBe(5400);
    expect(value('P1DT2H', H)).toBe(26);
    expect(value('P2W', timeColumn('duration', 'd'))).toBe(14);
    expect(value('PT0.5S', S)).toBe(0.5);
    expect(value('PT1,5H', MIN)).toBe(90);
    expect(value('-PT90S', S)).toBe(-90);
    expect(message('P1Y', S)).toContain('no fixed length');
    expect(message('P1M', S)).toContain('no fixed length');
    expect(message('P', S)).toContain('not an ISO 8601 duration');
    expect(message('PT', S)).toContain('not an ISO 8601 duration');
  });

  it('reads a number in the unit of the column, or with a unit of its own', () => {
    expect(value('90', MIN)).toBe(90);
    expect(value('90 min', S)).toBe(5400);
    expect(value('1.5h', MIN)).toBe(90);
    expect(value('2d', H)).toBe(48);
    expect(value('30 s', MIN)).toBe(0.5);
    expect(message('soon', S)).toContain('not a duration');
    expect(message('1:75', S)).toContain('not a duration');
    expect(message('1:30:60', S)).toContain('not a duration');
  });

  it('writes h:mm:ss, hours past 24 and fractions kept', () => {
    expect(formatTimeCell(90, MIN)).toBe('1:30:00');
    expect(formatTimeCell(1.5, H)).toBe('1:30:00');
    expect(formatTimeCell(5400, S)).toBe('1:30:00');
    expect(formatTimeCell(1.5, timeColumn('duration', 'd'))).toBe('36:00:00');
    expect(formatTimeCell(-0.5, H)).toBe('-0:30:00');
    expect(formatTimeCell(0.5, S)).toBe('0:00:00.5');
    expect(formatTimeCell(0, S)).toBe('0:00:00');
  });

  it('round-trips whole seconds exactly in every unit', () => {
    for (const col of [S, MIN, H, timeColumn('duration', 'd')]) {
      for (const sec of [0, 1, 59, 60, 3599, 3600, 86399, 86400, 90061, 604800, -45]) {
        const unitValue = sec / { s: 1, min: 60, h: 3600, d: 86400 }[col.unit];
        expect(formatTimeCell(unitValue, col)).toBe(formatTimeCell(value(formatTimeCell(unitValue, col), col), col));
        expect((value(formatTimeCell(unitValue, col), col) as number) * { s: 1, min: 60, h: 3600, d: 86400 }[col.unit]).toBeCloseTo(sec, 9);
      }
    }
  });
});

describe('column types', () => {
  it('fixes the unit of a date and a datetime', () => {
    expect(timeColumn('date', 'h')).toEqual({ kind: 'date', unit: 'd' });
    expect(timeColumn('datetime', 'min')).toEqual({ kind: 'datetime', unit: 's' });
    expect(timeColumn('duration', 'min')).toEqual({ kind: 'duration', unit: 'min' });
  });

  it('accepts only a stored type whose unit belongs to its kind', () => {
    expect(timeColumnOf({ kind: 'date', unit: 'd' })).toEqual(DATE);
    expect(timeColumnOf({ kind: 'duration', unit: 'h' })).toEqual({ kind: 'duration', unit: 'h' });
    expect(timeColumnOf({ kind: 'date', unit: 's' })).toBeNull();
    expect(timeColumnOf({ kind: 'datetime', unit: 'd' })).toBeNull();
    expect(timeColumnOf({ kind: 'epoch', unit: 's' })).toBeNull();
    expect(timeColumnOf({ kind: 'duration', unit: 'weeks' })).toBeNull();
    expect(timeColumnOf(null)).toBeNull();
    expect(timeColumnOf('date')).toBeNull();
  });

  it('suggests a type only when every filled cell says the same thing', () => {
    expect(detectTimeColumn(['2025-03-04', '', '2025-03-05'])).toEqual(DATE);
    expect(detectTimeColumn(['2025-03-04T10:30:00', '2025-03-04 11:00'])).toEqual(DATETIME);
    expect(detectTimeColumn(['2025-03-04T10:30:00+02:00'])).toEqual(DATETIME);
    expect(detectTimeColumn(['0:30:00', '1:15:30'])).toEqual({ kind: 'duration', unit: 's' });
    expect(detectTimeColumn(['PT1H', '0:30'])).toEqual({ kind: 'duration', unit: 's' });
    expect(detectTimeColumn(['2025-03-04', '2025-03-04T10:30:00'])).toBeNull();
    expect(detectTimeColumn(['2025-03-04', '5'])).toBeNull();
    expect(detectTimeColumn(['1', '2', '3'])).toBeNull();
    expect(detectTimeColumn(['2025-02-30'])).toBeNull();
    expect(detectTimeColumn(['', ' '])).toBeNull();
    expect(detectTimeColumn([])).toBeNull();
  });
});
