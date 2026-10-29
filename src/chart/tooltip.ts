import { format } from 'd3';
import { rowTitleAt } from '../model/table/rows';
import type { DataTable } from '../model/types';
import { summaryTooltipLines } from '../stats/describe';
import { formatTimeCell } from '../util/timeColumn';
import { AXIS_NAME } from './shared/axes/axes';
import type { HitTarget } from './shared/scene/hitTest';
import type { ColumnModel } from './column/columnModel';
import type { GroupedModel } from './grouped/groupedModel';
import type { HeatModel } from './heatmap/heatmapModel';
import { percentText, type PieModel } from './pie/pieModel';
import type { XyModel } from './xy/xyModel';

export const tooltipFmt = format('.4~g');

/** Tooltip lines for a hit, or null when the hit has no data set. */
export function tooltipLines(model: ColumnModel, table: DataTable, hit: HitTarget): string[] | null {
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
  if (model.y2 != null) lines.push(`Axis: ${AXIS_NAME[s.axis ?? 'primary']}`);
  if (hit.kind === 'point' && hit.objectId) {
    const p = s.points.find((q) => q.id === hit.objectId);
    if (p) {
      const title = rowTitleAt(table, p.row).trim();
      if (title !== '') lines.push(`Row title: ${title}`);
      lines.push(`X: ${table.groups[0].time ? formatTimeCell(p.x, table.groups[0].time) : tooltipFmt(p.x)}`, `${p.stats ? 'Centre' : 'Y'}: ${tooltipFmt(p.y)} (row ${p.row + 1})`);
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
    else lines.push(`${target.stats ? 'Centre' : count === undefined ? 'Value' : 'Count'}: ${tooltipFmt(value)}`);
    if ('value' in target && s.dots.includes(target as never)) lines.push('One replicate value');
    const st = target.stats;
    if (st && st.interval.status === 'ok' && st.interval.lower !== null && st.interval.upper !== null) lines.push(`${s.errorMeaning ?? 'Interval'}: ${tooltipFmt(st.interval.lower)} to ${tooltipFmt(st.interval.upper)}`);
    if (st && st.n > 0) lines.push(`n = ${st.n}`);
  }
  return lines;
}

/** Tooltip lines for a hit on a pie or doughnut: the part, the row, its count and its share. */
export function pieTooltipLines(model: PieModel, hit: HitTarget): string[] | null {
  if (!hit.groupId || (hit.kind !== 'bar' && hit.kind !== 'legend')) return null;
  const part = model.parts.find((p) => p.groupId === hit.groupId);
  if (!part) return null;
  const lines = [part.label];
  const found = model.pies.flatMap((pie) => pie.slices.map((slice) => ({ pie, slice }))).find(({ slice }) => slice.id === hit.objectId);
  if (found) lines.push(found.pie.title, `Count: ${tooltipFmt(found.slice.value)}`, `Share: ${percentText(found.slice.fraction, 1)} of ${tooltipFmt(found.pie.total)}`);
  return lines;
}

/** Tooltip lines for a hit on a histogram (a bar: its bin, count and height) or a cumulative distribution (a step). */
export function histTooltipLines(model: XyModel, hit: HitTarget): string[] | null {
  if (!hit.groupId || (hit.kind !== 'bar' && hit.kind !== 'point' && hit.kind !== 'line' && hit.kind !== 'legend')) return null;
  const s = model.series.find((x) => x.groupId === hit.groupId);
  if (!s) return null;
  const lines = [s.label];
  const bar = s.bars?.find((b) => b.id === hit.objectId);
  if (bar) lines.push(`Bin: ${tooltipFmt(bar.bin[0])} to ${tooltipFmt(bar.bin[1])}`, `Count: ${tooltipFmt(bar.count)}`, `Plotted: ${tooltipFmt(bar.value)}`);
  const step = s.points.find((p) => p.id === hit.objectId);
  if (step) lines.push(`Value: ${tooltipFmt(step.x)}`, `Cumulative: ${tooltipFmt(step.y)}`);
  return lines;
}

/** Tooltip lines for a hit on a heat map cell: its row, its column and its value, named by the statistic (and the value before normalising). */
export function heatTooltipLines(model: HeatModel, hit: HitTarget): string[] | null {
  const cell = model.cells.find((c) => c.id === hit.objectId);
  if (!cell) return null;
  const lines = [cell.colLabel, cell.rowLabel];
  if (cell.value === null) lines.push(cell.status === 'excluded' ? 'Excluded' : 'No value');
  else {
    lines.push(`${model.valueName}: ${tooltipFmt(cell.value)}`);
    if (cell.original !== null && cell.original !== cell.value) lines.push(`Before normalising: ${tooltipFmt(cell.original)}`);
  }
  return lines;
}
