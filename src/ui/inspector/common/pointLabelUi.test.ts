import { describe, expect, it } from 'vitest';
import { emptyPointLabelModel } from '../../../chart/shared/parts/labels';
import { DEFAULT_STYLE } from '../../../model/defaults';
import type { ChartStyle } from '../../../model/types';
import {
  CENTRE_OFFSET_REASON,
  CUSTOM_OFFSET_NOTE,
  MAX_SUPPRESSED_ROWS,
  NAMED_OFFSET_NOTE,
  colourPatch,
  decimalsPatch,
  describePointLabelUi,
  labelStatusLines,
  placementPatch,
  suppressedRows,
} from './pointLabelUi';

const style = (patch: Partial<ChartStyle> = {}): ChartStyle => ({
  ...DEFAULT_STYLE,
  showSymbols: true,
  showPointLabels: true,
  ...patch,
});

describe('caption by source', () => {
  it('names the row title source', () => {
    expect(describePointLabelUi('scatter', style()).caption).toMatch(/row title/);
  });
  it('names the value source with its digits', () => {
    expect(describePointLabelUi('scatter', style({ pointLabelSource: 'value' })).caption).toContain('6 significant digits');
    expect(describePointLabelUi('scatter', style({ pointLabelSource: 'value', pointLabelDecimals: 1 })).caption).toContain('1 decimal)');
    expect(describePointLabelUi('scatter', style({ pointLabelSource: 'value', pointLabelDecimals: 3 })).caption).toContain('3 decimals');
  });
  it('uses the value for mean markers whatever the stored source', () => {
    const ui = describePointLabelUi('mean', style({ pointLabelSource: 'rowTitle' }));
    expect(ui.source).toBe('value');
    expect(ui.caption).toMatch(/mean marker/);
  });
});

describe('checkbox and options enable rules', () => {
  it('needs symbols for the checkbox', () => {
    const ui = describePointLabelUi('scatter', style({ showSymbols: false }));
    expect(ui.checkboxEnabled).toBe(false);
    expect(ui.checkboxReason).toContain('Symbols');
    expect(ui.optionsEnabled).toBe(false);
    expect(ui.caption).toBe(ui.checkboxReason);
  });
  it('disables the options while labels are off', () => {
    const ui = describePointLabelUi('scatter', style({ showPointLabels: false }));
    expect(ui.checkboxEnabled).toBe(true);
    expect(ui.checkboxReason).toBeNull();
    expect(ui.optionsEnabled).toBe(false);
    expect(ui.caption).toBe('Labels are off.');
  });
  it('enables everything when labels are on', () => {
    expect(describePointLabelUi('scatter', style()).optionsEnabled).toBe(true);
  });
});

describe('colour Auto', () => {
  it('is Auto for null and shows black', () => {
    const ui = describePointLabelUi('scatter', style());
    expect(ui.colourAuto).toBe(true);
    expect(ui.colourValue).toBe('#000000');
  });
  it('shows a stored colour', () => {
    const ui = describePointLabelUi('scatter', style({ pointLabelColor: '#336699' }));
    expect(ui.colourAuto).toBe(false);
    expect(ui.colourValue).toBe('#336699');
  });
  it('colourPatch stores null for Auto and keeps the shown colour otherwise', () => {
    expect(colourPatch(true)).toEqual({ pointLabelColor: null });
    expect(colourPatch(false, '#336699')).toEqual({ pointLabelColor: '#336699' });
    expect(colourPatch(false)).toEqual({ pointLabelColor: '#000000' });
    expect(colourPatch(false, 'red')).toEqual({ pointLabelColor: '#000000' });
  });
});

describe('source options absence rule', () => {
  it('disables the row title option for mean charts with the reason', () => {
    const rowTitle = describePointLabelUi('mean', style()).sources.find((s) => s.value === 'rowTitle')!;
    expect(rowTitle.enabled).toBe(false);
    expect(rowTitle.reason).toMatch(/no single row/);
  });
  it('offers both for scatter and hides the identifier note for values', () => {
    const ui = describePointLabelUi('scatter', style());
    expect(ui.sources.every((s) => s.enabled)).toBe(true);
    expect(ui.showIdentifierNote).toBe(true);
    expect(describePointLabelUi('scatter', style({ pointLabelSource: 'value' })).showIdentifierNote).toBe(false);
    expect(describePointLabelUi('scatter', style({ showPointLabels: false })).showIdentifierNote).toBe(false);
  });
});

describe('decimals row', () => {
  it('is visible only for the value source', () => {
    expect(describePointLabelUi('scatter', style()).decimals.visible).toBe(false);
    expect(describePointLabelUi('scatter', style({ pointLabelSource: 'value' })).decimals.visible).toBe(true);
    expect(describePointLabelUi('mean', style()).decimals.visible).toBe(true);
  });
  it('reports auto and seeds a number', () => {
    const ui = describePointLabelUi('scatter', style({ pointLabelSource: 'value' }));
    expect(ui.decimals.auto).toBe(true);
    expect(ui.decimals.value).toBe(2);
    expect(describePointLabelUi('scatter', style({ pointLabelSource: 'value', pointLabelDecimals: 4 })).decimals).toMatchObject({
      auto: false,
      value: 4,
    });
  });
  it('decimalsPatch handles Auto, rounding and limits', () => {
    expect(decimalsPatch(true)).toEqual({ pointLabelDecimals: null });
    expect(decimalsPatch(false)).toEqual({ pointLabelDecimals: 2 });
    expect(decimalsPatch(false, 3.6)).toEqual({ pointLabelDecimals: 4 });
    expect(decimalsPatch(false, 99)).toEqual({ pointLabelDecimals: 10 });
    expect(decimalsPatch(false, -3)).toEqual({ pointLabelDecimals: 0 });
    expect(decimalsPatch(false, Number.NaN)).toEqual({ pointLabelDecimals: 2 });
  });
});

