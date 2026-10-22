import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, sanitizeSettings } from './settings';

describe('sanitizeSettings', () => {
  it('defaults to PNG export with autosave on', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.exportFormat).toBe('png');
    expect(DEFAULT_SETTINGS.autosave).toBe(true);
    expect(DEFAULT_SETTINGS.timestampExports).toBe(true);
    expect(DEFAULT_SETTINGS.newProjectEmpty).toBe(false);
    expect(DEFAULT_SETTINGS.defaultChartWidthPx).toBe(1280);
    expect(DEFAULT_SETTINGS.defaultChartHeightPx).toBe(960);
    expect('exportScale' in DEFAULT_SETTINGS).toBe(false);
  });

  it('keeps valid values', () => {
    const s = sanitizeSettings({ autosave: false, newProjectEmpty: true, timestampExports: false, exportFormat: 'svg', defaultChartWidthPx: 800, defaultChartHeightPx: 500 });
    expect(s).toEqual({ autosave: false, newProjectEmpty: true, timestampExports: false, exportFormat: 'svg', defaultChartWidthPx: 800, defaultChartHeightPx: 500 });
  });

  it('replaces invalid values with defaults and clamps sizes', () => {
    const s = sanitizeSettings({ autosave: 'yes', exportFormat: 'gif', defaultChartWidthPx: 5, defaultChartHeightPx: 'big' });
    expect(s.autosave).toBe(true);
    expect(s.exportFormat).toBe('png');
    expect(s.defaultChartWidthPx).toBe(100);
    expect(s.defaultChartHeightPx).toBe(DEFAULT_SETTINGS.defaultChartHeightPx);
  });
});
