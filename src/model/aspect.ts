import { CHART_PX_MAX, CHART_PX_MIN } from './defaults';
import type { ChartAspect } from './types';

/** Width divided by height of a locked shape; null while free. */
export const aspectRatio = (aspect: ChartAspect): number | null => (aspect === '4:3' ? 4 / 3 : aspect === '1:1' ? 1 : null);

const clampPx = (v: number) => Math.min(CHART_PX_MAX, Math.max(CHART_PX_MIN, Math.round(v)));

/**
 * New size after one dimension is set. A locked shape moves the other dimension too; when that would leave the
 * allowed range, the pair is scaled back so the shape is kept.
 */
export function resizeChart(
  size: { widthPx: number; heightPx: number },
  aspect: ChartAspect,
  which: 'width' | 'height',
  value: number,
): { widthPx: number; heightPx: number } {
  const ratio = aspectRatio(aspect);
  // Only the two dimensions are returned: callers spread the result into a chart patch, and `size` may be a whole chart.
  if (ratio === null) return which === 'width' ? { widthPx: value, heightPx: size.heightPx } : { widthPx: size.widthPx, heightPx: value };
  // Largest and smallest value of the edited dimension for which both dimensions stay in range.
  const lo = which === 'width' ? Math.max(CHART_PX_MIN, CHART_PX_MIN * ratio) : Math.max(CHART_PX_MIN, CHART_PX_MIN / ratio);
  const hi = which === 'width' ? Math.min(CHART_PX_MAX, CHART_PX_MAX * ratio) : Math.min(CHART_PX_MAX, CHART_PX_MAX / ratio);
  const v = Math.min(hi, Math.max(lo, value));
  const w = which === 'width' ? v : v * ratio;
  return { widthPx: clampPx(w), heightPx: clampPx(w / ratio) };
}

/** Size after switching to a shape: the width stays, the height follows (or the reverse when the height would not fit). */
export const applyAspect = (size: { widthPx: number; heightPx: number }, aspect: ChartAspect) =>
  resizeChart(size, aspect, 'width', size.widthPx);
