import { CHART_PX_MAX, CHART_PX_MIN, DEFAULT_CHART_HEIGHT_PX, DEFAULT_CHART_WIDTH_PX } from '../model/defaults';

export type ExportFormat = 'png' | 'svg';

/** Application preferences. Kept apart from the project: they follow the browser, not the file. */
export interface Settings {
  autosave: boolean;
  /** Add the date and time (yymmdd_HHMM) to the names of exported files. */
  timestampExports: boolean;
  /** New projects start with blank tables instead of the example data. */
  newProjectEmpty: boolean;
  exportFormat: ExportFormat;
  /** Size of newly created charts, in CSS pixels. */
  defaultChartWidthPx: number;
  defaultChartHeightPx: number;
}

export const DEFAULT_SETTINGS: Settings = {
  autosave: true,
  timestampExports: true,
  newProjectEmpty: false,
  exportFormat: 'png',
  defaultChartWidthPx: DEFAULT_CHART_WIDTH_PX,
  defaultChartHeightPx: DEFAULT_CHART_HEIGHT_PX,
};

export const SETTINGS_KEY = 'octavaplot:settings:v1';

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
    defaultChartWidthPx: px(r.defaultChartWidthPx, d.defaultChartWidthPx),
    defaultChartHeightPx: px(r.defaultChartHeightPx, d.defaultChartHeightPx),
  };
}

export function loadSettings(): Settings {
  try {
    const text = localStorage.getItem(SETTINGS_KEY);
    const s = sanitizeSettings(text ? JSON.parse(text) : null);
    // 640 x 480 was the previous default, not a choice: stored copies of it move to the new default.
    if (s.defaultChartWidthPx === 640 && s.defaultChartHeightPx === 480) {
      return { ...s, defaultChartWidthPx: DEFAULT_SETTINGS.defaultChartWidthPx, defaultChartHeightPx: DEFAULT_SETTINGS.defaultChartHeightPx };
    }
    return s;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable: the settings last for this session only.
  }
}
