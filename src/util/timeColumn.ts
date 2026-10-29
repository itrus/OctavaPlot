/**
 * Date, time and duration values (contract section 17). A time column holds plain numbers, as every column does; the column's type says
 * what they mean, and the number is never changed by it:
 *   date      whole days since 1970-01-01 (the civil calendar, proleptic Gregorian, years 0001 to 9999)
 *   datetime  seconds since 1970-01-01T00:00:00 (fractions of a second allowed, to a microsecond)
 *   duration  a length of time in the column's unit: days, hours, minutes or seconds
 * Nothing here uses `Date` or the machine's time zone: dates are counted with integer calendar arithmetic, so the same file gives the same
 * numbers and the same text on every computer.
 *
 * Time zones. A date has none. A time written without a zone ("2025-03-04T10:30:00") is a wall-clock reading, stored as it is (as if it were
 * UTC), and shown again as it is. A time written with an offset ("Z", "+02:00") is an instant: it is converted to UTC when it is read, and a
 * read that did that says so (`offset: true`; `parseTimeBatch` counts them). A column is all one or all the other. Times are always shown in UTC.
 */

export type TimeKind = 'date' | 'datetime' | 'duration';
export type TimeUnit = 'd' | 'h' | 'min' | 's';

export interface TimeColumn {
  kind: TimeKind;
  /** The unit of the stored numbers: days for a date, seconds for a datetime, the chosen one for a duration. */
  unit: TimeUnit;
}

export const TIME_KINDS: ReadonlyArray<{ value: TimeKind; label: string }> = [
  { value: 'date', label: 'Date (2025-03-04)' },
  { value: 'datetime', label: 'Date and time (2025-03-04T10:30:00)' },
  { value: 'duration', label: 'Duration (1:30:00, PT1H30M)' },
];

export const DURATION_UNITS: ReadonlyArray<{ value: TimeUnit; label: string }> = [
  { value: 's', label: 'seconds' },
  { value: 'min', label: 'minutes' },
  { value: 'h', label: 'hours' },
  { value: 'd', label: 'days' },
];

/** Seconds in one stored unit. */
export const UNIT_SECONDS: Record<TimeUnit, number> = { d: 86400, h: 3600, min: 60, s: 1 };

/** The column of a kind; a date is counted in days and a datetime in seconds whatever unit is asked for. */
export function timeColumn(kind: TimeKind, unit: TimeUnit = 's'): TimeColumn {
  return { kind, unit: kind === 'date' ? 'd' : kind === 'datetime' ? 's' : unit };
}

/** A stored column type, or null when it is not one (wrong kind or unit, or a unit that does not belong to the kind). */
export function timeColumnOf(raw: unknown): TimeColumn | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { kind, unit } = raw as Record<string, unknown>;
  if (kind !== 'date' && kind !== 'datetime' && kind !== 'duration') return null;
  if (unit !== 'd' && unit !== 'h' && unit !== 'min' && unit !== 's') return null;
  const col = timeColumn(kind, unit);
  return col.unit === unit ? col : null;
}

// ---------------------------------------------------------------- calendar arithmetic (days from civil, after H. Hinnant)

/** Days from 1970-01-01 to the given civil date (month 1 to 12). */
export function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** The civil date of a day count from 1970-01-01. */
export function civilFromDays(days: number): { year: number; month: number; day: number } {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp + (mp < 10 ? 3 : -9);
  return { year: yoe + era * 400 + (month <= 2 ? 1 : 0), month, day };
}

const isLeap = (y: number): boolean => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const daysIn = (y: number, m: number): number => (m === 2 && isLeap(y) ? 29 : DAYS_IN_MONTH[m - 1]);

/** The first and the last day that can be stored: 0001-01-01 and 9999-12-31. */
export const MIN_DAY = daysFromCivil(1, 1, 1);
export const MAX_DAY = daysFromCivil(9999, 12, 31);

// ---------------------------------------------------------------- reading

export type TimeParse = { ok: true; value: number | null; offset?: boolean } | { ok: false; message: string };

