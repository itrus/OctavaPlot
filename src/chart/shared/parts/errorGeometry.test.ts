import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE, DEFAULT_SUMMARY } from '../../../model/defaults';
import type { SummarySpec } from '../../../model/types';
import { computeGroupStats, type GroupStats } from '../../../stats/summary';
import { buildErrorBar, rangeValuesFor, type ErrorBarInput, type ErrorBarStyle } from './errorGeometry';

const statsOf = (values: (number | null)[], patch: Partial<SummarySpec> = {}): GroupStats =>
  computeGroupStats(values, { ...DEFAULT_SUMMARY, ...patch });

/** Hand-made stats for guard cases the calculation never produces. */
const forged = (patch: Partial<GroupStats>, lower: number | null, upper: number | null): GroupStats => ({
  ...statsOf([1, 2, 3], { spread: 'sd' }),
  ...patch,
  interval: { status: 'ok', lower, upper, coverage: null, code: null },
});

const styleOf = (patch: Partial<ErrorBarStyle> = {}): ErrorBarStyle => ({
  showErrorBars: true,
  errorOpacity: DEFAULT_STYLE.errorOpacity,
  errorDirection: DEFAULT_STYLE.errorDirection,
  errorCap: DEFAULT_STYLE.errorCap,
  errorCapWidthPt: DEFAULT_STYLE.errorCapWidthPt,
  errorLineWidthPt: DEFAULT_STYLE.errorLineWidthPt,
  errorColor: DEFAULT_STYLE.errorColor,
  ...patch,
});

const yScale = (v: number) => 100 - v * 10;

const inputOf = (stats: GroupStats, patch: Partial<ErrorBarStyle> = {}, extra: Partial<ErrorBarInput> = {}): ErrorBarInput => ({
  groupId: 'g1',
  centerX: 50,
  stats,
  style: styleOf(patch),
  yScale,
  domain: [0, 10],
  ...extra,
});

const SD = statsOf([1, 2, 3], { spread: 'sd' }); // centre 2, interval 1..3

describe('rangeValuesFor', () => {
  it('1: no spread gives only the centre', () => {
    expect(rangeValuesFor(statsOf([1, 2, 3]), true, 'both')).toEqual([2]);
  });
  it('2: both sides in the order centre, upper, lower', () => {
    expect(rangeValuesFor(SD, true, 'both')).toEqual([2, 3, 1]);
  });
  it('3: positive only', () => {
    expect(rangeValuesFor(SD, true, 'positive')).toEqual([2, 3]);
  });
  it('4: negative only', () => {
    expect(rangeValuesFor(SD, true, 'negative')).toEqual([2, 1]);
  });
  it('5: hidden bars contribute only the centre', () => {
    expect(rangeValuesFor(SD, false, 'both')).toEqual([2]);
  });
  it('6: no data gives nothing', () => {
    expect(rangeValuesFor(statsOf([]), true, 'both')).toEqual([]);
  });
  it('7: unavailable interval gives only the centre', () => {
    expect(rangeValuesFor(statsOf([5], { spread: 'sd' }), true, 'both')).toEqual([5]);
  });
  it('8: non-finite endpoints are skipped', () => {
    expect(rangeValuesFor(forged({}, Number.NaN, Infinity), true, 'both')).toEqual([2]);
  });
  it('9: asymmetric geometric SD endpoints are both included', () => {
    const s = statsOf([1, 2, 4, 8], { centre: 'geometricMean', spread: 'gsd' });
    const v = rangeValuesFor(s, true, 'both');
    expect(v).toHaveLength(3);
    expect(v[1]).toBeGreaterThan(v[0]);
    expect(v[2]).toBeLessThan(v[0]);
    expect(v[1] - v[0]).not.toBeCloseTo(v[0] - v[2], 6);
  });
});

