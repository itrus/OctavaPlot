import { renderToStaticMarkup } from 'react-dom/server';
import { prepareChartInput } from '../../model/table/preparedChart';
import { arrangeLayout, panelLabel, type Arranged, type LegendBand, type NaturalSize } from '../../model/project/layout';
import type { Chart, Layout, Project } from '../../model/types';
import { chartPx2Pt, n2 } from '../../model/units';
import { plainText } from '../../util/richText';
import { type AnyModel, buildAnyModelCached, ChartCanvas, chartTexts, drawingOf } from '../anyModel';
import { SvgIdPrefix } from '../shared/scene/idPrefix';
import { el } from '../shared/scene/sceneElement';
import { SceneElements } from '../shared/scene/SceneElements';
import { richPieces } from '../shared/scene/richSvg';
import { layoutMasterLegend, legendEntriesOf, mergeLegendEntries, type LegendEntry, type MasterLegendLayout } from './masterLegend';
import { buildPdf, rgbaToFlateRgb } from './pdf';
import { canvasToPngBlob } from './pngDpi';
import { prefixIds } from './prefixIds';

/**
 * A layout page as SVG: the page, an optional title, and each graph drawn by the same renderer as the editor and the graph
 * export (nested <svg>, scaled by one factor so that equal factors give equal fonts and lines), with its panel label.
 * The preview of the Layouts page and every export come from this one function, so they cannot differ.
 */
const escapeXml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface LayoutDrawing {
  svg: string;
  arranged: Arranged;
  widthPt: number;
  heightPt: number;
  /** Notes about the page: a graph that does not fit its panel at the chosen percentage, and the warnings of each graph, prefixed by panel. */
  notices: string[];
}

/** A text, with subscripts, superscripts and Greek names (see util/richText.ts) written as the graphs write them: tspans with a size and a shift. */
function textElement(attrs: string, source: string): string {
  const pieces = richPieces(source).map((p) => (p.fontSize === undefined && p.dy === undefined ? escapeXml(p.text) : `<tspan${p.fontSize !== undefined ? ` font-size="${p.fontSize}"` : ''}${p.dy !== undefined ? ` dy="${p.dy}"` : ''}>${escapeXml(p.text)}</tspan>`));
  return `<text ${attrs}>${pieces.join('')}</text>`;
}

/** The graphs of a page without their legends are the same graphs with the legend switched off; one copy for each, so that its model is cached. */
const withoutLegend = new WeakMap<Chart, Chart>();
function legendOff(chart: Chart): Chart {
  if (!chart.legend.visible) return chart;
  let copy = withoutLegend.get(chart);
  if (!copy) withoutLegend.set(chart, (copy = { ...chart, legend: { ...chart.legend, visible: false } }));
  return copy;
}

/** What a panel of a page is drawn from: the graph as drawn on the page (without its legend when the page has a master legend that replaces it), its model, and its legend entries when the page has a master legend. */
interface Panel {
  chart: Chart;
  drawn: Chart;
  any: AnyModel;
  entries: LegendEntry[];
}

function panelsOf(layout: Layout, project: Project): Array<Panel | null> {
  return layout.panels.map((id, i) => {
    const chart = id === null ? undefined : project.charts.find((c) => c.id === id);
    const prepared = chart && prepareChartInput(project, chart);
    if (!chart || !prepared) return null;
    const drawn = layout.legend?.hideGraphLegends ? legendOff(chart) : chart;
    const any = buildAnyModelCached(drawn, prepared.table, prepared.fit);
    // The entries are those of the graph's own legend, so they come from the graph with it (and only when it shows one).
    const entries = layout.legend && chart.legend.visible ? legendEntriesOf(chart, drawingOf(chart, drawn === chart ? any : buildAnyModelCached(chart, prepared.table, prepared.fit)), i) : [];
    return { chart, drawn, any, entries };
  });
}

/** The master legend of a page set out at the page's text size, and the band it needs; null band when the page has none or no graph has a legend. */
function masterOf(layout: Layout, panels: ReadonlyArray<Panel | null>): { legend: MasterLegendLayout; band: LegendBand | null } {
  const empty = { legend: { items: [], widthPt: 0, heightPt: 0 }, band: null };
  const m = layout.legend;
  if (!m) return empty;
  const entries = mergeLegendEntries(panels.map((p) => p?.entries ?? []));
  const laid = layoutMasterLegend(entries, m.fontSizePt, m.position, arrangeLayout(layout, []).frame.content.w);
  return laid.items.length === 0 ? empty : { legend: laid, band: { position: m.position, sizePt: m.position === 'bottom' ? laid.heightPt : laid.widthPt } };
}

/**
 * The master legend as SVG: each entry is the key and name the graph drew, moved to its place and scaled to the page's text size.
 * The block is centred along the bottom band, or vertically in the band on the right. An entry keeps the ids of the graph it comes from, so its fill pattern is found.
 */
