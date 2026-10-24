import { renderToStaticMarkup } from 'react-dom/server';
import type { Chart, DataTable, FitSettings } from '../model/types';
import { chartPx2Pt } from '../model/units';
import { buildAnyModel, ChartCanvas } from './anyModel';
import { buildPdf, rgbaToFlateRgb } from './pdf';

/**
 * Export renders the same declarative <ChartSvg> without editor state, so
 * selection outlines, hover helpers and hit-test attributes cannot leak in.
 * Output stays vector: paths, text and symbols.
 */
/**
 * `metadata` (what the Export SVG command asks for) adds the title, the description and the chart-specific id prefixes that make
 * the file self-describing and safe to place beside other exports; without it the drawing is the bare renderer output.
 */
export function chartToSvgString(chart: Chart, table: DataTable, fit?: FitSettings, options: { metadata?: boolean } = {}): string {
  const any = buildAnyModel(chart, table, fit);
  const markup = renderToStaticMarkup(<ChartCanvas chart={chart} any={any} cssWidth={`${chart.widthPx}px`} cssHeight={`${chart.heightPx}px`} />);
  const described = options.metadata ? describeSvg(prefixIds(markup, chart.id), chart, table, any.model.warnings) : markup;
  return `<?xml version="1.0" encoding="UTF-8"?>\n${described}\n`;
}

const escapeXml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const safeId = (id: string) => `octp-${id.replace(/[^A-Za-z0-9_-]/g, '')}`;

/**
 * Gives every id in the drawing (clip paths, patterns) a prefix taken from the chart, so two exported drawings placed in
 * one page cannot take each other's clips; the references to them follow.
 */
function prefixIds(markup: string, chartId: string): string {
  const prefix = `${safeId(chartId)}-`;
  const ids = new Set([...markup.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
  let out = markup;
  for (const id of ids) {
    out = out.split(` id="${id}"`).join(` id="${prefix}${id}"`).split(`url(#${id})`).join(`url(#${prefix}${id})`).split(`href="#${id}"`).join(`href="#${prefix}${id}"`);
  }
  return out;
}

/** Adds a title and a description to the opening of the <svg>, so the file says what it shows (and a reader can announce it). */
function describeSvg(markup: string, chart: Chart, table: DataTable, notices: readonly string[]): string {
  const end = markup.indexOf('>');
  if (!markup.startsWith('<svg') || end < 0) return markup;
  const title = (chart.showTitle && chart.title.trim() !== '' ? chart.title : chart.name).trim() || 'Chart';
  const desc = `${chart.type} chart of the table "${table.name}"${notices.length > 0 ? `. Notices: ${notices.join(' ')}` : ''}`;
  const base = safeId(chart.id);
  const head = `${markup.slice(0, end).replace('<svg', '<svg role="img"')} aria-labelledby="${base}-title ${base}-desc">`;
  return `${head}<title id="${base}-title">${escapeXml(title)}</title><desc id="${base}-desc">${escapeXml(desc)}</desc>${markup.slice(end + 1)}`;
}

/** Rasterise at `scale` x the chart's nominal CSS pixel size (96 px/in). */
export async function chartToPngBlob(chart: Chart, table: DataTable, scale: number, fit?: FitSettings): Promise<Blob> {
  const canvas = await chartToCanvas(chart, table, scale, fit);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed.'))), 'image/png'),
  );
}

/** A one-page PDF the size of the chart (1 px = 0.75 pt) holding a picture of it at `dpi` dots per inch; see pdf.ts. */
export async function chartToPdfBlob(chart: Chart, table: DataTable, dpi: number, fit?: FitSettings): Promise<Blob> {
  const canvas = await chartToCanvas(chart, table, dpi / 96, fit);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context is unavailable.');
  const flateRgb = await rgbaToFlateRgb(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
  return new Blob([buildPdf({ widthPt: chartPx2Pt(chart.widthPx), heightPt: chartPx2Pt(chart.heightPx), pxWidth: canvas.width, pxHeight: canvas.height, flateRgb, title: chart.name }) as BlobPart], { type: 'application/pdf' });
}

async function chartToCanvas(chart: Chart, table: DataTable, scale: number, fit?: FitSettings): Promise<HTMLCanvasElement> {
  const svg = chartToSvgString(chart, table, fit);
  const width = Math.max(1, Math.round(chart.widthPx * scale));
  const height = Math.max(1, Math.round(chart.heightPx * scale));
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
  // The page colour is part of the SVG; with none chosen the PNG stays transparent.
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
}
