import { describe, expect, it } from 'vitest';
import type { SummarySpec } from '../model/types';
import {
  DIRECTION_HINT,
  centreChangeCompat,
  centreName,
  centreNoticeLines,
  centreTitles,
  datasetRowText,
  describeCounts,
  describeSpread,
  describeSummary,
  describeSummaryControls,
  intervalCaptionLines,
  parseConfidencePercent,
  percentLabel,
  spreadOptions,
  spreadSelectModel,
  staleSpread,
  staleSpreadNote,
  summaryCaption,
  summaryTooltipLines,
} from './describe';
import { SPREADS_BY_CENTRE, computeGroupStats, effectiveSpreadOf } from './summary';

const spec = (over: Partial<SummarySpec> = {}): SummarySpec => ({
  centre: 'mean',
  spread: 'none',
  confidenceLevel: 0.95,
  smallSamplePolicy: 'drawCentre',
  invalidPolicy: 'omit',
  ...over,
});
const fmt = (v: number): string => String(+v.toFixed(4));

describe('labels', () => {
  it('names centres and percentages', () => {
    expect(centreName('geometricMean')).toBe('Geometric mean');
    expect(percentLabel(0.95)).toBe('95%');
    expect(percentLabel(0.96875)).toBe('96.875%');
  });

  it('lists only the allowed spreads per centre', () => {
    expect(spreadOptions('mean').map((o) => o.value)).toEqual(['none', 'sd', 'sem', 'ci', 'range']);
    expect(spreadOptions('median').map((o) => o.value)).not.toContain('sd');
    expect(spreadOptions('geometricMean').map((o) => o.value)).toEqual(['none', 'gsd', 'ci']);
  });

  it('never calls the range or the IQR a confidence interval', () => {
    expect(describeSpread('range', 0.95)).not.toMatch(/confidence/i);
    expect(describeSpread('iqr', 0.95)).not.toMatch(/confidence/i);
    expect(describeSpread('ci', 0.9, 'median')).toBe('90% confidence interval of the median');
    expect(describeSpread('gsd', 0.95)).toMatch(/multiplicative factor/);
  });

  it('describes the effective summary', () => {
    expect(describeSummary(spec())).toBe('Mean');
    expect(describeSummary(spec({ spread: 'sd' }))).toBe('Mean with SD');
    expect(describeSummary(spec({ centre: 'median', spread: 'sd' }))).toBe('Median');
    expect(describeSummary(spec({ centre: 'median', spread: 'iqr' }))).toBe('Median with IQR (Q1 to Q3)');
  });
});

describe('centreChangeCompat', () => {
  it('keeps an allowed spread and explains a stale one', () => {
    expect(centreChangeCompat('mean', 'sd')).toEqual({ allowed: true, effectiveSpread: 'sd', note: null });
    const stale = centreChangeCompat('median', 'sd');
    expect(stale.allowed).toBe(false);
    expect(stale.effectiveSpread).toBe('none');
    expect(stale.note).toContain('SD is not available for the median');
    expect(centreChangeCompat('median', 'none').allowed).toBe(true);
  });
});

describe('summaryTooltipLines', () => {
  it('lists n, centre and interval', () => {
    const s = computeGroupStats([1, 2, 3, 4, 5], spec({ spread: 'ci' }));
    expect(summaryTooltipLines(s, fmt)).toEqual(['n = 5', 'Mean: 3', '95% CI: 1.0368 to 4.9632']);
  });

  it('puts the interval first for an error hit and flags hidden error bars', () => {
    const s = computeGroupStats([1, 2, 3, 4, 5], spec({ spread: 'range' }));
    expect(summaryTooltipLines(s, fmt, { hit: 'error', errorHidden: true })).toEqual([
      'n = 5',
      'Range: 1 to 5 (error bars hidden)',
      'Mean: 3',
    ]);
  });

  it('reports achieved coverage and calculation notices', () => {
    const six = computeGroupStats([1, 2, 3, 4, 5, 6], spec({ centre: 'median', spread: 'ci' }));
    expect(summaryTooltipLines(six, fmt)).toContain('95% CI: 1 to 6 (achieved coverage 96.875%)');
    const one = computeGroupStats([7], spec({ spread: 'sd' }));
    expect(summaryTooltipLines(one, fmt)).toEqual([
      'n = 1',
      'Mean: 7',
      'SD is undefined for n = 1; no error bar is drawn.',
    ]);
  });
});