const bad = (message: string): TimeParse => ({ ok: false, message });
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,6}))?)?(Z|[+-]\d{2}(?::?\d{2})?)?$/;
const CLOCK_RE = /^([+-])?(\d+):([0-5]\d)(?::([0-5]\d)(?:[.,](\d{1,6}))?)?$/;
const ISO_DURATION_RE = /^([+-])?P(?:(\d+(?:[.,]\d+)?)W)?(?:(\d+(?:[.,]\d+)?)D)?(?:T(?:(\d+(?:[.,]\d+)?)H)?(?:(\d+(?:[.,]\d+)?)M)?(?:(\d+(?:[.,]\d+)?)S)?)?$/;
const QUANTITY_RE = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*(s|sec|min|h|hr|d)?$/;
const QUANTITY_UNIT: Record<string, TimeUnit> = { s: 's', sec: 's', min: 'min', h: 'h', hr: 'h', d: 'd' };

const ISO_HINT = 'write it as an ISO 8601 date, year-month-day (2025-03-04)';

/** A civil date from its text parts, or the reason it does not exist. */
function civilDay(y: number, m: number, d: number, text: string): { ok: true; days: number } | { ok: false; message: string } {
  if (y < 1) return { ok: false, message: `"${text}" is before the year 0001, which cannot be stored` };
  if (m < 1 || m > 12) return { ok: false, message: `"${text}" has no month ${m}` };
  if (d < 1 || d > daysIn(y, m)) return { ok: false, message: `"${text}" is not a date: ${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')} has no day ${d}` };
  return { ok: true, days: daysFromCivil(y, m, d) };
}

/** The offset of a zone designator in seconds east of UTC, or the reason it is not one. */
function offsetSeconds(zone: string, text: string): { ok: true; seconds: number } | { ok: false; message: string } {
  if (zone === 'Z') return { ok: true, seconds: 0 };
  const digits = zone.slice(1).replace(':', '');
  const h = Number(digits.slice(0, 2));
  const m = digits.length > 2 ? Number(digits.slice(2, 4)) : 0;
  if (h > 23 || m > 59) return { ok: false, message: `"${text}" has an offset that is not a valid one (${zone})` };
  return { ok: true, seconds: (zone[0] === '-' ? -1 : 1) * (h * 3600 + m * 60) };
}

const fraction = (digits: string | undefined): number => (digits ? Number(`0.${digits}`) : 0);

/**
 * Read the text of one cell of a time column. Empty text is a missing value. A date column takes only a date, a datetime column only a date
 * with a time of day: a value of the other kind is refused, never cut or filled in. A duration is `H:MM[:SS[.f]]` (hours may pass 24),
 * ISO 8601 (`PT1H30M`, `P1DT2H`, `P2W`; no years or months, which have no fixed length), or a number with an optional unit (`90 min`,
 * `1.5h`); a bare number is in the column's unit.
 */
export function parseTimeCell(text: string, col: TimeColumn): TimeParse {
  const t = text.trim();
  if (t === '') return { ok: true, value: null };
  if (col.kind === 'date') {
    const m = DATE_RE.exec(t);
    if (!m) {
      return bad(DATETIME_RE.test(t) ? `"${t}" has a time of day, but the column holds dates: set the column to date and time` : `"${t}" is not a date: ${ISO_HINT}`);
    }
    const day = civilDay(Number(m[1]), Number(m[2]), Number(m[3]), t);
    return day.ok ? { ok: true, value: day.days } : bad(day.message);
  }
  if (col.kind === 'datetime') {
    const m = DATETIME_RE.exec(t);
    if (!m) return bad(DATE_RE.test(t) ? `"${t}" has no time of day, but the column holds dates and times: write 2025-03-04T00:00:00, or set the column to date` : `"${t}" is not a date and time: ${ISO_HINT} and the time as hh:mm or hh:mm:ss, such as 2025-03-04T10:30:00`);
    const day = civilDay(Number(m[1]), Number(m[2]), Number(m[3]), t);
    if (!day.ok) return bad(day.message);
    const [hh, mm, ss] = [Number(m[4]), Number(m[5]), m[6] === undefined ? 0 : Number(m[6])];
    if (hh > 23) return bad(`"${t}" has no hour ${hh} (hours are 0 to 23; 24:00 is not read)`);
    if (mm > 59) return bad(`"${t}" has no minute ${mm}`);
    if (ss > 59) return bad(`"${t}" has second ${ss}: seconds are 0 to 59 (leap seconds are not read)`);
    let seconds = day.days * 86400 + hh * 3600 + mm * 60 + ss + fraction(m[7]);
    let offset = false;
    if (m[8] !== undefined) {
      const shift = offsetSeconds(m[8], t);
      if (!shift.ok) return bad(shift.message);
      seconds -= shift.seconds;
      offset = true;
    }
    if (seconds < MIN_DAY * 86400 || seconds >= (MAX_DAY + 1) * 86400) return bad(`"${t}" is outside the years 0001 to 9999 once its offset is applied`);
    return { ok: true, value: seconds, ...(offset ? { offset: true } : {}) };
  }
  return parseDuration(t, col.unit);
}

