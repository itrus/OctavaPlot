import { describe, expect, it } from 'vitest';
import { afterEach, vi } from 'vitest';
import { changedSettings, DEFAULT_SETTINGS, loadSettings, saveSettings, SETTINGS_KEY, sanitizeSettings } from './settings';

describe('sanitizeSettings', () => {
  it('defaults to PNG export with autosave on', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.exportFormat).toBe('png');
    expect(DEFAULT_SETTINGS.autosave).toBe(true);
    expect(DEFAULT_SETTINGS.timestampExports).toBe(true);
    expect(DEFAULT_SETTINGS.newProjectEmpty).toBe(false);
    expect(DEFAULT_SETTINGS.defaultChartWidthPx).toBe(1024);
    expect(DEFAULT_SETTINGS.defaultChartHeightPx).toBe(768);
    expect('exportScale' in DEFAULT_SETTINGS).toBe(false);
  });

  it('keeps valid values', () => {
    const s = sanitizeSettings({ autosave: false, newProjectEmpty: true, timestampExports: false, exportFormat: 'svg', defaultChartWidthPx: 800, defaultChartHeightPx: 500 });
    expect(s).toEqual({ autosave: false, newProjectEmpty: true, timestampExports: false, exportFormat: 'svg', decimalSeparator: 'auto', pngScale: 1, defaultChartWidthPx: 800, defaultChartHeightPx: 500 });
  });

  it('replaces invalid values with defaults and clamps sizes', () => {
    const s = sanitizeSettings({ autosave: 'yes', exportFormat: 'gif', defaultChartWidthPx: 5, defaultChartHeightPx: 'big' });
    expect(s.autosave).toBe(true);
    expect(s.exportFormat).toBe('png');
    expect(s.defaultChartWidthPx).toBe(100);
    expect(s.defaultChartHeightPx).toBe(DEFAULT_SETTINGS.defaultChartHeightPx);
  });
});

describe('stored settings', () => {
  const fakeStorage = (initial: Record<string, string> = {}) => {
    const data = new Map(Object.entries(initial));
    vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) });
    return data;
  };
  afterEach(() => vi.unstubAllGlobals());

  it('keeps only what differs from the defaults', () => {
    expect(changedSettings(DEFAULT_SETTINGS)).toEqual({});
    expect(changedSettings({ ...DEFAULT_SETTINGS, autosave: false })).toEqual({ autosave: false });
  });

  it('saves only the changes, so a new default reaches everyone who did not choose', () => {
    const data = fakeStorage();
    saveSettings({ ...DEFAULT_SETTINGS, exportFormat: 'svg' });
    expect(JSON.parse(data.get(SETTINGS_KEY)!)).toEqual({ exportFormat: 'svg' });
    expect(loadSettings()).toEqual({ ...DEFAULT_SETTINGS, exportFormat: 'svg' });
  });

  it('does not carry the old default chart size over from the earlier storage key', () => {
    fakeStorage({ 'octavaplot:settings:v1': JSON.stringify({ autosave: false, exportFormat: 'svg', defaultChartWidthPx: 1280, defaultChartHeightPx: 960 }) });
    expect(loadSettings()).toEqual({ ...DEFAULT_SETTINGS, autosave: false, exportFormat: 'svg' });
  });
});

describe('PNG resolution', () => {
  it('defaults to 1x and accepts only the offered scales', () => {
    expect(sanitizeSettings({}).pngScale).toBe(1);
    expect(sanitizeSettings({ pngScale: 3.125 }).pngScale).toBe(3.125);
    expect(sanitizeSettings({ pngScale: 7 }).pngScale).toBe(1);
    expect(sanitizeSettings({ pngScale: '2' }).pngScale).toBe(1);
  });
});
