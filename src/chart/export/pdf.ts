/**
 * A one-page PDF holding a picture of the page. There is no PDF library in OctavaPlot: the file is written here, as the
 * five objects it needs (catalog, page tree, page, the content that draws the picture across the page, and the picture as
 * an RGB image compressed with Flate). The page has the size of the layout in pt, so it prints at its true size.
 */
const encoder = new TextEncoder();

/** The bytes of a PDF whose page is `widthPt` × `heightPt` and shows an RGB image of `pxWidth` × `pxHeight` (zlib-compressed). */
export function buildPdf(options: { widthPt: number; heightPt: number; pxWidth: number; pxHeight: number; flateRgb: Uint8Array; title?: string }): Uint8Array {
  const { widthPt, heightPt, pxWidth, pxHeight, flateRgb } = options;
  const num = (v: number) => String(Math.round(v * 100) / 100);
  const title = (options.title ?? '').replace(/[^\x20-\x7e]/g, '?').replace(/([\\()])/g, '\\$1');
  const content = `q ${num(widthPt)} 0 0 ${num(heightPt)} 0 0 cm /Im0 Do Q`;
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (data: string | Uint8Array) => {
    const bytes = typeof data === 'string' ? encoder.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (n: number, dictionary: string, stream?: Uint8Array | string) => {
    offsets[n] = length;
    if (stream === undefined) {
      push(`${n} 0 obj\n${dictionary}\nendobj\n`);
      return;
    }
    const bytes = typeof stream === 'string' ? encoder.encode(stream) : stream;
    push(`${n} 0 obj\n${dictionary.replace(/>>$/, `/Length ${bytes.length}>>`)}\nstream\n`);
    push(bytes);
    push('\nendstream\nendobj\n');
  };
  // The second line of the header holds four bytes above 127, which tells programs that the file is binary.
  push('%PDF-1.4\n');
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  object(1, '<</Type/Catalog/Pages 2 0 R>>');
  object(2, '<</Type/Pages/Kids[3 0 R]/Count 1>>');
  object(3, `<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${num(widthPt)} ${num(heightPt)}]/Resources<</XObject<</Im0 5 0 R>>>>/Contents 4 0 R>>`);
  object(4, '<<>>', content);
  object(5, `<</Type/XObject/Subtype/Image/Width ${pxWidth}/Height ${pxHeight}/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/FlateDecode>>`, flateRgb);
  object(6, `<</Producer(OctavaPlot)${title ? `/Title(${title})` : ''}>>`);
  const xref = length;
  push(`xref\n0 7\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`);
  push(`trailer\n<</Size 7/Root 1 0 R/Info 6 0 R>>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(length);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** RGBA pixels (as a canvas gives them) as RGB, with transparency shown as white, compressed with zlib (what Flate means in a PDF). */
export async function rgbaToFlateRgb(rgba: Uint8ClampedArray | Uint8Array): Promise<Uint8Array> {
  const pixels = rgba.length / 4;
  const rgb = new Uint8Array(pixels * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    const a = rgba[i + 3] / 255;
    rgb[j] = Math.round(rgba[i] * a + 255 * (1 - a));
    rgb[j + 1] = Math.round(rgba[i + 1] * a + 255 * (1 - a));
    rgb[j + 2] = Math.round(rgba[i + 2] * a + 255 * (1 - a));
  }
  const compressed = new Blob([rgb as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(compressed).arrayBuffer());
}
