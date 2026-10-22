import { format } from 'd3';
import { rowTitleAt } from '../model/rows';
import type { DataTable } from '../model/types';
import { summaryTooltipLines } from '../stats/describe';
import { AXIS_NAME } from './axes';
import type { HitTarget } from './hitTest';
import type { ChartModel } from './model';

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
