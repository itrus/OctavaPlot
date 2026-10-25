/** The pixels of a chart exported at a resolution: 96 dpi is the chart's own size in CSS pixels (1 px = 0.75 pt). */
export const exportPixels = (chart: { widthPx: number; heightPx: number }, dpi: number): { width: number; height: number } => ({
  width: Math.max(1, Math.round((chart.widthPx * dpi) / 96)),
  height: Math.max(1, Math.round((chart.heightPx * dpi) / 96)),
});

/** Browsers limit the size of a canvas; a size above these limits fails or comes out blank. */
export const fitsCanvas = (width: number, height: number): boolean => Math.max(width, height) <= 16000 && width * height <= 200_000_000;

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

/**
 * The PNG with its resolution written in (a pHYs chunk, pixels per metre), so that another program places it at its real size:
 * the pixels are not changed. A file that is not a PNG with an IHDR first is returned as it is.
 */
export function withPngDpi(png: Uint8Array, dpi: number): Uint8Array {
  const ihdrEnd = 8 + 4 + 4 + 13 + 4;
  const isPng = png.length >= ihdrEnd && PNG_SIGNATURE.every((b, i) => png[i] === b) && String.fromCharCode(png[12], png[13], png[14], png[15]) === 'IHDR';
  if (!isPng) return png;
  const perMetre = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(4 + 4 + 9 + 4);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  view.setUint32(8, perMetre);
  view.setUint32(12, perMetre);
  chunk[16] = 1; // unit: metre
  view.setUint32(17, crc32(chunk.subarray(4, 17)));
  // Ours goes straight after IHDR; a pHYs the file already has is left out.
  const parts: Uint8Array[] = [png.subarray(0, ihdrEnd), chunk];
  let pos = ihdrEnd;
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  while (pos + 12 <= png.length) {
    const len = dv.getUint32(pos);
    const type = String.fromCharCode(png[pos + 4], png[pos + 5], png[pos + 6], png[pos + 7]);
    const end = pos + 12 + len;
    if (type !== 'pHYs') parts.push(png.subarray(pos, end));
    pos = end;
  }
  const result = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    result.set(p, at);
    at += p.length;
  }
  return result;
}
