import type { Annotation, Chart, Drawing } from '../../model/types';
import { n2 } from '../../model/units';
import { hasMarkup } from '../../util/richText';
import { annotationElements } from '../shared/scene/annotations';
import { drawingElements } from '../shared/scene/drawings';
import { prefixed, scopeRefs } from '../shared/scene/idPrefix';
import { richPieces } from '../shared/scene/richSvg';
import type { Scene } from '../shared/scene/scene';
import type { SceneElement } from '../shared/scene/sceneElement';
import type { ChartDrawing } from '../shared/scene/SceneChart';

/**
 * The SVG text of a scene, written without React: the writer of an export (a file, a picture, a PDF, a page of a layout). It writes what
 * <SceneChart editor={false}> and <SceneElements editor={false}> write, byte for byte (sceneMarkup.test.ts compares them on every chart
 * type), so the renderer behind them (react-dom/server, 180 kB) is not loaded for an export. The editor still draws with React.
 */

/** The escapes of React's server renderer, for a text and for an attribute value alike. */
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#x27;'));
}

type Attr = readonly [string, string | number | undefined];

/** ` name="value"` for each attribute that has a value, in order. */
function attrText(attrs: ReadonlyArray<Attr>): string {
  let out = '';
  for (const [name, value] of attrs) if (value !== undefined) out += ` ${name}="${escapeHtml(String(value))}"`;
  return out;
}

function nodeMarkup(node: SceneElement, prefix: string): string {
  // Only what an export shows: the editor's own marks (hit attributes, selection frames, glows) are not written.
  if (node.editorOnly || node.whenSelected !== undefined || node.whenAnnotationSelected !== undefined) return '';
  const attrs: Attr[] = (node.attrs ?? []).map(([name, value]) => [name, scopeRefs(prefix, value)] as const);
  if (node.id !== undefined) attrs.push(['id', prefixed(prefix, node.id)]);
  const open = `<${node.tag}${attrText(attrs)}>`;
  const close = `</${node.tag}>`;
  // A text with markup (subscripts, superscripts, Greek names) is written as pieces; text without it is written exactly as it was.
  if ((node.tag === 'text' || node.tag === 'tspan') && node.text !== undefined && hasMarkup(node.text)) {
    const pieces = richPieces(node.text).map((p) =>
      p.fontSize === undefined && p.dy === undefined ? escapeHtml(p.text) : `<tspan${attrText([['font-size', p.fontSize], ['dy', p.dy]])}>${escapeHtml(p.text)}</tspan>`,
    );
    return open + pieces.join('') + close;
  }
  if (node.text !== undefined) return open + escapeHtml(node.text) + close;
  return open + elementsMarkup(node.children ?? [], prefix) + close;
}

/** The elements in order (as <SceneElements editor={false}> writes them). `prefix` is the prefix of the ids the drawing makes. */
export function elementsMarkup(nodes: ReadonlyArray<SceneElement>, prefix = ''): string {
  let out = '';
  for (const n of nodes) out += nodeMarkup(n, prefix);
  return out;
}

/** The data layers of an XY scene (as <SceneSvg editor={false}> writes them). */
function sceneMarkup(scene: Scene, prefix: string): string {
  let out = '';
  for (const layer of scene.layers) {
    for (const p of layer.paths) {
      out += `<path${attrText([
        ['d', p.d],
        ['fill', scopeRefs(prefix, p.fill)],
        ['fill-opacity', p.fillOpacity],
        ['stroke', scopeRefs(prefix, p.stroke)],
        ['stroke-width', p.strokeWidth === 0 ? undefined : p.strokeWidth],
        ['stroke-opacity', p.strokeOpacity],
        ['stroke-dasharray', p.dashArray],
        ['stroke-linecap', p.lineCap],
        ['stroke-linejoin', p.lineJoin],
        ['id', prefixed(prefix, p.id)],
      ])}></path>`;
    }
    if (layer.elements) out += elementsMarkup(layer.elements, prefix);
  }
  return out;
}

/** The drawing of a chart as an <svg> (as <SceneChart> without an editor writes it). */
export function chartMarkup(chart: Chart, drawing: ChartDrawing, cssWidth: string, cssHeight: string, prefix = ''): string {
  const { widthPt: W, heightPt: H } = drawing;
  let body = '';
  for (const s of drawing.sections) {
    if ('nodes' in s) body += elementsMarkup(s.nodes, prefix);
    else if ('xyData' in s) body += `<g${attrText([['clip-path', scopeRefs(prefix, 'url(#plot-clip)')]])}>${sceneMarkup(s.xyData, prefix)}</g>`;
    else body += elementsMarkup([...drawingElements(s.drawings ?? ([] as Drawing[]), W, H, s.place, chart.fontFamily, undefined), ...annotationElements(s.annotations as ReadonlyArray<Annotation>, W, H, undefined, s.place, chart.fontFamily)], prefix);
  }
  const head = attrText([
    ['xmlns', 'http://www.w3.org/2000/svg'],
    ['width', cssWidth],
    ['height', cssHeight],
    ['viewBox', `0 0 ${n2(W)} ${n2(H)}`],
    ['font-family', chart.fontFamily],
    ['style', `background:${chart.pageColor ?? 'transparent'}`],
  ]);
  return `<svg${head}>${body}</svg>`;
}

/** Text made safe to write inside an SVG element or a double-quoted attribute. */
export const escapeXml = (t: string): string => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Gives every id in a drawing a prefix, so drawings placed in one page cannot take each other's clip paths and patterns; the references follow. */
export function prefixIds(markup: string, prefix: string): string {
  const ids = new Set<string>();
  for (const m of markup.matchAll(/ id="([^"]+)"/g)) ids.add(m[1]);
  if (ids.size === 0) return markup;
  // One pass over the markup: an id attribute, a url(#id) or an href="#id" is rewritten only when the id was collected above.
  return markup.replace(/ id="([^"]+)"|url\(#([^)]*)\)|href="#([^"]*)"/g, (whole, idAttr?: string, urlRef?: string, hrefRef?: string) => {
    if (idAttr !== undefined) return ` id="${prefix}${idAttr}"`;
    if (urlRef !== undefined) return ids.has(urlRef) ? `url(#${prefix}${urlRef})` : whole;
    return hrefRef !== undefined && ids.has(hrefRef) ? `href="#${prefix}${hrefRef}"` : whole;
  });
}
