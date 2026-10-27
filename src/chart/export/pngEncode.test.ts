import { describe, expect, it } from 'vitest';
import { canvasToPngBlob } from './pngDpi';

/** A signature, IHDR and IEND: enough PNG for the chunk handling (a node test has no canvas, so the canvas is a stand-in). */
function tinyPng(): Uint8Array {
  const chunk = (type: string, data: number[]) => {
    const out = new Uint8Array(12 + data.length);
    new DataView(out.buffer).setUint32(0, data.length);
    out.set([...type].map((c) => c.charCodeAt(0)), 4);
    out.set(data, 8);
    return out;
  };
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]), chunk('IEND', [])];
  const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    all.set(p, at);
    at += p.length;
  }
  return all;
}

const fakeCanvas = (bytes: Uint8Array) => ({ toBlob: (cb: (b: Blob | null) => void) => cb(new Blob([bytes as BlobPart], { type: 'image/png' })) }) as unknown as HTMLCanvasElement;

describe('canvasToPngBlob', () => {
  it.each([[96, 3780], [150, 5906], [300, 11811], [600, 23622]])('writes %i dpi as %i pixels per metre', async (dpi, perMetre) => {
    const blob = await canvasToPngBlob(fakeCanvas(tinyPng()), dpi);
    expect(blob.type).toBe('image/png');
    const out = new Uint8Array(await blob.arrayBuffer());
    const dv = new DataView(out.buffer);
    const at = 8 + 25;
    expect(String.fromCharCode(...out.subarray(at + 4, at + 8))).toBe('pHYs');
    expect(dv.getUint32(at + 8)).toBe(perMetre);
    expect(dv.getUint32(at + 12)).toBe(perMetre);
  });
  it('rejects when the canvas cannot encode', async () => {
    const none = { toBlob: (cb: (b: Blob | null) => void) => cb(null) } as unknown as HTMLCanvasElement;
    await expect(canvasToPngBlob(none, 96)).rejects.toThrow('PNG encoding failed.');
  });
});
