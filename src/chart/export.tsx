import { renderToStaticMarkup } from 'react-dom/server';
import type { Chart, DataTable } from '../model/types';
import { mmToPx } from '../model/units';
import { ChartSvg } from './ChartSvg';
import { buildChartModel } from './model';

/**
 * Export renders the same declarative <ChartSvg> without editor state, so
 * selection outlines, hover helpers and hit-test attributes cannot leak in.
 * Output stays vector: paths, text and symbols.
 */
export function chartToSvgString(chart: Chart, table: DataTable): string {
  const model = buildChartModel(chart, table);
  const markup = renderToStaticMarkup(
    <ChartSvg chart={chart} model={model} cssWidth={`${chart.widthMm}mm`} cssHeight={`${chart.heightMm}mm`} />,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n${markup}\n`;
}

/** Rasterise at `scale` x the chart's nominal CSS pixel size (96 px/in). */
export async function chartToPngBlob(chart: Chart, table: DataTable, scale: number): Promise<Blob> {
  const svg = chartToSvgString(chart, table);
  const width = Math.max(1, Math.round(mmToPx(chart.widthMm) * scale));
  const height = Math.max(1, Math.round(mmToPx(chart.heightMm) * scale));
  const img = new Image();
  const loaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('The browser could not rasterise the SVG.'));
  });
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await loaded;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context is unavailable.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed.'))), 'image/png'),
  );
}

export { downloadBlob, safeFileName } from '../util/download';
