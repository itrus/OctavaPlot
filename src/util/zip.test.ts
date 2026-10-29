import { describe, expect, it } from 'vitest';
import { crc32, zipStore } from './zip';

const text = (s: string) => new TextEncoder().encode(s);

describe('crc32', () => {
  // The published check values of CRC-32 (the check value of the standard is the CRC of "123456789").
  it('gives the known values', () => {
    expect(crc32(text(''))).toBe(0);
    expect(crc32(text('a'))).toBe(0xe8b7be43);
    expect(crc32(text('123456789'))).toBe(0xcbf43926);
    expect(crc32(text('The quick brown fox jumps over the lazy dog'))).toBe(0x414fa339);
  });
});

/** A reader written from the ZIP specification (APPNOTE 4.3), apart from the writer: the files found through the central directory. */
function readZip(zip: Uint8Array): Array<{ name: string; data: Uint8Array; crc: number; time: number; date: number }> {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const end = zip.length - 22;
  expect(v.getUint32(end, true)).toBe(0x06054b50);
  const count = v.getUint16(end + 10, true);
  expect(v.getUint16(end + 8, true)).toBe(count);
  const dirSize = v.getUint32(end + 12, true);
  let at = v.getUint32(end + 16, true);
  expect(at + dirSize).toBe(end);
  const out = [];
  for (let i = 0; i < count; i++) {
    expect(v.getUint32(at, true)).toBe(0x02014b50);
    const [method, time, date, crc, csize, size, nameLen, extraLen, commentLen, local] = [v.getUint16(at + 10, true), v.getUint16(at + 12, true), v.getUint16(at + 14, true), v.getUint32(at + 16, true), v.getUint32(at + 20, true), v.getUint32(at + 24, true), v.getUint16(at + 28, true), v.getUint16(at + 30, true), v.getUint16(at + 32, true), v.getUint32(at + 42, true)];
    expect(method).toBe(0);
    expect(csize).toBe(size);
    const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLen));
    // the local header says the same, and the data follows it
    expect(v.getUint32(local, true)).toBe(0x04034b50);
    expect(v.getUint32(local + 14, true)).toBe(crc);
    expect(v.getUint32(local + 22, true)).toBe(size);
    expect(new TextDecoder().decode(zip.subarray(local + 30, local + 30 + v.getUint16(local + 26, true)))).toBe(name);
    const dataAt = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    out.push({ name, data: zip.subarray(dataAt, dataAt + size), crc, time, date });
    at += 46 + nameLen + extraLen + commentLen;
  }
  expect(at).toBe(end);
  return out;
}

describe('zipStore', () => {
  it('holds the files in order, with their bytes, names and CRCs, readable through the central directory', () => {
    const files = [
      { name: 'Fig_1.svg', data: text('<svg/>') },
      { name: 'Fig_2.png', data: new Uint8Array([0, 255, 1, 254, 137, 80]) },
      { name: 'empty.txt', data: new Uint8Array(0) },
    ];
    const read = readZip(zipStore(files, new Date(2026, 9, 29, 14, 36, 10)));
    expect(read.map((f) => f.name)).toEqual(['Fig_1.svg', 'Fig_2.png', 'empty.txt']);
    files.forEach((f, i) => {
      expect([...read[i].data]).toEqual([...f.data]);
      expect(read[i].crc).toBe(crc32(f.data));
    });
    expect(read[0].crc).toBe(crc32(text('<svg/>')));
  });
  it('writes the date and time as MS-DOS does: years from 1980, minutes and seconds in 2 s steps', () => {
    const [f] = readZip(zipStore([{ name: 'a', data: text('x') }], new Date(2026, 9, 29, 14, 36, 11)));
    expect(f.date).toBe(((2026 - 1980) << 9) | (10 << 5) | 29);
    expect(f.time).toBe((14 << 11) | (36 << 5) | 5);
  });
  it('writes names in UTF-8', () => {
    expect(readZip(zipStore([{ name: 'Dosis_µg_α.svg', data: text('x') }]))[0].name).toBe('Dosis_µg_α.svg');
  });
  it('is a valid empty archive when there are no files', () => {
    const zip = zipStore([]);
    expect(zip.length).toBe(22);
    expect(readZip(zip)).toEqual([]);
  });
});
