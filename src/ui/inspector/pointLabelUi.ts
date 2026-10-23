import type {
  ChartStyle,
  ChartType,
  PointLabelCollision,
  PointLabelPlacement,
  PointLabelSource,
} from '../../model/types';
import {
  LABEL_AUTO_COLOR,
  LABEL_DECIMALS_LIMITS,
  effectiveLabelSource,
  labelAvailability,
  labelWarnings,
  sanitizeLabelStyle,
  type PointLabelReport,
  type SuppressedLabel,
} from '../../chart/labels';

const PLACEMENT_OPTIONS: Array<{ value: PointLabelPlacement; label: string }> = [
  { value: 'above-right', label: 'Above right' },
  { value: 'above', label: 'Above' },
  { value: 'below', label: 'Below' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'centre', label: 'Centre' },
  { value: 'custom', label: 'Custom' },
];

export const COLLISION_OPTIONS: Array<{ value: PointLabelCollision; label: string }> = [
  { value: 'keep', label: 'Keep overlaps' },
  { value: 'hide', label: 'Hide overlapping labels' },
  { value: 'repel', label: 'Move labels apart' },
];

const SOURCE_LABELS: Record<PointLabelSource, string> = { rowTitle: 'Row title', value: 'Value' };
const SOURCES: PointLabelSource[] = ['rowTitle', 'value'];
const PLACEMENTS: PointLabelPlacement[] = PLACEMENT_OPTIONS.map((o) => o.value);
const COLLISIONS: PointLabelCollision[] = ['keep', 'hide', 'repel'];

const CUSTOM_PLACEMENT_REASON = 'Custom is set for a single point, not for a whole data set.';
export const CENTRE_OFFSET_REASON = 'Centred labels ignore the offsets.';
export const NAMED_OFFSET_NOTE = 'Gap from the symbol edge. Negative values count as 0.';
export const CUSTOM_OFFSET_NOTE = 'Signed distance from the point to the top-left corner of the label.';
/** Row titles are stored in the project file and the autosave, outside any BAA-covered system (P). */
export const IDENTIFIER_NOTE =
  'Row titles are saved in the project file and in this browser. Do not use patient identifiers.';
const DEFAULT_DECIMALS = 2;

export interface PointLabelUi {
  checkboxEnabled: boolean;
  checkboxReason: string | null;
  /** The option controls apply: symbols are on and labels are requested. */
  optionsEnabled: boolean;
  caption: string;
  colourAuto: boolean;
  /** Colour shown in the picker; the Auto colour while Auto is on. */
  colourValue: string;
  source: PointLabelSource;
  sources: Array<{ value: PointLabelSource; label: string; enabled: boolean; reason: string | null }>;
  showIdentifierNote: boolean;
  decimals: { visible: boolean; enabled: boolean; auto: boolean; value: number };
  placement: PointLabelPlacement;
  placements: Array<{ value: PointLabelPlacement; label: string; disabled: boolean }>;
  placementReason: string | null;
  collision: PointLabelCollision;
  offsets: { enabled: boolean; note: string };
}

