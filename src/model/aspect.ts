import { CHART_PX_MAX, CHART_PX_MIN } from './defaults';
import type { ChartAspect } from './types';

/** Width divided by height of a locked shape; null while free. */
const aspectRatio = (aspect: ChartAspect): number | null =>
  aspect === '4:3' ? 4 / 3 : aspect === '3:4' ? 3 / 4 : aspect === '1:1' ? 1 : null;

/** Ready-made sizes; picking one also locks the matching shape. */
export const SIZE_PRESETS: readonly { id: string; label: string; widthPx: number; heightPx: number; aspect: ChartAspect }[] = [
  { id: '600x600', label: '600 × 600 (square)', widthPx: 600, heightPx: 600, aspect: '1:1' },
  { id: '600x800', label: '600 × 800 (3:4)', widthPx: 600, heightPx: 800, aspect: '3:4' },
  { id: '800x600', label: '800 × 600 (4:3)', widthPx: 800, heightPx: 600, aspect: '4:3' },
  { id: '1024x768', label: '1024 × 768 (4:3)', widthPx: 1024, heightPx: 768, aspect: '4:3' },
  { id: '1600x1200', label: '1600 × 1200 (4:3)', widthPx: 1600, heightPx: 1200, aspect: '4:3' },
];

/** The preset a chart currently matches, or undefined for a custom size. */
export const presetOf = (chart: { widthPx: number; heightPx: number; aspect: ChartAspect }) =>
  SIZE_PRESETS.find((p) => p.widthPx === chart.widthPx && p.heightPx === chart.heightPx && p.aspect === chart.aspect);

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
