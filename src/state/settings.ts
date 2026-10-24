import type { DecimalSeparator } from '../ui/cellText';
import { CHART_PX_MAX, CHART_PX_MIN, DEFAULT_CHART_HEIGHT_PX, DEFAULT_CHART_WIDTH_PX } from '../model/defaults';

export type ExportFormat = 'png' | 'svg';

/** PNG magnifications offered: 1 px per CSS pixel (96 dpi), and the ones that give 192, 300, 384 and 600 dpi. */
export const PNG_SCALES = [1, 2, 3.125, 4, 6.25] as const;

/** Application preferences. Kept apart from the project: they follow the browser, not the file. */
export interface Settings {
  autosave: boolean;
  /** Add the date and time (yymmdd_HHMM) to the names of exported files. */
  timestampExports: boolean;
  /** New projects start with blank tables instead of the example data. */
  newProjectEmpty: boolean;
  exportFormat: ExportFormat;
  /** How numbers typed, pasted or imported into tables are read (see DecimalSeparator). */
  decimalSeparator: DecimalSeparator;
  /** PNG pixels per CSS pixel of the chart (see PNG_SCALES). */
  pngScale: number;
  /** Size of newly created charts, in CSS pixels. */
  defaultChartWidthPx: number;
  defaultChartHeightPx: number;
}

export const DEFAULT_SETTINGS: Settings = {
  autosave: true,
  timestampExports: true,
  newProjectEmpty: false,
  exportFormat: 'png',
  decimalSeparator: 'auto',
  pngScale: 1,
  defaultChartWidthPx: DEFAULT_CHART_WIDTH_PX,
  defaultChartHeightPx: DEFAULT_CHART_HEIGHT_PX,
};

/**
 * Only the settings the user changed are stored (v2). A setting never touched follows the defaults in the code, so a
 * new default reaches everyone who did not choose otherwise. The v1 key held every setting, defaults included, so
 * its values for the default chart size cannot be told from choices and are not carried over.
 */
export const SETTINGS_KEY = 'octavaplot:settings:v2';
const LEGACY_SETTINGS_KEY = 'octavaplot:settings:v1';

const px = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(CHART_PX_MAX, Math.max(CHART_PX_MIN, Math.round(v))) : fallback;

/** Merge stored or partial values over the defaults, dropping anything out of range. */
export function sanitizeSettings(raw: unknown): Settings {
  const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_SETTINGS;
  return {
    autosave: typeof r.autosave === 'boolean' ? r.autosave : d.autosave,
    timestampExports: typeof r.timestampExports === 'boolean' ? r.timestampExports : d.timestampExports,
    newProjectEmpty: typeof r.newProjectEmpty === 'boolean' ? r.newProjectEmpty : d.newProjectEmpty,
    exportFormat: r.exportFormat === 'svg' || r.exportFormat === 'png' ? r.exportFormat : d.exportFormat,
    decimalSeparator: r.decimalSeparator === 'point' || r.decimalSeparator === 'comma' ? r.decimalSeparator : d.decimalSeparator,
    pngScale: PNG_SCALES.find((v) => v === r.pngScale) ?? d.pngScale,
    defaultChartWidthPx: px(r.defaultChartWidthPx, d.defaultChartWidthPx),
    defaultChartHeightPx: px(r.defaultChartHeightPx, d.defaultChartHeightPx),
  };
}

/** The settings that differ from the defaults. */
export function changedSettings(settings: Settings): Partial<Settings> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof Settings>) {
    if (settings[key] !== DEFAULT_SETTINGS[key]) out[key] = settings[key];
  }
  return out as Partial<Settings>;
}

export function loadSettings(): Settings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) return sanitizeSettings(JSON.parse(stored));
    const old = localStorage.getItem(LEGACY_SETTINGS_KEY);
    if (!old) return DEFAULT_SETTINGS;
    // Carry over the v1 preferences, but not its default chart size (see above).
    const { defaultChartWidthPx: _w, defaultChartHeightPx: _h, ...kept } = JSON.parse(old) as Record<string, unknown>;
    return sanitizeSettings(kept);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(changedSettings(settings)));
  } catch {
    // Storage unavailable: the settings last for this session only.
  }
}
