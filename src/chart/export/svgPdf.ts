import { measureText } from '../shared/parts/text';
import { buildVectorPdf, deflate, type PdfAlpha, type PdfFont } from './pdf';

/**
 * A graph or a page as a vector PDF. The drawing of every export is an SVG made by the one renderer of the scene (the shapes the
 * screen, the SVG and the PNG are made from); this writes that SVG as PDF drawing operators: paths, rectangles and circles as
 * paths, clips, transforms, opacities and dashes as they are, and text as text. Only what the exports write is read: <svg>
 * (also nested, for the graphs of a page), <g>, <path>, <rect>, <circle>, <ellipse>, <line>, <polyline>, <polygon>, <text>, <tspan> and
 * <clipPath>; anything else is left out and said in the notes.
 *
 * Text is written with the standard fonts every PDF reader has (Helvetica, Times, Courier, and Symbol for Greek letters and
 * mathematical signs), chosen from the font of the graph; they are not embedded, which keeps a file small and licence-free. A character
 * none of them has is written as "?" and named in the notes.
 */

type Matrix = [number, number, number, number, number, number];
type Attrs = Record<string, string>;
interface XNode {
  tag: string;
  attrs: Attrs;
  children: Array<XNode | string>;
}

// ---------------------------------------------------------------- reading the SVG

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s: string): string => s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, (m, e: string) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTITIES[e] ?? m));