function parseDuration(t: string, unit: TimeUnit): TimeParse {
  const clock = CLOCK_RE.exec(t);
  if (clock) {
    const seconds = Number(clock[2]) * 3600 + Number(clock[3]) * 60 + (clock[4] === undefined ? 0 : Number(clock[4])) + fraction(clock[5]);
    return { ok: true, value: ((clock[1] === '-' ? -1 : 1) * seconds) / UNIT_SECONDS[unit] };
  }
  if (/^[+-]?P/.test(t)) {
    const m = ISO_DURATION_RE.exec(t);
    if (!m || t.endsWith('T') || t === 'P' || t === '-P' || t === '+P') {
      return bad(/^[+-]?P\d/.test(t) && /^[+-]?P[\d.,]*[YM]/.test(t) ? `"${t}" counts years or months, which have no fixed length: use days, hours, minutes or seconds` : `"${t}" is not an ISO 8601 duration (such as PT1H30M or P1DT2H)`);
    }
    const part = (s: string | undefined, secondsEach: number) => (s === undefined ? 0 : Number(s.replace(',', '.')) * secondsEach);
    const seconds = part(m[2], 604800) + part(m[3], 86400) + part(m[4], 3600) + part(m[5], 60) + part(m[6], 1);
    return { ok: true, value: ((m[1] === '-' ? -1 : 1) * seconds) / UNIT_SECONDS[unit] };
  }
  const q = QUANTITY_RE.exec(t);
  if (q) {
    const n = Number(q[1]);
    if (!Number.isFinite(n)) return bad(`"${t}" is not a finite number`);
    return { ok: true, value: q[2] === undefined ? n : (n * UNIT_SECONDS[QUANTITY_UNIT[q[2]]]) / UNIT_SECONDS[unit] };
  }
  return bad(`"${t}" is not a duration: write 1:30:00, PT1H30M, or a number with a unit such as 90 min`);
}

/** What a batch of cells of one column reads as. */
interface TimeBatch {
  values: Array<number | null>;
  /** The cells that cannot be read, by position in the batch. */
  problems: Array<{ index: number; text: string; message: string }>;
  /** Things the reader did that the file did not ask for, to be shown: today only the conversion of offsets to UTC. */
  notes: string[];
}

/**
 * Read the cells of one column together. Times with an offset are converted to UTC and counted in a note. A column is all wall-clock times
 * or all times with an offset: the cells of the other kind than the first one are problems, since mixing them would put readings of
 * different clocks on one axis. `readOne` reads a cell (the default is `parseTimeCell`); a caller can add what it accepts in a number.
 */
export function parseTimeBatch(texts: readonly string[], col: TimeColumn, readOne: (text: string) => TimeParse = (t) => parseTimeCell(t, col)): TimeBatch {
  const values: Array<number | null> = [];
  const problems: TimeBatch['problems'] = [];
  let firstOffset: boolean | null = null;
  let converted = 0;
  texts.forEach((text, index) => {
    const r = readOne(text);
    if (!r.ok) {
      values.push(null);
      problems.push({ index, text, message: r.message });
      return;
    }
    if (r.value !== null && col.kind === 'datetime') {
      const withOffset = r.offset === true;
      firstOffset ??= withOffset;
      if (withOffset !== firstOffset) {
        values.push(null);
        problems.push({ index, text, message: `"${text.trim()}" ${withOffset ? 'has a UTC offset, but the values before it have none' : 'has no UTC offset, but the values before it have one'}: a column is all wall-clock times or all times with an offset` });
        return;
      }
      if (withOffset) converted++;
    }
    values.push(r.value);
  });
  return { values, problems, notes: converted > 0 ? [offsetNote(converted)] : [] };
}