function masterLegendMarkup(laid: MasterLegendLayout, band: { x: number; y: number; w: number; h: number }, position: 'bottom' | 'right'): string {
  const x0 = position === 'bottom' ? band.x + Math.max(0, (band.w - laid.widthPt) / 2) : band.x;
  const y0 = position === 'bottom' ? band.y : band.y + Math.max(0, (band.h - laid.heightPt) / 2);
  const entries = laid.items.map((it) => {
    const e = it.entry;
    const move = `translate(${n2(x0 + it.x)} ${n2(y0 + it.y)}) scale(${Number(it.scale.toFixed(4))}) translate(${n2(-e.originX)} ${n2(-e.originY)})`;
    const markup = renderToStaticMarkup(
      <SvgIdPrefix.Provider value={`p${e.panel}-`}>
        <SceneElements nodes={[el('g', [['transform', move], ['font-family', e.fontFamily]], { children: e.nodes })]} editor={false} />
      </SvgIdPrefix.Provider>,
    );
    return markup;
  });
  return `<g id="master-legend">${entries.join('')}</g>`;
}

export function drawLayout(layout: Layout, project: Project, options: { metadata?: boolean } = {}): LayoutDrawing {
  const panels = panelsOf(layout, project);
  const sizes: NaturalSize[] = layout.panels.map((id) => {
    const c = id === null ? undefined : project.charts.find((x) => x.id === id);
    return c ? { widthPt: chartPx2Pt(c.widthPx), heightPt: chartPx2Pt(c.heightPx) } : null;
  });
  const master = masterOf(layout, panels);
  const arranged = arrangeLayout(layout, sizes, master.band);
  const { frame, placements } = arranged;
  const notices: string[] = [];
  if (layout.legend && master.band === null) notices.push('The master legend is empty: none of the graphs on the page shows a legend.');
  const parts: string[] = [];
  placements.forEach((pl, i) => {
    const panel = panels[i];
    const chart = panel?.chart;
    if (chart && panel && pl.graph) {
      const { any } = panel;
      // The nested <svg> takes its size from width and height in user units (pt of the page); its viewBox is the graph's own.
      const markup = renderToStaticMarkup(<ChartCanvas chart={panel.drawn} any={any} cssWidth={n2(pl.graph.w)} cssHeight={n2(pl.graph.h)} />);
      const g = pl.graph;
      const inner = prefixIds(markup, `p${i}-`).replace('<svg ', `<svg x="${n2(g.x)}" y="${n2(g.y)}" `);
      // Clipped to the panel: a graph made larger than its panel by a chosen percentage does not run over its neighbours.
      const clipId = `layout-panel-${i}`;
      parts.push(`<clipPath id="${clipId}"><rect x="${n2(pl.rect.x)}" y="${n2(pl.rect.y)}" width="${n2(pl.rect.w)}" height="${n2(pl.rect.h)}"/></clipPath><g clip-path="url(#${clipId})">${inner}</g>`);
      if (g.w > pl.rect.w + 0.5 || g.h > pl.rect.h + 0.5) notices.push(`Graph ${pl.label || i + 1} is larger than its panel at ${Math.round(pl.factor * 100)}% and is cut off.`);
      // What the graph itself warns about in the editor (values left out of a log axis, rows not drawn, ...), named by panel.
      const who = `${pl.label || i + 1} (${chart.name})`;
      for (const w of new Set(any.model.warnings)) notices.push(`${who}: ${w}`);
    }
    if (pl.label !== '') {
      // The label sits at the top left corner of the graph (of the panel while it is empty), in the page's font, so that it stays
      // next to the graph however much room the panel has around it. It is kept inside the panel.
      const at = pl.graph ?? pl.rect;
      const x = Math.max(pl.rect.x, at.x);
      const y = Math.max(pl.rect.y, at.y);
      parts.push(textElement(`x="${n2(x)}" y="${n2(y + layout.labelSizePt * 0.8)}" font-size="${layout.labelSizePt}" font-weight="700" fill="#000000"`, pl.label));
    }
  });
  if (frame.title && layout.title.trim() !== '') {
    const t = frame.title;
    parts.unshift(textElement(`x="${n2(t.x + t.w / 2)}" y="${n2(t.y + t.h * 0.7)}" font-size="16" font-weight="700" text-anchor="middle" fill="#000000"`, layout.title));
  }
  if (frame.legend && master.legend.items.length > 0) parts.push(masterLegendMarkup(master.legend, frame.legend, layout.legend!.position));
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
  return canvasToPngBlob(canvas, dpi);
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

/** The texts of a page with the font each is written in, for the check of characters: the title and the panel labels in the page's font, each graph's texts in its own, and the master legend's names in the font of the graph they come from. */
export interface TextGroup {
  fontFamily: string;
  texts: string[];
}

export function layoutTextGroups(layout: Layout, project: Project, pageFont: string): TextGroup[] {
  const groups = new Map<string, string[]>();
  const add = (fontFamily: string, texts: readonly string[]) => {
    if (texts.length > 0) groups.set(fontFamily, [...(groups.get(fontFamily) ?? []), ...texts]);
  };
  const page: string[] = layout.panels.map((_, i) => panelLabel(layout.labelStyle, i)).filter((t) => t !== '');
  if (layout.showTitle && layout.title.trim() !== '') page.unshift(plainText(layout.title));
  add(pageFont, page);
  const panels = panelsOf(layout, project);
  panels.forEach((p) => p && add(p.chart.fontFamily, chartTexts(p.drawn, p.any)));
  for (const e of mergeLegendEntries(panels.map((p) => p?.entries ?? []))) add(e.fontFamily, [plainText(e.label)]);
  return [...groups].map(([fontFamily, texts]) => ({ fontFamily, texts }));
}
