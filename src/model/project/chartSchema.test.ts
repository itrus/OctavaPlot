import { describe, expect, it } from 'vitest';
import { createChart, DEFAULT_STYLE } from '../defaults';
import { CHART_TYPES } from '../graph/chartTypes';
import { checkSettings, type SettingSchema } from '../options/settingSchema';
import { CHART_SCHEMA, STYLE_SCHEMA } from './chartSchema';

// A new default setting must have an explicit structural contract, including nested fields.
function uncovered(value: Record<string, unknown>, schema: SettingSchema, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, item]) => {
    const path = `${prefix}${key}`;
    if (!Object.hasOwn(schema, key)) return [path];
    const rule = schema[key];
    return item !== null && typeof item === 'object' && !Array.isArray(item) && typeof rule !== 'string'
      ? uncovered(item as Record<string, unknown>, rule, `${path}.`) : [];
  });
}

describe('explicit settings contracts', () => {
  it('covers the defaults of every chart family; styles and layers have their own readers', () => {
    expect(uncovered({ ...DEFAULT_STYLE }, STYLE_SCHEMA)).toEqual([]);
    for (const { type } of CHART_TYPES) {
      const { defaults: _defaults, layers: _layers, ...chart } = createChart('table', undefined, type);
      expect(uncovered(chart, CHART_SCHEMA), type).toEqual([]);
      const notes: string[] = [];
      expect(checkSettings(chart, CHART_SCHEMA, 'chart', notes)).toEqual(chart);
      expect(notes).toEqual([]);
    }
  });

  it('accepts nullable settings independently of a preset’s chosen defaults', () => {
    const values = { paletteId: null, pageColor: null, traceOffset: 0, fit: { analysisId: 'fit-1' }, heatmap: { barTitle: 'Counts', customColours: { mid: '#abcdef' } } };
    const notes: string[] = [];
    expect(checkSettings(values, CHART_SCHEMA, 'chart', notes)).toEqual(values);
    expect(notes).toEqual([]);
  });

  it('rejects nested wrong types without touching valid siblings or fields handled by another reader', () => {
    const raw = { title: false, widthPx: Infinity, fit: { analysisId: 7, model: 'linear' }, xAxis: { min: '0', max: 20 }, annotations: [], defaults: { showBars: false } };
    const notes: string[] = [];
    expect(checkSettings(raw, CHART_SCHEMA, 'chart', notes)).toEqual({ fit: { model: 'linear' }, xAxis: { max: 20 }, annotations: [], defaults: { showBars: false } });
    expect(notes.map((n) => n.split(' ')[0]).sort()).toEqual(['chart.fit.analysisId', 'chart.title', 'chart.widthPx', 'chart.xAxis.min']);
    expect(raw.xAxis.min).toBe('0');
  });
});