/** The element tree of the markup the renderer writes (well formed, double-quoted attributes). */
export function parseXml(source: string): XNode {
  const root: XNode = { tag: '#root', attrs: {}, children: [] };
  const stack: XNode[] = [root];
  const token = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<\/([\w:-]+)\s*>|<([\w:-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  for (const m of source.matchAll(token)) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) top.children.push(m[1]);
    else if (m[2] !== undefined) {
      if (stack.length > 1) stack.pop();
    } else if (m[3] !== undefined) {
      const attrs: Attrs = {};
      for (const a of m[4].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = decode(a[2] ?? a[3]);
      const node: XNode = { tag: m[3], attrs, children: [] };
      top.children.push(node);
      if (m[5] !== '/') stack.push(node);
    } else if (m[6] !== undefined) top.children.push(decode(m[6]));
  }
  const first = root.children.find((c): c is XNode => typeof c !== 'string');
  if (!first) throw new Error('There is no drawing to write.');
  return first;
}

// ---------------------------------------------------------------- numbers, matrices, colours

const fmt = (v: number): string => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const mul = (A: Matrix, B: Matrix): Matrix => [
  A[0] * B[0] + A[2] * B[1],
  A[1] * B[0] + A[3] * B[1],
  A[0] * B[2] + A[2] * B[3],
  A[1] * B[2] + A[3] * B[3],
  A[0] * B[4] + A[2] * B[5] + A[4],
  A[1] * B[4] + A[3] * B[5] + A[5],
];
const isIdentity = (m: Matrix): boolean => m.every((v, i) => Math.abs(v - IDENTITY[i]) < 1e-12);

/** The numbers of a list ("8 6", "8,6"). */
const numbers = (s: string | undefined): number[] => (s ?? '').split(/[\s,]+/).filter((x) => x !== '').map(Number).filter((n) => Number.isFinite(n));

/** A transform attribute as one matrix: a list of matrix, translate, scale, rotate, skewX and skewY, the first one outermost. */
export function parseTransform(value: string | undefined): Matrix {
  let out = IDENTITY;
  for (const m of (value ?? '').matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g)) {
    const n = numbers(m[2]);
    let t: Matrix = IDENTITY;
    if (m[1] === 'matrix' && n.length === 6) t = n as Matrix;
    else if (m[1] === 'translate') t = [1, 0, 0, 1, n[0] ?? 0, n[1] ?? 0];
    else if (m[1] === 'scale') t = [n[0] ?? 1, 0, 0, n[1] ?? n[0] ?? 1, 0, 0];
    else if (m[1] === 'rotate') {
      const a = ((n[0] ?? 0) * Math.PI) / 180;
      const [cos, sin] = [Math.cos(a), Math.sin(a)];
      const [cx, cy] = [n[1] ?? 0, n[2] ?? 0];
      t = [cos, sin, -sin, cos, cx - cos * cx + sin * cy, cy - sin * cx - cos * cy];
    } else if (m[1] === 'skewX') t = [1, 0, Math.tan(((n[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
    else if (m[1] === 'skewY') t = [1, Math.tan(((n[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
    out = mul(out, t);
  }
  return out;
}

const NAMED: Record<string, string> = { black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', gray: '#808080', grey: '#808080', yellow: '#ffff00', orange: '#ffa500', purple: '#800080' };

/** A colour as the PDF's three numbers ("0.2 0.4 1"); null for none and transparent; undefined for what cannot be written (a pattern, a gradient). */
export function parseColour(value: string | undefined, current: string | null): string | null | undefined {
  if (value === undefined) return current;
  const v = value.trim().toLowerCase();
  if (v === 'none' || v === 'transparent') return null;
  if (v === 'currentcolor') return '0 0 0';
  if (v.startsWith('url(')) return undefined;
  const text = NAMED[v] ?? v;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(text);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1];
    return [0, 2, 4].map((i) => fmt(parseInt(h.slice(i, i + 2), 16) / 255)).join(' ');
  }
  const rgb = /^rgba?\(([^)]*)\)/.exec(v);
  if (rgb) {
    const parts = rgb[1].split(/[\s,/]+/).filter((x) => x !== '');
    return parts.slice(0, 3).map((x) => fmt((x.endsWith('%') ? (parseFloat(x) / 100) * 255 : parseFloat(x)) / 255)).join(' ');
  }
  return undefined;
}

// ---------------------------------------------------------------- paths

/** The number of cubic Béziers of an arc, the control points of each. */
function arcToCubics(x1: number, y1: number, rxIn: number, ryIn: number, degrees: number, large: boolean, sweep: boolean, x2: number, y2: number): number[][] {
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) return [[x1, y1, x2, y2, x2, y2]];
  const phi = (degrees * Math.PI) / 180;
  const [cos, sin] = [Math.cos(phi), Math.sin(phi)];
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const sign = large === sweep ? -1 : 1;
  const numerator = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const denominator = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const factor = sign * Math.sqrt(Math.max(0, numerator / denominator));
  const cxp = (factor * rx * y1p) / ry;
  const cyp = (-factor * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let delta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  else if (sweep && delta < 0) delta += 2 * Math.PI;
  const pieces = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2) - 1e-9));
  const step = delta / pieces;
  const k = (4 / 3) * Math.tan(step / 4);
  const out: number[][] = [];
  const point = (t: number, ddx: number, ddy: number): [number, number] => [cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin + ddx, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos + ddy];
  const deriv = (t: number): [number, number] => [-rx * Math.sin(t) * cos - ry * Math.cos(t) * sin, -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos];
  for (let i = 0; i < pieces; i++) {
    const t1 = theta1 + i * step;
    const t2 = t1 + step;
    const [p1x, p1y] = point(t1, 0, 0);
    const [p2x, p2y] = i === pieces - 1 ? [x2, y2] : point(t2, 0, 0);
    const [d1x, d1y] = deriv(t1);
    const [d2x, d2y] = deriv(t2);
    out.push([p1x + k * d1x, p1y + k * d1y, p2x - k * d2x, p2y - k * d2y, p2x, p2y]);
  }
  return out;
}

const ARGS: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };

/** The path data of an SVG path as PDF path operators (moves, lines, curves, closes). */
export function pathOps(d: string): string {
  const out: string[] = [];
  const tokens = [...d.matchAll(/([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g)].map((m) => (m[1] !== undefined ? m[1] : Number(m[2])));
  let i = 0;
  let [x, y, sx, sy] = [0, 0, 0, 0];
  // The last control point, for the smooth commands.
  let [lcx, lcy, lastKind] = [0, 0, ''];
  let cmd = '';
  const take = (n: number): number[] | null => {
    const args: number[] = [];
    for (let k = 0; k < n; k++) {
      const t = tokens[i + k];
      if (typeof t !== 'number') return null;
      args.push(t);
    }
    i += n;
    return args;
  };
  const cubic = (a: number, b: number, c: number, e: number, f: number, g: number) => out.push(`${fmt(a)} ${fmt(b)} ${fmt(c)} ${fmt(e)} ${fmt(f)} ${fmt(g)} c`);
  while (i < tokens.length) {
    const t = tokens[i];
    if (typeof t === 'string') {
      cmd = t;
      i++;
      if (cmd === 'Z' || cmd === 'z') {
        out.push('h');
        [x, y] = [sx, sy];
        lastKind = '';
      }
      continue;
    }
    if (cmd === '' || cmd === 'Z' || cmd === 'z') {
      i++;
      continue;
    }
    const lower = cmd.toLowerCase();
    const rel = cmd !== cmd.toUpperCase();
    const args = take(ARGS[lower]);
    if (!args) break;
    const [ox, oy] = rel ? [x, y] : [0, 0];
    switch (lower) {
      case 'm':
        [x, y] = [args[0] + ox, args[1] + oy];
        [sx, sy] = [x, y];
        out.push(`${fmt(x)} ${fmt(y)} m`);
        // Further pairs after a move are lines.
        cmd = rel ? 'l' : 'L';
        lastKind = '';
        break;
      case 'l':
        [x, y] = [args[0] + ox, args[1] + oy];
        out.push(`${fmt(x)} ${fmt(y)} l`);
        lastKind = '';
        break;
      case 'h':
        x = args[0] + ox;
        out.push(`${fmt(x)} ${fmt(y)} l`);
        lastKind = '';
        break;
      case 'v':
        y = args[0] + oy;
        out.push(`${fmt(x)} ${fmt(y)} l`);
        lastKind = '';
        break;
      case 'c': {
        const [a, b, c, e, f, g] = [args[0] + ox, args[1] + oy, args[2] + ox, args[3] + oy, args[4] + ox, args[5] + oy];
        cubic(a, b, c, e, f, g);
        [lcx, lcy, lastKind] = [c, e, 'c'];
        [x, y] = [f, g];
        break;
      }
      case 's': {
        const [c1x, c1y] = lastKind === 'c' ? [2 * x - lcx, 2 * y - lcy] : [x, y];
        const [c, e, f, g] = [args[0] + ox, args[1] + oy, args[2] + ox, args[3] + oy];
        cubic(c1x, c1y, c, e, f, g);
        [lcx, lcy, lastKind] = [c, e, 'c'];
        [x, y] = [f, g];
        break;
      }
      case 'q': {
        const [qx, qy, f, g] = [args[0] + ox, args[1] + oy, args[2] + ox, args[3] + oy];
        cubic(x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), f + (2 / 3) * (qx - f), g + (2 / 3) * (qy - g), f, g);
        [lcx, lcy, lastKind] = [qx, qy, 'q'];
        [x, y] = [f, g];
        break;
      }
      case 't': {
        const [qx, qy] = lastKind === 'q' ? [2 * x - lcx, 2 * y - lcy] : [x, y];
        const [f, g] = [args[0] + ox, args[1] + oy];
        cubic(x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), f + (2 / 3) * (qx - f), g + (2 / 3) * (qy - g), f, g);
        [lcx, lcy, lastKind] = [qx, qy, 'q'];
        [x, y] = [f, g];
        break;
      }
      case 'a': {
        const [f, g] = [args[5] + ox, args[6] + oy];
        for (const c of arcToCubics(x, y, args[0], args[1], args[2], args[3] !== 0, args[4] !== 0, f, g)) cubic(c[0], c[1], c[2], c[3], c[4], c[5]);
        [x, y] = [f, g];
        lastKind = '';
        break;
      }
    }
  }
  return out.join('\n');
}

const KAPPA = 0.5522847498;

/** An ellipse as four curves. */
function ellipseOps(cx: number, cy: number, rx: number, ry: number): string {
  const [kx, ky] = [rx * KAPPA, ry * KAPPA];
  return [
    `${fmt(cx + rx)} ${fmt(cy)} m`,
    `${fmt(cx + rx)} ${fmt(cy + ky)} ${fmt(cx + kx)} ${fmt(cy + ry)} ${fmt(cx)} ${fmt(cy + ry)} c`,
    `${fmt(cx - kx)} ${fmt(cy + ry)} ${fmt(cx - rx)} ${fmt(cy + ky)} ${fmt(cx - rx)} ${fmt(cy)} c`,
    `${fmt(cx - rx)} ${fmt(cy - ky)} ${fmt(cx - kx)} ${fmt(cy - ry)} ${fmt(cx)} ${fmt(cy - ry)} c`,
    `${fmt(cx + kx)} ${fmt(cy - ry)} ${fmt(cx + rx)} ${fmt(cy - ky)} ${fmt(cx + rx)} ${fmt(cy)} c`,
    'h',
  ].join('\n');
}

/** A rectangle, with rounded corners when it has them. */
function rectOps(x: number, y: number, w: number, h: number, rxIn: number, ryIn: number): string {
  const rx = Math.min(rxIn, w / 2);
  const ry = Math.min(ryIn, h / 2);
  if (rx <= 0 || ry <= 0) return `${fmt(x)} ${fmt(y)} ${fmt(w)} ${fmt(h)} re`;
  const [kx, ky] = [rx * KAPPA, ry * KAPPA];
  return [
    `${fmt(x + rx)} ${fmt(y)} m`,
    `${fmt(x + w - rx)} ${fmt(y)} l`,
    `${fmt(x + w - rx + kx)} ${fmt(y)} ${fmt(x + w)} ${fmt(y + ry - ky)} ${fmt(x + w)} ${fmt(y + ry)} c`,
    `${fmt(x + w)} ${fmt(y + h - ry)} l`,
    `${fmt(x + w)} ${fmt(y + h - ry + ky)} ${fmt(x + w - rx + kx)} ${fmt(y + h)} ${fmt(x + w - rx)} ${fmt(y + h)} c`,
    `${fmt(x + rx)} ${fmt(y + h)} l`,
    `${fmt(x + rx - kx)} ${fmt(y + h)} ${fmt(x)} ${fmt(y + h - ry + ky)} ${fmt(x)} ${fmt(y + h - ry)} c`,
    `${fmt(x)} ${fmt(y + ry)} l`,
    `${fmt(x)} ${fmt(y + ry - ky)} ${fmt(x + rx - kx)} ${fmt(y)} ${fmt(x + rx)} ${fmt(y)} c`,
    'h',
  ].join('\n');
}

// ---------------------------------------------------------------- fonts and characters

/** What text is written in: a standard font family, and the width table of the font it stands for (the names a browser has for the same metrics). */
const FAMILIES = {
  sans: { names: ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique'], metric: 'Arial' },
  serif: { names: ['Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic'], metric: "'Times New Roman'" },
  mono: { names: ['Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique'], metric: "'Courier New'" },
} as const;
type FamilyKey = keyof typeof FAMILIES;

/** Which standard family a CSS font-family list stands for: the first name that says serif or mono, else sans-serif. */
export function familyOf(cssFamily: string): FamilyKey {
  const first = cssFamily.split(',')[0].replace(/['"]/g, '').trim().toLowerCase();
  if (/courier|mono|consolas|menlo/.test(first)) return 'mono';
  if (/times|georgia|garamond|palatino|cambria|^serif$/.test(first)) return 'serif';
  return 'sans';
}

/** The characters of the second half of the WinAnsi encoding (0x80 to 0x9F) that are not Latin-1. */
const CP1252: Record<number, number> = { 0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f };

/** The Symbol font's codes for Greek letters and the mathematical signs the rich text knows. */
const SYMBOL: Record<number, number> = (() => {
  const greek = 'ΑΒΧΔΕΦΓΗΙϑΚΛΜΝΟΠΘΡΣΤΥςΩΞΨΖ';
  const codes = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const map: Record<number, number> = {};
  [...greek].forEach((c, i) => (map[c.codePointAt(0)!] = codes.charCodeAt(i)));
  const lower = 'αβχδεφγηιϕκλμνοπθρστυϖωξψζ';
  [...lower].forEach((c, i) => (map[c.codePointAt(0)!] = codes.toLowerCase().charCodeAt(i)));
  Object.assign(map, { 0x03d1: 0x4a, 0x03c2: 0x56, 0x2212: 0x2d, 0x2264: 0xa3, 0x2265: 0xb3, 0x2260: 0xb9, 0x2248: 0xbb, 0x221e: 0xa5, 0x2202: 0xb6, 0x221a: 0xd6, 0x2211: 0xe5, 0x220f: 0xd5, 0x222b: 0xf2, 0x2261: 0xba, 0x221d: 0xb5, 0x2208: 0xce, 0x2205: 0xc6, 0x2190: 0xac, 0x2191: 0xad, 0x2192: 0xae, 0x2193: 0xaf, 0x2206: 0x44 });
  return map;
})();

/** One character: the WinAnsi code in the text font, the code in the Symbol font, or neither. */
function codeOf(ch: string): { winAnsi?: number; symbol?: number } {
  const c = ch.codePointAt(0)!;
  if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff)) return { winAnsi: c };
  if (CP1252[c] !== undefined) return { winAnsi: CP1252[c] };
  if (c === 0x09 || c === 0x0a || c === 0x0d) return { winAnsi: 0x20 };
  if (SYMBOL[c] !== undefined) return { symbol: SYMBOL[c] };
  return {};
}

/** A string of codes as a PDF string: parentheses and the backslash escaped, bytes outside printable ASCII in octal. */
const literal = (codes: number[]): string => `(${codes.map((c) => (c === 0x28 || c === 0x29 || c === 0x5c ? `\\${String.fromCharCode(c)}` : c < 0x20 || c > 0x7e ? `\\${c.toString(8).padStart(3, '0')}` : String.fromCharCode(c))).join('')})`;

// ---------------------------------------------------------------- the writer

interface Style {
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  cap: number;
  join: number;
  dash: number[];
  fillOpacity: number;
  strokeOpacity: number;
  opacity: number;
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  anchor: 'start' | 'middle' | 'end';
  evenOdd: boolean;
}

const ROOT_STYLE: Style = { fill: '0 0 0', stroke: null, strokeWidth: 1, cap: 0, join: 0, dash: [], fillOpacity: 1, strokeOpacity: 1, opacity: 1, fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 16, bold: false, italic: false, anchor: 'start', evenOdd: false };

/** The graphics state last written in the content stream, so that a setting is written only when it changes. */
interface Gfx {
  fill: string;
  stroke: string;
  line: string;
  alpha: string;
}

interface DrawingContent {
  widthPt: number;
  heightPt: number;
  content: string;
  fonts: PdfFont[];
  alphas: PdfAlpha[];
  /** What could not be written as it is: elements left out, characters replaced. */
  notes: string[];
}

/** The content stream of a drawing, and what it needs (the page size, the fonts, the transparencies). */
export function svgToContent(svg: string): DrawingContent {
  const root = parseXml(svg);
  if (root.tag !== 'svg') throw new Error('The drawing is not an SVG.');
  const vb = numbers(root.attrs.viewBox);
  const [minX, minY, widthPt, heightPt] = vb.length === 4 ? vb : [0, 0, parseFloat(root.attrs.width) || 595, parseFloat(root.attrs.height) || 842];
  const out: string[] = [];
  const fonts = new Map<string, PdfFont>();
  const alphas = new Map<string, PdfAlpha>();
  const skipped = new Map<string, number>();
  const missing = new Set<string>();
  let patterns = 0;

  // The clip paths of the drawing, by id.
  const clips = new Map<string, XNode>();
  const collect = (n: XNode) => {
    if (n.tag === 'clipPath' && n.attrs.id !== undefined) clips.set(n.attrs.id, n);
    for (const c of n.children) if (typeof c !== 'string') collect(c);
  };
  collect(root);

  let gfx: Gfx = { fill: '', stroke: '', line: '', alpha: '' };
  const saved: Gfx[] = [];
  const open = () => {
    out.push('q');
    saved.push({ ...gfx });
  };
  const close = () => {
    out.push('Q');
    gfx = saved.pop() ?? gfx;
  };

  const fontNamed = (base: string, winAnsi: boolean): string => {
    let f = fonts.get(base);
    if (!f) fonts.set(base, (f = { name: `F${fonts.size + 1}`, base, winAnsi }));
    return f.name;
  };
  const alphaNamed = (fill: number, stroke: number): string => {
    const key = `${fmt(fill)}/${fmt(stroke)}`;
    let a = alphas.get(key);
    if (!a) alphas.set(key, (a = { name: `GS${alphas.size + 1}`, fill: Number(fmt(fill)), stroke: Number(fmt(stroke)) }));
    return a.name;
  };
  const setAlpha = (fill: number, stroke: number) => {
    // Full opacity is the default state of the page; a state is written only when it differs from the last one written.
    const name = fill >= 0.9995 && stroke >= 0.9995 ? '' : alphaNamed(fill, stroke);
    if (gfx.alpha === name) return;
    out.push(`/${name === '' ? alphaNamed(1, 1) : name} gs`);
    gfx.alpha = name;
  };
  const setFill = (colour: string) => {
    if (gfx.fill !== colour) out.push(`${colour} rg`);
    gfx.fill = colour;
  };
  const setStroke = (s: Style) => {
    if (gfx.stroke !== s.stroke) out.push(`${s.stroke} RG`);
    gfx.stroke = s.stroke ?? '';
    const line = `${fmt(s.strokeWidth)} w ${s.cap} J ${s.join} j [${s.dash.map(fmt).join(' ')}] 0 d`;
    if (gfx.line !== line) out.push(line);
    gfx.line = line;
  };

  /** The style of an element: its parent's, with the attributes it sets. */
  const styleOf = (parent: Style, a: Attrs): Style => {
    const s: Style = { ...parent };
    const fill = parseColour(a.fill, s.fill);
    if (fill === undefined) patterns++;
    s.fill = fill === undefined ? null : fill;
    const stroke = parseColour(a.stroke, s.stroke);
    if (stroke === undefined) patterns++;
    s.stroke = stroke === undefined ? null : stroke;
    if (a['stroke-width'] !== undefined) s.strokeWidth = parseFloat(a['stroke-width']) || 0;
    if (a['stroke-linecap'] !== undefined) s.cap = a['stroke-linecap'] === 'round' ? 1 : a['stroke-linecap'] === 'square' ? 2 : 0;
    if (a['stroke-linejoin'] !== undefined) s.join = a['stroke-linejoin'] === 'round' ? 1 : a['stroke-linejoin'] === 'bevel' ? 2 : 0;
    if (a['stroke-dasharray'] !== undefined) {
      const d = a['stroke-dasharray'] === 'none' ? [] : numbers(a['stroke-dasharray']);
      s.dash = d.length > 0 && d.every((v) => v >= 0) && d.some((v) => v > 0) ? (d.length % 2 === 1 ? [...d, ...d] : d) : [];
    }
    if (a['fill-opacity'] !== undefined) s.fillOpacity = Math.min(1, Math.max(0, parseFloat(a['fill-opacity'])));
    if (a['stroke-opacity'] !== undefined) s.strokeOpacity = Math.min(1, Math.max(0, parseFloat(a['stroke-opacity'])));
    // A group's opacity is applied to each mark in it: exact unless marks of one group overlap.
    if (a.opacity !== undefined) s.opacity = parent.opacity * Math.min(1, Math.max(0, parseFloat(a.opacity)));
    if (a['font-family'] !== undefined) s.fontFamily = a['font-family'];
    if (a['font-size'] !== undefined) {
      const v = a['font-size'].trim();
      s.fontSize = v.endsWith('%') ? (parent.fontSize * parseFloat(v)) / 100 : v.endsWith('em') ? parent.fontSize * parseFloat(v) : parseFloat(v) || parent.fontSize;
    }
    if (a['font-weight'] !== undefined) s.bold = a['font-weight'] === 'bold' || Number(a['font-weight']) >= 600;
    if (a['font-style'] !== undefined) s.italic = a['font-style'] === 'italic' || a['font-style'] === 'oblique';
    if (a['text-anchor'] !== undefined) s.anchor = a['text-anchor'] === 'middle' ? 'middle' : a['text-anchor'] === 'end' ? 'end' : 'start';
    if (a['fill-rule'] !== undefined) s.evenOdd = a['fill-rule'] === 'evenodd';
    return s;
  };

  const skip = (what: string) => skipped.set(what, (skipped.get(what) ?? 0) + 1);
  const length = (v: string | undefined, fontSize: number): number => {
    if (v === undefined) return 0;
    const n = parseFloat(v);
    return Number.isFinite(n) ? (v.trim().endsWith('em') ? n * fontSize : n) : 0;
  };

  /** The operators of a shape element, or null when it is not one. */
  const shapeOps = (n: XNode): string | null => {
    const a = n.attrs;
    const f = (k: string) => parseFloat(a[k] ?? '0') || 0;
    switch (n.tag) {
      case 'path':
        return a.d ? pathOps(a.d) : null;
      case 'rect':
        return f('width') > 0 && f('height') > 0 ? rectOps(f('x'), f('y'), f('width'), f('height'), a.rx !== undefined ? f('rx') : f('ry'), a.ry !== undefined ? f('ry') : f('rx')) : null;
      case 'circle':
        return f('r') > 0 ? ellipseOps(f('cx'), f('cy'), f('r'), f('r')) : null;
      case 'ellipse':
        return f('rx') > 0 && f('ry') > 0 ? ellipseOps(f('cx'), f('cy'), f('rx'), f('ry')) : null;
      case 'line':
        return `${fmt(f('x1'))} ${fmt(f('y1'))} m ${fmt(f('x2'))} ${fmt(f('y2'))} l`;
      case 'polyline':
      case 'polygon': {
        const p = numbers(a.points);
        if (p.length < 4) return null;
        const pts = [];
        for (let i = 0; i + 1 < p.length; i += 2) pts.push(`${fmt(p[i])} ${fmt(p[i + 1])} ${i === 0 ? 'm' : 'l'}`);
        return pts.join(' ') + (n.tag === 'polygon' ? ' h' : '');
      }
      default:
        return null;
    }
  };

  const paint = (n: XNode, s: Style) => {
    const ops = shapeOps(n);
    if (ops === null) return;
    const fillOn = s.fill !== null && s.fillOpacity * s.opacity > 0 && n.tag !== 'line' && n.tag !== 'polyline';
    const strokeOn = s.stroke !== null && s.strokeWidth > 0 && s.strokeOpacity * s.opacity > 0;
    if (!fillOn && !strokeOn) return;
    setAlpha(fillOn ? s.fillOpacity * s.opacity : 1, strokeOn ? s.strokeOpacity * s.opacity : 1);
    if (fillOn) setFill(s.fill!);
    if (strokeOn) setStroke(s);
    out.push(ops, fillOn && strokeOn ? (s.evenOdd ? 'B*' : 'B') : fillOn ? (s.evenOdd ? 'f*' : 'f') : 'S');
  };

  /** One line of text: its position, and the runs of it (each in its own size, shift and colour). */
  interface Run {
    text: string;
    s: Style;
    /** How far the run stands above the baseline of its line, pt. */
    rise: number;
  }
  const drawText = (n: XNode, parent: Style) => {
    const base = styleOf(parent, n.attrs);
    const lines: Array<{ x: number; y: number; runs: Run[] }> = [];
    const startLine = (x: number, y: number) => lines.push({ x, y, runs: [] });
    const first = (v: string | undefined, d: number) => (v === undefined ? d : numbers(v)[0] ?? d);
    startLine(first(n.attrs.x, 0), first(n.attrs.y, 0) + length(n.attrs.dy, base.fontSize));
    const walk = (node: XNode, s: Style, shift: number): number => {
      let at = shift;
      for (const c of node.children) {
        const line = lines[lines.length - 1];
        if (typeof c === 'string') {
          const text = c.replace(/[\n\r\t]/g, ' ');
          if (text !== '') line.runs.push({ text, s, rise: -at });
        } else if (c.tag === 'tspan') {
          const cs = styleOf(s, c.attrs);
          if (c.attrs.x !== undefined || c.attrs.y !== undefined) {
            startLine(first(c.attrs.x, line.x), first(c.attrs.y, line.y) + length(c.attrs.dy, cs.fontSize));
            at = 0;
          } else at += length(c.attrs.dy, cs.fontSize);
          at = walk(c, cs, at);
        } else skip(`<${c.tag}> inside a text`);
      }
      return at;
    };
    walk(n, base, 0);
    for (const line of lines) {
      const runs = line.runs.filter((r) => r.s.fill !== null && r.s.fillOpacity * r.s.opacity > 0);
      if (runs.length === 0 || runs.every((r) => r.text.trim() === '')) continue;
      // The width of the line decides where it starts for text-anchor middle and end: measured in the font that is written.
      const width = runs.reduce((w, r) => {
        const family = FAMILIES[familyOf(r.s.fontFamily)];
        return w + measureText(r.text, r.s.fontSize, r.s.bold, r.s.italic, family.metric);
      }, 0);
      const x = line.x - (base.anchor === 'middle' ? width / 2 : base.anchor === 'end' ? width : 0);
      setAlpha(runs[0].s.fillOpacity * runs[0].s.opacity, 1);
      out.push('BT', `1 0 0 -1 ${fmt(x)} ${fmt(line.y)} Tm`);
      for (const r of runs) {
        const key = familyOf(r.s.fontFamily);
        const fontIndex = (r.s.italic ? 2 : 0) + (r.s.bold ? 1 : 0);
        out.push(`${r.s.fill} rg`);
        out.push(`${fmt(r.rise)} Ts`);
        // A run is cut where the character needs the other font.
        let current: 'main' | 'symbol' | null = null;
        let codes: number[] = [];
        const flush = () => {
          if (current === null || codes.length === 0) return;
          const name = current === 'symbol' ? fontNamed('Symbol', false) : fontNamed(FAMILIES[key].names[fontIndex], true);
          out.push(`/${name} ${fmt(r.s.fontSize)} Tf ${literal(codes)} Tj`);
          codes = [];
        };
        for (const ch of r.text) {
          const code = codeOf(ch);
          const kind = code.winAnsi !== undefined ? 'main' : code.symbol !== undefined ? 'symbol' : 'main';
          if (code.winAnsi === undefined && code.symbol === undefined) missing.add(ch);
          if (kind !== current) {
            flush();
            current = kind;
          }
          codes.push(code.winAnsi ?? code.symbol ?? 0x3f);
        }
        flush();
      }
      out.push('ET');
      // The fill colour of the text is the state afterwards.
      gfx.fill = '';
    }
  };

  /** Clip paths: the shapes of the clipPath the attribute names, as a path that clips. */
  const clipOps = (attr: string | undefined): string | null => {
    const id = attr === undefined ? undefined : /url\(#([^)]+)\)/.exec(attr)?.[1];
    if (id === undefined) return null;
    const node = clips.get(id);
    if (!node) return null;
    const ops = node.children.flatMap((c) => (typeof c === 'string' ? [] : [shapeOps(c)])).filter((o): o is string => o !== null);
    return ops.length > 0 ? `${ops.join('\n')}\nW n` : null;
  };

  const draw = (n: XNode, parent: Style) => {
    if (n.attrs.display === 'none' || n.attrs.visibility === 'hidden') return;
    switch (n.tag) {
      case 'defs':
      case 'clipPath':
      case 'title':
      case 'desc':
      case 'metadata':
        return;
      case 'g':
      case 'svg': {
        const s = styleOf(parent, n.attrs);
        let m = parseTransform(n.attrs.transform);
        let viewport: string | null = null;
        if (n.tag === 'svg') {
          // A nested svg is a viewport: placed at x, y, scaled from its viewBox to its width and height (kept in proportion), and clipped to it.
          const [x, y, w, h] = [parseFloat(n.attrs.x ?? '0') || 0, parseFloat(n.attrs.y ?? '0') || 0, parseFloat(n.attrs.width ?? '0') || 0, parseFloat(n.attrs.height ?? '0') || 0];
          const box = numbers(n.attrs.viewBox);
          if (w > 0 && h > 0) {
            viewport = rectOps(x, y, w, h, 0, 0) + '\nW n';
            if (box.length === 4 && box[2] > 0 && box[3] > 0) {
              const k = Math.min(w / box[2], h / box[3]);
              m = mul(m, [k, 0, 0, k, x + (w - box[2] * k) / 2 - box[0] * k, y + (h - box[3] * k) / 2 - box[1] * k]);
            } else m = mul(m, [1, 0, 0, 1, x, y]);
          }
        }
        const clip = clipOps(n.attrs['clip-path']);
        const wrapped = !isIdentity(m) || clip !== null || viewport !== null;
        if (wrapped) {
          open();
          if (viewport !== null) out.push(viewport);
          if (!isIdentity(m)) out.push(`${m.map(fmt).join(' ')} cm`);
          if (clip !== null) out.push(clip);
        }
        for (const c of n.children) if (typeof c !== 'string') draw(c, s);
        if (wrapped) close();
        return;
      }
      case 'text': {
        const m = parseTransform(n.attrs.transform);
        const clip = clipOps(n.attrs['clip-path']);
        const wrapped = !isIdentity(m) || clip !== null;
        if (wrapped) {
          open();
          if (!isIdentity(m)) out.push(`${m.map(fmt).join(' ')} cm`);
          if (clip !== null) out.push(clip);
        }
        drawText(n, parent);
        if (wrapped) close();
        return;
      }
      default: {
        if (!['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon'].includes(n.tag)) return skip(`<${n.tag}>`);
        const s = styleOf(parent, n.attrs);
        const m = parseTransform(n.attrs.transform);
        const clip = clipOps(n.attrs['clip-path']);
        const wrapped = !isIdentity(m) || clip !== null;
        if (wrapped) {
          open();
          if (!isIdentity(m)) out.push(`${m.map(fmt).join(' ')} cm`);
          if (clip !== null) out.push(clip);
        }
        paint(n, s);
        if (wrapped) close();
      }
    }
  };

  // The page: y runs upward in a PDF, so the drawing is turned over once, at the top; text is turned back by its own matrix.
  out.push(`1 0 0 -1 ${fmt(-minX)} ${fmt(heightPt + minY)} cm`);
  const rootStyle = styleOf(ROOT_STYLE, root.attrs);
  const background = /background(?:-color)?\s*:\s*([^;]+)/.exec(root.attrs.style ?? '')?.[1];
  const backgroundColour = background === undefined ? null : parseColour(background.trim(), null);
  if (backgroundColour) {
    setFill(backgroundColour);
    out.push(`${fmt(minX)} ${fmt(minY)} ${fmt(widthPt)} ${fmt(heightPt)} re f`);
  }
  for (const c of root.children) if (typeof c !== 'string') draw(c, rootStyle);

  const notes: string[] = [];
  for (const [what, n] of skipped) notes.push(`${n === 1 ? 'One' : n} ${what} ${n === 1 ? 'was' : 'were'} left out of the PDF: it has no vector form here.`);
  if (patterns > 0) notes.push('A pattern or gradient fill was written without a fill.');
  if (missing.size > 0) notes.push(`The PDF's standard fonts have no ${[...missing].join(' ')}; written as "?".`);
  return { widthPt, heightPt, content: out.join('\n'), fonts: [...fonts.values()], alphas: [...alphas.values()], notes };
}

/** A drawing (the SVG of a graph or a page) as a PDF of the same size in pt, with the notes on what could not be written as it is. */
export async function svgToPdf(svg: string, options: { title?: string } = {}): Promise<{ bytes: Uint8Array; notes: string[] }> {
  const drawing = svgToContent(svg);
  const { data, compressed } = await deflate(new TextEncoder().encode(drawing.content));
  const bytes = buildVectorPdf({ widthPt: drawing.widthPt, heightPt: drawing.heightPt, content: data, compressed, fonts: drawing.fonts, alphas: drawing.alphas, ...(options.title !== undefined ? { title: options.title } : {}) });
  return { bytes, notes: drawing.notes };
}
