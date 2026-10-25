import { describe, expect, it } from 'vitest';
import { exportPixels, fitsCanvas, withPngDpi } from './pngDpi';

/** A minimal valid PNG signature and IHDR, then IEND (the pixels do not matter to the chunk handling). */
function tinyPng(extra: Uint8Array[] = []): Uint8Array {
  const chunk = (type: string, data: number[]) => {
    const out = new Uint8Array(12 + data.length);
    new DataView(out.buffer).setUint32(0, data.length);
    out.set([...type].map((c) => c.charCodeAt(0)), 4);
    out.set(data, 8);
    return out;
  };
  const ihdr = chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]);
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), ihdr, ...extra, chunk('IEND', [])];
  const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    all.set(p, at);
    at += p.length;
  }
  return all;
}

const types = (png: Uint8Array): string[] => {
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const out: string[] = [];
  for (let pos = 8; pos + 12 <= png.length; pos += 12 + dv.getUint32(pos)) out.push(String.fromCharCode(...png.subarray(pos + 4, pos + 8)));
  return out;
};

describe('PNG resolution', () => {
  it('counts the pixels at a resolution: 96 dpi is the chart size', () => {
    expect(exportPixels({ widthPx: 1024, heightPx: 768 }, 96)).toEqual({ width: 1024, height: 768 });
    expect(exportPixels({ widthPx: 1024, heightPx: 768 }, 300)).toEqual({ width: 3200, height: 2400 });
    expect(exportPixels({ widthPx: 1, heightPx: 1 }, 96)).toEqual({ width: 1, height: 1 });
  });
  it('refuses sizes a canvas cannot make', () => {
    expect(fitsCanvas(16000, 12000)).toBe(true);
    expect(fitsCanvas(16001, 100)).toBe(false);
    expect(fitsCanvas(15000, 15000)).toBe(false);
  });
  it('writes the resolution as a pHYs chunk right after IHDR, in pixels per metre', () => {
    const out = withPngDpi(tinyPng(), 300);
    expect(types(out)).toEqual(['IHDR', 'pHYs', 'IEND']);
    const dv = new DataView(out.buffer, out.byteOffset);
    const at = 8 + 25;
    expect(dv.getUint32(at)).toBe(9);
    expect(dv.getUint32(at + 8)).toBe(11811);
    expect(dv.getUint32(at + 12)).toBe(11811);
    expect(out[at + 16]).toBe(1);
  });
  it('has the CRC every PNG with 72 dpi (2835 pixels per metre) carries: 0x009A9C18', () => {
    const out = withPngDpi(tinyPng(), 72);
    expect(new DataView(out.buffer, out.byteOffset).getUint32(8 + 25 + 17)).toBe(0x009a9c18);
  });
  it('replaces a resolution the file already has, and leaves other chunks', () => {
    const old = new Uint8Array(21);
    new DataView(old.buffer).setUint32(0, 9);
    old.set([0x70, 0x48, 0x59, 0x73], 4);
    const out = withPngDpi(tinyPng([old]), 150);
    expect(types(out)).toEqual(['IHDR', 'pHYs', 'IEND']);
  });
  it('returns what is not a PNG as it is', () => {
    const junk = new Uint8Array([1, 2, 3]);
    expect(withPngDpi(junk, 300)).toBe(junk);
  });
});