describe('spreadSelectModel and stale spreads', () => {
  const enabled = (m: ReturnType<typeof spreadSelectModel>) => m.options.filter((o) => !o.disabled).map((o) => o.value);

  it('offers the allowed spreads per centre', () => {
    for (const centre of ['mean', 'geometricMean', 'median'] as const) {
      const m = spreadSelectModel(centre, 'none');
      expect(enabled(m)).toEqual([...SPREADS_BY_CENTRE[centre]]);
      expect(m.stale).toBe(false);
      expect(m.options.every((o) => !o.disabled)).toBe(true);
    }
  });

  it('keeps a stale spread as one disabled selected option', () => {
    const m = spreadSelectModel('median', 'sd');
    expect(m.stale).toBe(true);
    expect(m.value).toBe('sd');
    expect(enabled(m)).not.toContain('sd');
    expect(m.options.filter((o) => o.disabled)).toEqual([{ value: 'sd', label: 'SD (not available for median)', disabled: true }]);
  });

  it('never marks ci or none stale and agrees with effectiveSpreadOf', () => {
    for (const centre of ['mean', 'geometricMean', 'median'] as const) {
      expect(staleSpread(centre, 'ci')).toBe(false);
      expect(staleSpread(centre, 'none')).toBe(false);
    }
    expect(staleSpread('geometricMean', 'sem')).toBe(true);
    expect(staleSpread('mean', 'iqr')).toBe(effectiveSpreadOf('mean', 'iqr') !== 'iqr');
  });

  it('explains a stale spread only', () => {
    expect(staleSpreadNote('mean', 'sd')).toBeNull();
    expect(staleSpreadNote('median', 'sd')).toBe('SD is not available for the median; it stays selected but no error bar is drawn.');
  });
});

describe('centreTitles', () => {
  it('follows the centre', () => {
    expect(centreTitles('mean', 'mean')).toEqual({ symbols: 'Symbols (means)', lines: 'Lines' });
    expect(centreTitles('median', 'mean').symbols).toBe('Symbols (medians)');
    expect(centreTitles('geometricMean', 'scatter')).toEqual({ symbols: 'Symbols', lines: 'Lines (geometric mean)' });
    expect(centreTitles('mean', 'bar')).toEqual({ symbols: 'Symbols', lines: 'Lines' });
  });
});

describe('describeSummaryControls', () => {
  const c = (showErrorBars: boolean, centre: 'mean' | 'median', spread: 'none' | 'sd' | 'ci') =>
    describeSummaryControls({ showErrorBars, centre, spread });

  it('enables the appearance controls for an active spread', () => {
    const s = c(true, 'mean', 'sd');
    expect(s).toMatchObject({ errorOff: false, spreadReason: null, appearanceReason: null, confidenceEnabled: false });
    expect(s.confidenceReason).toMatch(/confidence interval/);
  });

  it('enables the confidence level for ci only', () => {
    const s = c(true, 'median', 'ci');
    expect(s.confidenceEnabled).toBe(true);
    expect(s.confidenceReason).toBeNull();
  });

  it('gives a reason when error bars are off, the spread is none or stale', () => {
    expect(c(false, 'mean', 'ci')).toMatchObject({ errorOff: true, spreadReason: 'Error bars are switched off.', confidenceEnabled: false });
    expect(c(true, 'mean', 'none')).toMatchObject({ errorOff: true, appearanceReason: 'Choose what the error bars show first.' });
    const stale = c(true, 'median', 'sd');
    expect(stale.errorOff).toBe(true);
    expect(stale.stale).toBe(true);
    expect(stale.effectiveSpread).toBe('none');
    expect(stale.appearanceReason).toContain('SD is not available for the median');
  });
});

describe('parseConfidencePercent', () => {
  it('accepts a percentage', () => {
    expect(parseConfidencePercent('95')).toEqual({ ok: true, level: 0.95, hint: null });
    expect(parseConfidencePercent(' 99.9% ')).toEqual({ ok: true, level: 0.999, hint: null });
  });

  it('hints for 1 or less but still accepts', () => {
    const r = parseConfidencePercent('0.95');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.level).toBe(0.0095);
      expect(r.hint).toMatch(/Enter 95/);
    }
    expect(parseConfidencePercent('1')).toMatchObject({ ok: true, level: 0.01 });
  });

  it('rejects empty, non-numeric and out of range', () => {
    for (const t of ['', 'abc', '0', '-5', '100', '150', 'Infinity']) expect(parseConfidencePercent(t).ok).toBe(false);
    expect(parseConfidencePercent('100')).toEqual({ ok: false, error: 'Must be greater than 0 and less than 100.' });
  });
});