/** The sentence that reports offsets converted to UTC. */
export const offsetNote = (count: number): string => `${count} time${count === 1 ? ' had' : 's had'} a UTC offset and ${count === 1 ? 'was' : 'were'} converted to UTC (times are stored and shown in UTC)`;

/**
 * The type of a column from its cells, or null when they are not all dates, all dates with a time, or all clock durations. A suggestion
 * only: the caller shows it and the person accepts it. Bare numbers say nothing (they are numbers already), and so does a mixture.
 */
export function detectTimeColumn(texts: readonly string[]): TimeColumn | null {
  const filled = texts.map((t) => t.trim()).filter((t) => t !== '');
  if (filled.length === 0) return null;
  if (filled.every((t) => DATE_RE.test(t) && parseTimeCell(t, timeColumn('date')).ok)) return timeColumn('date');
  if (filled.every((t) => DATETIME_RE.test(t) && parseTimeCell(t, timeColumn('datetime')).ok)) return timeColumn('datetime');
  const clock = timeColumn('duration', 's');
  if (filled.every((t) => (CLOCK_RE.test(t) || /^[+-]?P/.test(t)) && parseTimeCell(t, clock).ok)) return clock;
  return null;
}

// ---------------------------------------------------------------- writing

const two = (n: number): string => String(n).padStart(2, '0');

/** Whole seconds and microseconds of a length of seconds that is not negative; a fraction that rounds up to a whole second carries. */
function splitSeconds(seconds: number): { whole: number; micro: number } {
  const whole = Math.floor(seconds);
  const micro = Math.round((seconds - whole) * 1e6);
  return micro >= 1e6 ? { whole: whole + 1, micro: 0 } : { whole, micro };
}

/** The fraction as `.ffffff` with trailing zeros dropped, or nothing. */
const fractionText = (micro: number): string => (micro > 0 ? `.${String(micro).padStart(6, '0').replace(/0+$/, '')}` : '');

/**
 * The text of a stored value of a time column: the ISO 8601 form for dates (`2025-03-04`) and times (`2025-03-04T10:30:00`, no zone, since
 * the value is a UTC reading), `h:mm:ss` for durations. A value that cannot be written that way (not a whole day in a date column, outside
 * the years 0001 to 9999) is written as a date and time, or as the plain number, so it is never rounded or hidden.
 */
export function formatTimeCell(value: number | null, col: TimeColumn): string {
  if (value === null) return '';
  if (!Number.isFinite(value)) return String(value);
  if (col.kind === 'duration') {
    const seconds = value * UNIT_SECONDS[col.unit];
    if (!Number.isFinite(seconds)) return String(value);
    const { whole, micro } = splitSeconds(Math.abs(seconds));
    return `${seconds < 0 ? '-' : ''}${Math.floor(whole / 3600)}:${two(Math.floor((whole % 3600) / 60))}:${two(whole % 60)}${fractionText(micro)}`;
  }
  const seconds = col.kind === 'date' ? value * 86400 : value;
  const { whole, micro } = splitSeconds(seconds);
  const days = Math.floor(whole / 86400);
  if (days < MIN_DAY || days > MAX_DAY) return String(value);
  const { year, month, day } = civilFromDays(days);
  const date = `${String(year).padStart(4, '0')}-${two(month)}-${two(day)}`;
  if (col.kind === 'date' && Number.isInteger(value)) return date;
  const rest = whole - days * 86400;
  return `${date}T${two(Math.floor(rest / 3600))}:${two(Math.floor((rest % 3600) / 60))}:${two(rest % 60)}${fractionText(micro)}`;
}
