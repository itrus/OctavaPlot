import type { Id, LegendConfig } from '../types';
import { applyOrder } from '../table/groupOrder';

/** Most columns the legend can be set out in. */
export const LEGEND_MAX_COLUMNS = 6;

/** Number of columns the legend is set out in: 1 (the entries one under the other, or wrapped along the top or bottom) when none is set. */
export const legendColumns = (legend: Pick<LegendConfig, 'columns'>): number => {
  const n = legend.columns;
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= LEGEND_MAX_COLUMNS ? n : 1;
};

/**
 * Which of the series are listed in the legend and in what order, as positions in `ids` (the series ids in drawing order).
 * Series the user hid from the legend are left out; the order is the legend's own list first (ids that no longer exist are
 * ignored) and the other series after it in series order. The drawing order of the marks never depends on this.
 */
export function legendEntries(legend: Pick<LegendConfig, 'hiddenGroupIds' | 'order'>, ids: readonly Id[]): number[] {
  const shown = ids.flatMap((id, index) => (legend.hiddenGroupIds.includes(id) ? [] : [{ id, index }]));
  return applyOrder(shown, legend.order ?? []).map((e) => e.index);
}

/** The legend's own layout settings read from a file: the order as a list of ids and a column count of 2 to 6; anything else is left out. */
export function sanitizeLegendLayout(raw: Record<string, unknown>): Pick<LegendConfig, 'order' | 'columns'> {
  const order = Array.isArray(raw.order) ? [...new Set(raw.order.filter((id): id is string => typeof id === 'string'))] : [];
  const columns = typeof raw.columns === 'number' && Number.isFinite(raw.columns) ? Math.min(LEGEND_MAX_COLUMNS, Math.max(1, Math.round(raw.columns))) : 1;
  return { ...(order.length > 0 ? { order } : {}), ...(columns > 1 ? { columns } : {}) };
}

/** A legend object from a file without its order and columns, which `sanitizeLegendLayout` reads again. */
export const withoutLegendLayout = (raw: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(Object.entries(raw).filter(([k]) => k !== 'order' && k !== 'columns'));

/** The legend without its order (the order names series of one table and does not go to another graph). */
export function withoutLegendOrder(legend: LegendConfig): LegendConfig {
  const { order: _order, ...rest } = legend;
  return rest;
}

/** The legend without its number of columns (back to one). */
export function withoutLegendColumns(legend: LegendConfig): LegendConfig {
  const { columns: _columns, ...rest } = legend;
  return rest;
}