/** Which label controls apply and why, from the chart type and the (possibly hand-edited) style. */
export function describePointLabelUi(type: ChartType, style: ChartStyle): PointLabelUi {
  const s = sanitizeLabelStyle(style);
  const avail = labelAvailability(type, s);
  const optionsEnabled = avail.available && s.showPointLabels === true;
  const source = effectiveLabelSource(type, SOURCES.includes(s.pointLabelSource) ? s.pointLabelSource : 'rowTitle');
  const placement = PLACEMENTS.includes(s.pointLabelPlacement) ? s.pointLabelPlacement : 'above-right';
  const collision = COLLISIONS.includes(s.pointLabelCollision) ? s.pointLabelCollision : 'keep';
  const auto = s.pointLabelDecimals === null;
  const decimals = s.pointLabelDecimals ?? DEFAULT_DECIMALS;

  let caption: string;
  if (!avail.available) caption = avail.reason ?? '';
  else if (!s.showPointLabels) caption = 'Labels are off.';
  else if (source === 'value') {
    const how = auto ? '6 significant digits' : `${decimals} decimal${decimals === 1 ? '' : 's'}`;
    caption =
      type === 'mean'
        ? `Each mean marker is labelled with its centre value (${how}).`
        : `Each point is labelled with its value (${how}).`;
  } else caption = 'Each point is labelled with its row title. Points with no title are not labelled.';

  const custom = placement === 'custom';
  return {
    checkboxEnabled: avail.available,
    checkboxReason: avail.reason,
    optionsEnabled,
    caption,
    colourAuto: s.pointLabelColor === null,
    colourValue: s.pointLabelColor ?? LABEL_AUTO_COLOR,
    source,
    sources: avail.sources.map((o) => ({
      value: o.value,
      label: SOURCE_LABELS[o.value],
      enabled: o.enabled,
      reason: o.reason,
    })),
    showIdentifierNote: optionsEnabled && source === 'rowTitle',
    decimals: { visible: source === 'value', enabled: optionsEnabled, auto, value: decimals },
    placement,
    placements: PLACEMENT_OPTIONS.map((o) => ({ ...o, disabled: o.value === 'custom' })),
    placementReason: custom ? CUSTOM_PLACEMENT_REASON : null,
    collision,
    offsets: {
      enabled: optionsEnabled && placement !== 'centre',
      note: placement === 'centre' ? CENTRE_OFFSET_REASON : custom ? CUSTOM_OFFSET_NOTE : NAMED_OFFSET_NOTE,
    },
  };
}

/** Patch for a placement choice; null for Custom or an unknown value, which a data set cannot choose. */
export function placementPatch(value: string): Partial<ChartStyle> | null {
  if (value === 'custom' || !PLACEMENTS.includes(value as PointLabelPlacement)) return null;
  return { pointLabelPlacement: value as PointLabelPlacement };
}

/** Auto stores null; switching Auto off keeps the colour shown, so nothing jumps. */
export function colourPatch(auto: boolean, shown: string = LABEL_AUTO_COLOR): Partial<ChartStyle> {
  return { pointLabelColor: auto ? null : /^#[0-9a-fA-F]{6}$/.test(shown) ? shown : LABEL_AUTO_COLOR };
}

/** Auto stores null (6 significant digits); otherwise a whole number within the limits. */
export function decimalsPatch(auto: boolean, value: number = DEFAULT_DECIMALS): Partial<ChartStyle> {
  if (auto) return { pointLabelDecimals: null };
  const n = Number.isFinite(value) ? Math.round(value) : DEFAULT_DECIMALS;
  return { pointLabelDecimals: Math.min(LABEL_DECIMALS_LIMITS.max, Math.max(LABEL_DECIMALS_LIMITS.min, n)) };
}

/** Status block lines: the drawn count, then the warning texts. Empty while nothing is eligible. */
export function labelStatusLines(report: PointLabelReport): string[] {
  if (report.eligible <= 0) return [];
  return [`${report.drawn} of ${report.eligible} point labels drawn.`, ...labelWarnings(report)];
}

export const MAX_SUPPRESSED_ROWS = 20;

const SUPPRESSED_REASON: Record<SuppressedLabel['reason'], string> = {
  overlap: 'overlaps another label',
  tooLarge: 'too large for the plot area',
};

/** Plain-text rows for hidden labels (never markup), capped; `more` counts the rows left out. */
export function suppressedRows(suppressed: readonly SuppressedLabel[]): { rows: string[]; more: number } {
  const rows = suppressed
    .slice(0, MAX_SUPPRESSED_ROWS)
    .map((s) => `${s.text === '' ? '(empty)' : s.text}: ${SUPPRESSED_REASON[s.reason] ?? 'hidden'}`);
  return { rows, more: Math.max(0, suppressed.length - rows.length) };
}