describe('buildErrorBar paths', () => {
  it('both sides with caps keep the legacy path format', () => {
    const g = buildErrorBar(inputOf(SD, { errorCap: 'bar', errorCapWidthPt: 5 }));
    expect(g?.d).toBe('M50,70V90M47.5,70H52.5M47.5,90H52.5');
    expect(g?.id).toBe('g1:error');
    expect(g?.color).toBe(DEFAULT_STYLE.errorColor);
    expect(g?.strokeWidth).toBe(DEFAULT_STYLE.errorLineWidthPt);
  });
  it('positive only runs from the centre to the upper end', () => {
    const g = buildErrorBar(inputOf(SD, { errorDirection: 'positive', errorCap: 'bar', errorCapWidthPt: 5 }));
    expect(g?.d).toBe('M50,70V80M47.5,70H52.5');
  });
  it('negative only runs from the centre to the lower end', () => {
    const g = buildErrorBar(inputOf(SD, { errorDirection: 'negative', errorCap: 'bar', errorCapWidthPt: 5 }));
    expect(g?.d).toBe('M50,80V90M47.5,90H52.5');
  });
  it('cap none draws the stem only', () => {
    expect(buildErrorBar(inputOf(SD, { errorCap: 'none' }))?.d).toBe('M50,70V90');
  });
  it('cap length sets the full cap width', () => {
    expect(buildErrorBar(inputOf(SD, { errorCap: 'bar', errorCapWidthPt: 10 }))?.d).toBe('M50,70V90M45,70H55M45,90H55');
  });
  it('maps asymmetric GSD endpoints separately through yScale', () => {
    const s = statsOf([1, 2, 4, 8], { centre: 'geometricMean', spread: 'gsd' });
    const seen: number[] = [];
    const spy = (v: number) => {
      seen.push(v);
      return yScale(v);
    };
    buildErrorBar(inputOf(s, {}, { yScale: spy, domain: [0, 100] }));
    expect(seen).toEqual([s.centre, s.interval.upper, s.interval.lower]);
  });
  it('is deterministic and uses the supplied (second-axis) scale', () => {
    const a = buildErrorBar(inputOf(SD));
    expect(buildErrorBar(inputOf(SD))).toEqual(a);
    const b = buildErrorBar(inputOf(SD, { errorCap: 'none' }, { yScale: (v) => 500 - v * 2 }));
    expect(b?.d).toBe('M50,494V498');
  });
});

describe('clipped flags', () => {
  it('flags the upper end strictly above the domain', () => {
    const g = buildErrorBar(inputOf(SD, {}, { domain: [0, 2.5] }));
    expect([g?.clippedUpper, g?.clippedLower]).toEqual([true, false]);
  });
  it('flags the lower end strictly below the domain', () => {
    const g = buildErrorBar(inputOf(SD, {}, { domain: [1.5, 10] }));
    expect([g?.clippedUpper, g?.clippedLower]).toEqual([false, true]);
  });
  it('an end exactly on the domain edge is not clipped', () => {
    const g = buildErrorBar(inputOf(SD, {}, { domain: [1, 3] }));
    expect([g?.clippedUpper, g?.clippedLower]).toEqual([false, false]);
  });
  it('an undrawn side is never flagged', () => {
    const g = buildErrorBar(inputOf(SD, { errorDirection: 'positive' }, { domain: [1.5, 2.5] }));
    expect([g?.clippedUpper, g?.clippedLower]).toEqual([true, false]);
    const h = buildErrorBar(inputOf(SD, { errorDirection: 'negative' }, { domain: [1.5, 2.5] }));
    expect([h?.clippedUpper, h?.clippedLower]).toEqual([false, true]);
  });
  it('accepts a reversed domain', () => {
    const g = buildErrorBar(inputOf(SD, {}, { domain: [2.5, 0] }));
    expect([g?.clippedUpper, g?.clippedLower]).toEqual([true, false]);
  });
});

