import { renderToStaticMarkup } from 'react-dom/server';
import { analysesOf } from '../model/analysis';
import { resolveFit } from '../model/fitOptions';
import { arrangeLayout, type Arranged, type NaturalSize } from '../model/layout';
import type { Layout, Project } from '../model/types';
import { chartPx2Pt, n2 } from '../model/units';
import { buildAnyModelCached, ChartCanvas } from './anyModel';
import { buildPdf, rgbaToFlateRgb } from './pdf';

/**
 * A layout page as SVG: the page, an optional title, and each graph drawn by the same renderer as the editor and the graph
 * export (nested <svg>, scaled by one factor so that equal factors give equal fonts and lines), with its panel label.
 * The preview of the Layouts page and every export come from this one function, so they cannot differ.
 */
const escapeXml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Gives every id in a drawing a prefix, so graphs placed on one page cannot take each other's clip paths and patterns. */
function prefixIds(markup: string, prefix: string): string {
  const ids = new Set([...markup.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
  let out = markup;
  for (const id of ids) {
    out = out.split(` id="${id}"`).join(` id="${prefix}${id}"`).split(`url(#${id})`).join(`url(#${prefix}${id})`).split(`href="#${id}"`).join(`href="#${prefix}${id}"`);
  }
  return out;
}

export interface LayoutDrawing {
  svg: string;
  arranged: Arranged;
  widthPt: number;
  heightPt: number;
  /** Notes about the page: a graph that does not fit its panel at the chosen percentage, and the like. */
  notices: string[];
}

export function drawLayout(layout: Layout, project: Project, options: { metadata?: boolean } = {}): LayoutDrawing {
  const sizes: NaturalSize[] = layout.panels.map((id) => {
    const c = id === null ? undefined : project.charts.find((x) => x.id === id);
    return c ? { widthPt: chartPx2Pt(c.widthPx), heightPt: chartPx2Pt(c.heightPx) } : null;
  });
  const arranged = arrangeLayout(layout, sizes);
  const { frame, placements } = arranged;
  const notices: string[] = [];
  const parts: string[] = [];
  placements.forEach((pl, i) => {
    const chart = layout.panels[i] === null ? undefined : project.charts.find((c) => c.id === layout.panels[i]);
    if (chart && pl.graph) {
      const table = project.dataTables.find((t) => t.id === chart.dataTableId);
      if (table) {
        const curve = resolveFit(chart.fit, analysesOf(project), table.id);
        const any = buildAnyModelCached(chart, table, curve);
        // The nested <svg> takes its size from width and height in user units (pt of the page); its viewBox is the graph's own.
        const markup = renderToStaticMarkup(<ChartCanvas chart={chart} any={any} cssWidth={n2(pl.graph.w)} cssHeight={n2(pl.graph.h)} />);
        const g = pl.graph;
        const inner = prefixIds(markup, `p${i}-`).replace('<svg ', `<svg x="${n2(g.x)}" y="${n2(g.y)}" `);
        // Clipped to the panel: a graph made larger than its panel by a chosen percentage does not run over its neighbours.
        const clipId = `layout-panel-${i}`;
        parts.push(`<clipPath id="${clipId}"><rect x="${n2(pl.rect.x)}" y="${n2(pl.rect.y)}" width="${n2(pl.rect.w)}" height="${n2(pl.rect.h)}"/></clipPath><g clip-path="url(#${clipId})">${inner}</g>`);
        if (g.w > pl.rect.w + 0.5 || g.h > pl.rect.h + 0.5) notices.push(`Graph ${pl.label || i + 1} is larger than its panel at ${Math.round(pl.factor * 100)}% and is cut off.`);
      }
    }
    if (pl.label !== '') {
      // The label sits at the top left corner of the graph (of the panel while it is empty), in the page's font, so that it stays
      // next to the graph however much room the panel has around it. It is kept inside the panel.
      const at = pl.graph ?? pl.rect;
      const x = Math.max(pl.rect.x, at.x);
      const y = Math.max(pl.rect.y, at.y);
      parts.push(`<text x="${n2(x)}" y="${n2(y + layout.labelSizePt * 0.8)}" font-size="${layout.labelSizePt}" font-weight="700" fill="#000000">${escapeXml(pl.label)}</text>`);
    }
  });
  if (frame.title && layout.title.trim() !== '') {
    const t = frame.title;
    parts.unshift(`<text x="${n2(t.x + t.w / 2)}" y="${n2(t.y + t.h * 0.7)}" font-size="16" font-weight="700" text-anchor="middle" fill="#000000">${escapeXml(layout.title)}</text>`);
  }
  const mm = { w: n2((frame.widthPt * 25.4) / 72), h: n2((frame.heightPt * 25.4) / 72) };
  const head = options.metadata ? `<title>${escapeXml(layout.name)}</title>` : '';
  const background = layout.background ? `<rect x="0" y="0" width="${n2(frame.widthPt)}" height="${n2(frame.heightPt)}" fill="${layout.background}"/>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${mm.w}mm" height="${mm.h}mm" viewBox="0 0 ${n2(frame.widthPt)} ${n2(frame.heightPt)}" font-family="Arial, Helvetica, sans-serif">${head}${background}${parts.join('')}</svg>`;
  return { svg, arranged, widthPt: frame.widthPt, heightPt: frame.heightPt, notices };
}

export function layoutToSvgString(layout: Layout, project: Project): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${drawLayout(layout, project, { metadata: true }).svg}\n`;
}

/** PNG pixels of an A4 page at a resolution; checked against what a browser canvas can hold. */
export function layoutPngSize(layout: Layout, dpi: number): { width: number; height: number } {
  const { frame } = arrangeLayout(layout, []);
  return { width: Math.round((frame.widthPt / 72) * dpi), height: Math.round((frame.heightPt / 72) * dpi) };
}

/** The page drawn on a canvas at a resolution (a transparent page stays transparent). */
async function layoutToCanvas(layout: Layout, project: Project, dpi: number): Promise<HTMLCanvasElement> {
  const { width, height } = layoutPngSize(layout, dpi);
  const svg = layoutToSvgString(layout, project);
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
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
}

export async function layoutToPngBlob(layout: Layout, project: Project, dpi: number): Promise<Blob> {
  const canvas = await layoutToCanvas(layout, project, dpi);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed.'))), 'image/png'));
}

/** A one-page PDF of the page, at A4 size, holding the picture at a resolution (see pdf.ts). A transparent page is white. */
export async function layoutToPdfBlob(layout: Layout, project: Project, dpi: number): Promise<Blob> {
  const canvas = await layoutToCanvas(layout, project, dpi);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context is unavailable.');
  const flateRgb = await rgbaToFlateRgb(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
  const { frame } = arrangeLayout(layout, []);
  return new Blob([buildPdf({ widthPt: frame.widthPt, heightPt: frame.heightPt, pxWidth: canvas.width, pxHeight: canvas.height, flateRgb, title: layout.name }) as BlobPart], { type: 'application/pdf' });
}
