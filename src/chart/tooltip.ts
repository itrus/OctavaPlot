import { format } from 'd3';
import { rowTitleAt } from '../model/rows';
import type { DataTable } from '../model/types';
import { summaryTooltipLines } from '../stats/describe';
import { AXIS_NAME } from './axes';
import type { HitTarget } from './hitTest';
import type { ChartModel } from './model';
import type { GroupedModel } from './groupedModel';
import type { XyModel } from './xyModel';

export const tooltipFmt = format('.4~g');

/** Tooltip lines for a hit, or null when the hit has no data set. */
export function tooltipLines(model: ChartModel, table: DataTable, hit: HitTarget): string[] | null {
  if (!hit.groupId || hit.kind === 'background' || hit.kind === 'annotation') return null;
  const g = model.groups.find((x) => x.groupId === hit.groupId);
  if (!g) return null;
  const lines = [g.label];
  if (model.y2 != null) lines.push(`Axis: ${AXIS_NAME[g.axis]}`);
  if ((hit.kind === 'point' || hit.kind === 'label') && hit.objectId && !hit.objectId.endsWith(':mean')) {
    const p = g.points.find((q) => q.id === hit.objectId);
    if (p && p.observationId !== null) {
      const title = rowTitleAt(table, p.row).trim();
      if (title !== '') lines.push(`Row title: ${title}`);
      lines.push(`Value: ${tooltipFmt(p.value)} (row ${p.row + 1})`);
    }
  }
  const kind = hit.kind === 'error' ? 'error' : 'centre';
  lines.push(...summaryTooltipLines(g.stats, tooltipFmt, { hit: kind }));
  return lines;
}

/** Tooltip lines for a hit on an XY chart: the series, and for a point its X and Y. */
export function xyTooltipLines(model: XyModel, table: DataTable, hit: HitTarget): string[] | null {
  if (!hit.groupId || (hit.kind !== 'point' && hit.kind !== 'line' && hit.kind !== 'legend' && hit.kind !== 'error')) return null;
  const s = model.series.find((x) => x.groupId === hit.groupId);
  if (!s) return null;
  const lines = [s.label];
  if (hit.kind === 'point' && hit.objectId) {
    const p = s.points.find((q) => q.id === hit.objectId);
    if (p) {
      const title = rowTitleAt(table, p.row).trim();
      if (title !== '') lines.push(`Row title: ${title}`);
      lines.push(`X: ${tooltipFmt(p.x)}`, `${p.stats ? 'Centre' : 'Y'}: ${tooltipFmt(p.y)} (row ${p.row + 1})`);
      if (p.stats && p.stats.interval.status === 'ok' && p.stats.interval.lower !== null && p.stats.interval.upper !== null) {
        lines.push(`${s.errorMeaning ?? 'Interval'}: ${tooltipFmt(p.stats.interval.lower)} to ${tooltipFmt(p.stats.interval.upper)}`);
      }
      if (p.stats && p.stats.n > 0) lines.push(`n = ${p.stats.n}`);
    }
  }
  return lines;
}

/** Tooltip lines for a hit on a grouped or contingency chart. */
export function groupedTooltipLines(model: GroupedModel, hit: HitTarget): string[] | null {
  if (!hit.groupId || (hit.kind !== 'bar' && hit.kind !== 'point' && hit.kind !== 'line' && hit.kind !== 'error' && hit.kind !== 'legend')) return null;
  const s = model.series.find((x) => x.groupId === hit.groupId);
  if (!s) return null;
  const lines = [s.label];
  const target = hit.objectId ? (s.bars.find((b) => b.id === hit.objectId) ?? s.points.find((p) => p.id === hit.objectId) ?? s.dots.find((p) => p.id === hit.objectId)) : undefined;
  if (target) {
    const cat = model.categories.find((c) => c.row === target.row);
    if (cat) lines.push(cat.label);
    const value = 'value' in target ? target.value : 0;
    const count = 'count' in target ? target.count : undefined;
    if (model.arrangement === 'percent') lines.push(`${tooltipFmt(value)}%${count !== undefined ? ` (count ${tooltipFmt(count)})` : ''}`);
    else lines.push(`${target.stats ? 'Centre' : model.arrangement === 'side' && count === undefined ? 'Value' : 'Count'}: ${tooltipFmt(value)}`);
    if ('value' in target && s.dots.includes(target as never)) lines.push('One replicate value');
    const st = target.stats;
    if (st && st.interval.status === 'ok' && st.interval.lower !== null && st.interval.upper !== null) lines.push(`${s.errorMeaning ?? 'Interval'}: ${tooltipFmt(st.interval.lower)} to ${tooltipFmt(st.interval.upper)}`);
    if (st && st.n > 0) lines.push(`n = ${st.n}`);
  }
  return lines;
}