describe('placement options', () => {
  it('lists the seven placements with only Custom disabled', () => {
    const ui = describePointLabelUi('scatter', style());
    expect(ui.placements.map((p) => p.value)).toEqual(['above-right', 'above', 'below', 'left', 'right', 'centre', 'custom']);
    expect(ui.placements.filter((p) => p.disabled).map((p) => p.value)).toEqual(['custom']);
  });
  it('explains a stored custom placement', () => {
    const ui = describePointLabelUi('scatter', style({ pointLabelPlacement: 'custom' }));
    expect(ui.placement).toBe('custom');
    expect(ui.placementReason).toMatch(/single point/);
    expect(describePointLabelUi('scatter', style()).placementReason).toBeNull();
  });
});

describe('offset rules', () => {
  it('is enabled for named placements with the gap note', () => {
    const ui = describePointLabelUi('scatter', style());
    expect(ui.offsets).toEqual({ enabled: true, note: NAMED_OFFSET_NOTE });
  });
  it('is disabled for centre with a reason', () => {
    expect(describePointLabelUi('scatter', style({ pointLabelPlacement: 'centre' })).offsets).toEqual({
      enabled: false,
      note: CENTRE_OFFSET_REASON,
    });
  });
  it('is signed for custom', () => {
    expect(describePointLabelUi('scatter', style({ pointLabelPlacement: 'custom' })).offsets).toEqual({
      enabled: true,
      note: CUSTOM_OFFSET_NOTE,
    });
  });
  it('is disabled while the options are off', () => {
    expect(describePointLabelUi('scatter', style({ showPointLabels: false })).offsets.enabled).toBe(false);
  });
});

describe('placementPatch', () => {
  it('returns a patch for named placements', () => {
    expect(placementPatch('below')).toEqual({ pointLabelPlacement: 'below' });
    expect(placementPatch('centre')).toEqual({ pointLabelPlacement: 'centre' });
  });
  it('refuses custom and unknown values', () => {
    expect(placementPatch('custom')).toBeNull();
    expect(placementPatch('diagonal')).toBeNull();
    expect(placementPatch('')).toBeNull();
  });
});

describe('labelStatusLines', () => {
  const report = { ...emptyPointLabelModel().report };
  it('is empty with nothing eligible', () => {
    expect(labelStatusLines(report)).toEqual([]);
  });
  it('gives the drawn count then the warnings', () => {
    const lines = labelStatusLines({ ...report, eligible: 5, drawn: 3, hidden: 1, overlapping: 2 });
    expect(lines[0]).toBe('3 of 5 point labels drawn.');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toMatch(/hidden/);
    expect(lines[2]).toMatch(/overlap/);
  });
  it('has just the count when all is well', () => {
    expect(labelStatusLines({ ...report, eligible: 2, drawn: 2 })).toEqual(['2 of 2 point labels drawn.']);
  });
});

describe('suppressedRows', () => {
  it('writes plain text rows', () => {
    const r = suppressedRows([
      { id: 'a', text: '<b>x</b>', reason: 'overlap' },
      { id: 'b', text: 'long', reason: 'tooLarge' },
    ]);
    expect(r.rows).toEqual(['<b>x</b>: overlaps another label', 'long: too large for the plot area']);
    expect(r.more).toBe(0);
  });
  it('caps the list and counts the rest', () => {
    const many = Array.from({ length: MAX_SUPPRESSED_ROWS + 5 }, (_, i) => ({ id: `p${i}`, text: `t${i}`, reason: 'overlap' as const }));
    const r = suppressedRows(many);
    expect(r.rows).toHaveLength(MAX_SUPPRESSED_ROWS);
    expect(r.more).toBe(5);
  });
  it('shows an empty text as a placeholder', () => {
    expect(suppressedRows([{ id: 'a', text: '', reason: 'overlap' }]).rows[0]).toMatch(/^\(empty\)/);
  });
});

describe('robustness for hand-edited values', () => {
  it('survives invalid enums and numbers', () => {
    const bad = style({
      pointLabelSource: 'nonsense' as never,
      pointLabelPlacement: 'sideways' as never,
      pointLabelCollision: 'explode' as never,
      pointLabelColor: 'red',
      pointLabelDecimals: Number.NaN,
      pointLabelFontSizePt: Number.NaN,
    });
    const ui = describePointLabelUi('scatter', bad);
    expect(ui.source).toBe('rowTitle');
    expect(ui.placement).toBe('above-right');
    expect(ui.collision).toBe('keep');
    expect(ui.colourAuto).toBe(true);
    expect(ui.decimals.auto).toBe(true);
  });
  it('treats a non-boolean showPointLabels as off', () => {
    expect(describePointLabelUi('scatter', style({ showPointLabels: 'yes' as never })).optionsEnabled).toBe(false);
  });
  it('does not change the style it is given', () => {
    const s = style({ pointLabelDecimals: 99 });
    describePointLabelUi('scatter', s);
    expect(s.pointLabelDecimals).toBe(99);
  });
});
