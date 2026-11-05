import { renderToStaticMarkup } from 'react-dom/server';
import type { Chart, DataTable, FitSettings } from '../../model/types';
import { buildAnyModel, ChartCanvas } from '../anyModel';
import { plainText } from '../../util/richText';
import { svgToPngBlob } from './pngDpi';
import { escapeXml, prefixIds as prefixIdsWith } from './prefixIds';
import { svgToPdf } from './svgPdf';

/**
 * Export renders the same declarative <ChartCanvas> without editor state, so
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

const safeId = (id: string) => `octp-${id.replace(/[^A-Za-z0-9_-]/g, '')}`;

/**
 * Gives every id in the drawing (clip paths, patterns) a prefix taken from the chart, so two exported drawings placed in
 * one page cannot take each other's clips; the references to them follow.
 */
function prefixIds(markup: string, chartId: string): string {
  return prefixIdsWith(markup, `${safeId(chartId)}-`);
}

/** Adds a title and a description to the opening of the <svg>, so the file says what it shows (and a reader can announce it). */
function describeSvg(markup: string, chart: Chart, table: DataTable, notices: readonly string[]): string {
  const end = markup.indexOf('>');
  if (!markup.startsWith('<svg') || end < 0) return markup;
  // The title as it reads, without its markup (H_{2}O is announced as H2O).
  const title = (chart.showTitle && chart.title.trim() !== '' ? plainText(chart.title) : chart.name).trim() || 'Chart';
  const desc = `${chart.type} chart of the table "${table.name}"${notices.length > 0 ? `. Notices: ${notices.join(' ')}` : ''}`;
  const base = safeId(chart.id);
  const head = `${markup.slice(0, end).replace('<svg', '<svg role="img"')} aria-labelledby="${base}-title ${base}-desc">`;
  return `${head}<title id="${base}-title">${escapeXml(title)}</title><desc id="${base}-desc">${escapeXml(desc)}</desc>${markup.slice(end + 1)}`;
}

/** Rasterise at `dpi` dots per inch (96 is the chart's own size in CSS pixels); the resolution is written into the file. */
export async function chartToPngBlob(chart: Chart, table: DataTable, dpi: number, fit?: FitSettings): Promise<Blob> {
  const scale = dpi / 96;
  const width = Math.max(1, Math.round(chart.widthPx * scale));
  const height = Math.max(1, Math.round(chart.heightPx * scale));
  return svgToPngBlob(chartToSvgString(chart, table, fit), width, height, dpi);
}

/**
 * A one-page PDF the size of the chart (1 px = 0.75 pt), written from the same SVG as the SVG export: vector shapes and text, no picture.
 * `notes` says what could not be written as it is (see svgPdf.ts).
 */
export async function chartToPdf(chart: Chart, table: DataTable, fit?: FitSettings): Promise<{ blob: Blob; notes: string[] }> {
  const { bytes, notes } = await svgToPdf(chartToSvgString(chart, table, fit), { title: chart.name });
  return { blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }), notes };
}
