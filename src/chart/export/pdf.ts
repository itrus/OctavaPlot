/**
 * The PDF file itself. There is no PDF library in OctavaPlot: the file is written here, as the few objects a one-page drawing needs
 * (catalog, page tree, page, the content stream, the standard fonts it names, the transparencies it uses, the document information).
 * What goes in the content stream is made by svgPdf.ts from the SVG of a graph or a page.
 */
const encoder = new TextEncoder();

/** A font of the file: the name the content stream uses for it, its standard name, and whether text is written in WinAnsi (the Symbol font has its own encoding). */
export interface PdfFont {
  name: string;
  base: string;
  winAnsi: boolean;
}

/** A transparency of the file: the name the content stream uses, and the opacity of fills and of strokes. */
export interface PdfAlpha {
  name: string;
  fill: number;
  stroke: number;
}

/** The bytes of a PDF, zlib-compressed with Flate when the browser can (every current one can), else as they are. */
export async function deflate(bytes: Uint8Array): Promise<{ data: Uint8Array; compressed: boolean }> {
  if (typeof CompressionStream === 'undefined') return { data: bytes, compressed: false };
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'));
  return { data: new Uint8Array(await new Response(stream).arrayBuffer()), compressed: true };
}

/**
 * A PDF text string (for the document information): printable ASCII as a literal string, anything else as UTF-16BE with
 * its byte-order mark in hex, so a title such as "Überleben" reads as itself in a viewer. Empty for an empty text.
 */
export function pdfTextString(text: string): string {
  if (text === '') return '';
  if (/^[\x20-\x7e]*$/.test(text)) return `(${text.replace(/([\\()])/g, '\\$1')})`;
  let hex = 'FEFF';
  for (let i = 0; i < text.length; i++) hex += text.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0');
  return `<${hex}>`;
}

/** The bytes of a one-page PDF of `widthPt` × `heightPt` with this content stream (compressed or not) and these resources. */
export function buildVectorPdf(options: { widthPt: number; heightPt: number; content: Uint8Array; compressed: boolean; fonts: readonly PdfFont[]; alphas: readonly PdfAlpha[]; title?: string }): Uint8Array {
  const { widthPt, heightPt, content, compressed, fonts, alphas } = options;
  const num = (v: number) => String(Math.round(v * 100) / 100);
  const title = pdfTextString(options.title ?? '');
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (data: string | Uint8Array) => {
    const bytes = typeof data === 'string' ? encoder.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (n: number, dictionary: string, stream?: Uint8Array) => {
    offsets[n] = length;
    if (stream === undefined) {
      push(`${n} 0 obj\n${dictionary}\nendobj\n`);
      return;
    }
    push(`${n} 0 obj\n${dictionary.replace(/>>$/, `/Length ${stream.length}>>`)}\nstream\n`);
    push(stream);
    push('\nendstream\nendobj\n');
  };
  const FIRST_FONT = 6;
  const FIRST_ALPHA = FIRST_FONT + fonts.length;
  const count = FIRST_ALPHA + alphas.length;
  const fontEntries = fonts.map((f, i) => `/${f.name} ${FIRST_FONT + i} 0 R`).join('');
  const alphaEntries = alphas.map((a, i) => `/${a.name} ${FIRST_ALPHA + i} 0 R`).join('');
  const resources = `<</ProcSet[/PDF/Text]${fonts.length > 0 ? `/Font<<${fontEntries}>>` : ''}${alphas.length > 0 ? `/ExtGState<<${alphaEntries}>>` : ''}>>`;
  // The second line of the header holds four bytes above 127, which tells programs that the file is binary.
  push('%PDF-1.4\n');
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  object(1, '<</Type/Catalog/Pages 2 0 R>>');
  object(2, '<</Type/Pages/Kids[3 0 R]/Count 1>>');
  object(3, `<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${num(widthPt)} ${num(heightPt)}]/Resources${resources}/Contents 4 0 R>>`);
  object(4, `<<${compressed ? '/Filter/FlateDecode' : ''}>>`, content);
  object(5, `<</Producer(OctavaPlot)${title ? `/Title${title}` : ''}>>`);
  fonts.forEach((f, i) => object(FIRST_FONT + i, `<</Type/Font/Subtype/Type1/BaseFont/${f.base}${f.winAnsi ? '/Encoding/WinAnsiEncoding' : ''}>>`));
  alphas.forEach((a, i) => object(FIRST_ALPHA + i, `<</Type/ExtGState/ca ${a.fill}/CA ${a.stroke}>>`));
  const xref = length;
  push(`xref\n0 ${count}\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`);
  push(`trailer\n<</Size ${count}/Root 1 0 R/Info 5 0 R>>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(length);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