describe('describeCounts', () => {
  it('lists included, missing, invalid and clipped ends without the word excluded', () => {
    expect(describeCounts({ n: 5, missing: 0, invalid: 0 } as never)).toBe('5 included');
    expect(describeCounts({ n: 5, missing: 1, invalid: 2 } as never, 1)).toBe('5 included, 1 missing, 2 invalid, 1 error bar end clipped');
    expect(describeCounts({ n: 3, missing: 0, invalid: 0 } as never, 2)).toBe('3 included, 2 error bar ends clipped');
  });

  it('uses real stats', () => {
    const s = computeGroupStats([1, 2, null, Number.NaN, 5], spec());
    expect(describeCounts(s)).toBe('3 included, 1 missing, 1 invalid');
    expect(describeCounts(s)).not.toMatch(/exclud/i);
  });
});

describe('summaryCaption', () => {
  it('names the summary only as a caption', () => {
    expect(summaryCaption(spec({ spread: 'sd' }), true)).toBe('Mean with SD');
    expect(summaryCaption(spec({ spread: 'sd' }), false)).toBe('Mean with SD (error bars hidden)');
    expect(summaryCaption(spec(), false)).toBe('Mean');
  });
});

describe('intervalCaptionLines', () => {
  const base = { showErrorBars: true, fmt };

  it('describes the setting at Global', () => {
    expect(intervalCaptionLines({ ...base, spec: spec({ spread: 'sd' }), stats: null })).toEqual(['Calculated per data set: Mean with SD.']);
  });

  it('shows the real interval for a data set', () => {
    const sp = spec({ spread: 'ci' });
    const lines = intervalCaptionLines({ ...base, spec: sp, stats: computeGroupStats([1, 2, 3, 4, 5], sp) });
    expect(lines).toEqual(['Mean with 95% confidence interval of the mean: 1.0368 to 4.9632']);
  });

  it('says why an interval is unavailable', () => {
    const sp = spec({ spread: 'sd' });
    const lines = intervalCaptionLines({ ...base, spec: sp, stats: computeGroupStats([7], sp) });
    expect(lines).toEqual(['SD is undefined for n = 1; no error bar is drawn.']);
  });

  it('explains a stale spread, hidden error bars and appends the clipped message', () => {
    const sp = spec({ centre: 'median', spread: 'sd' });
    const clipped = '1 error bar end lies outside the axis range and is clipped.';
    const lines = intervalCaptionLines({ ...base, spec: sp, stats: computeGroupStats([1, 2, 3], sp), clippedMessage: clipped });
    expect(lines[0]).toContain('SD is not available for the median');
    expect(lines).toContain(clipped);
    expect(lines.filter((l) => /hidden/.test(l))).toEqual([]);
    const hidden = intervalCaptionLines({ ...base, showErrorBars: false, spec: spec({ spread: 'sd' }), stats: null });
    expect(hidden).toContain('Error bars are hidden; the values are still in the tooltips.');
  });
});

describe('centreNoticeLines', () => {
  it('keeps centre notices and drops interval ones', () => {
    expect(centreNoticeLines(computeGroupStats([], spec()))).toEqual(['No valid observations, so no mean can be drawn.']);
    expect(centreNoticeLines(computeGroupStats([7], spec({ spread: 'sd' })))).toEqual([]);
    const withInvalid = computeGroupStats([1, 2, Number.NaN], spec());
    expect(centreNoticeLines(withInvalid)).toEqual(withInvalid.notices.filter((n) => n.code === 'invalid-omitted').map((n) => n.message));
  });
});

describe('datasetRowText and DIRECTION_HINT', () => {
  it('summarises a data set row', () => {
    expect(datasetRowText(computeGroupStats([1, 2, 3, 4, 5], spec()))).toBe('n=5 · mean 3');
    expect(datasetRowText(computeGroupStats([1, 2, 10], spec({ centre: 'median' })))).toBe('n=3 · median 2');
    expect(datasetRowText(computeGroupStats([], spec()))).toBe('n=0');
  });

  it('says the calculation is unchanged by the direction', () => {
    expect(DIRECTION_HINT).toMatch(/does not change the calculation/);
  });
});