describe('meaning', () => {
  it('names the spread', () => {
    expect(buildErrorBar(inputOf(SD))?.meaning).toBe('SD');
    expect(buildErrorBar(inputOf(statsOf([1, 2, 3], { spread: 'range' })))?.meaning).toBe('range (min to max)');
  });
  it('names a confidence interval with level and centre', () => {
    const s = statsOf([1, 2, 3, 4], { spread: 'ci', confidenceLevel: 0.9 });
    expect(buildErrorBar(inputOf(s))?.meaning).toBe('90% confidence interval of the mean');
  });
  it('adds the one-sided display suffix', () => {
    expect(buildErrorBar(inputOf(SD, { errorDirection: 'positive' }))?.meaning).toBe('SD (positive side only)');
    expect(buildErrorBar(inputOf(SD, { errorDirection: 'negative' }))?.meaning).toBe('SD (negative side only)');
  });
});

describe('null cases', () => {
  it('hidden bars', () => {
    expect(buildErrorBar(inputOf(SD, { showErrorBars: false }))).toBeNull();
  });
  it('no spread, unavailable interval and no data', () => {
    expect(buildErrorBar(inputOf(statsOf([1, 2, 3])))).toBeNull();
    expect(buildErrorBar(inputOf(statsOf([5], { spread: 'sd' })))).toBeNull();
    expect(buildErrorBar(inputOf(statsOf([], { spread: 'sd' })))).toBeNull();
  });
  it('lower greater than upper', () => {
    expect(buildErrorBar(inputOf(forged({}, 3, 1)))).toBeNull();
  });
  it('non-finite endpoint values', () => {
    expect(buildErrorBar(inputOf(forged({}, Number.NaN, 3)))).toBeNull();
    expect(buildErrorBar(inputOf(forged({}, 1, null)))).toBeNull();
  });
  it('non-finite pixels', () => {
    expect(buildErrorBar(inputOf(SD, {}, { yScale: (v) => (v === 3 ? Number.NaN : v) }))).toBeNull();
    expect(buildErrorBar(inputOf(SD, {}, { centerX: Number.NaN }))).toBeNull();
  });
  it('sd interval with the centre outside is nulled', () => {
    expect(buildErrorBar(inputOf(forged({ centre: 5 }, 1, 3)))).toBeNull();
    expect(rangeValuesFor(forged({ centre: 5 }, 1, 3), true, 'both')).toEqual([5]);
  });
  it('range and median CI intervals are not nulled by centre containment', () => {
    const range = forged({ effectiveSpread: 'range', spread: 'range', centre: 5 }, 1, 3);
    expect(buildErrorBar(inputOf(range))).not.toBeNull();
    const medCi = forged({ effectiveSpread: 'ci', spread: 'ci', centreKind: 'median', centre: 5 }, 1, 3);
    expect(buildErrorBar(inputOf(medCi))).not.toBeNull();
    const iqr = forged({ effectiveSpread: 'iqr', spread: 'iqr', centreKind: 'median', centre: 5 }, 1, 3);
    expect(buildErrorBar(inputOf(iqr))).not.toBeNull();
  });
  it('a mean CI with the centre outside is nulled', () => {
    const ci = forged({ effectiveSpread: 'ci', spread: 'ci', centreKind: 'mean', centre: 5 }, 1, 3);
    expect(buildErrorBar(inputOf(ci))).toBeNull();
  });
});

describe('log axis (spec 15, log endpoint)', () => {
  const NEG = forged({ centre: 2 }, -1, 5); // centre 2, interval [-1, 5]
  it('keeps the centre and draws the endpoint at or below 0 at the low end, flagged as clipped', () => {
    const g = buildErrorBar(inputOf(NEG, { errorCap: 'none' }, { log: true, domain: [0.1, 10] }));
    expect(g).not.toBeNull();
    expect(g?.clippedLower).toBe(true);
    expect(g?.clippedUpper).toBe(false);
    expect(g?.d).toContain(`${yScale(5)}`);
    expect(g?.d).toContain(`${yScale(0.1)}`);
  });
  it('draws nothing when the centre itself is not positive', () => {
    expect(buildErrorBar(inputOf(forged({ centre: -2 }, -5, 1), {}, { log: true, domain: [0.1, 10] }))).toBeNull();
  });
});
