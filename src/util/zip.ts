/**
 * A ZIP file with its files stored as they are (no compression): the form that every unzip program reads, made without a library.
 * It is for the pictures of a batch export: PNG and PDF are compressed already, and an SVG is small. Names are written as UTF-8.
 * Not supported on purpose: ZIP64 (more than 65535 files, or a file or the whole of 4 GB or more), which is refused with an error.
 * Pure; no layers below.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** The CRC-32 (the one of ZIP, PNG and gzip) of some bytes, as an unsigned number. */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipFile {
  /** The path inside the archive, with "/" between folders; no leading "/". */
  name: string;
  data: Uint8Array;
}

/** The date and time as MS-DOS writes them (2 s steps from 1980), as the two 16-bit fields of a ZIP header. */
function dosDateTime(when: Date): { time: number; date: number } {
  const year = Math.min(2107, Math.max(1980, when.getFullYear()));
  return { time: (when.getHours() << 11) | (when.getMinutes() << 5) | Math.floor(when.getSeconds() / 2), date: ((year - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate() };
}

const LIMIT = 0xffffffff;

/** The archive holding the files in the order given, each stamped with `when` (local time). */
export function zipStore(files: readonly ZipFile[], when: Date = new Date()): Uint8Array {
  if (files.length > 0xffff) throw new Error('A ZIP file holds at most 65535 files.');
  const names = files.map((f) => new TextEncoder().encode(f.name));
  const { time, date } = dosDateTime(when);
  const total = files.reduce((n, f, i) => n + 30 + names[i].length + f.data.length + 46 + names[i].length, 22);
  if (total >= LIMIT || files.some((f) => f.data.length >= LIMIT)) throw new Error('The files are too large for one ZIP file (4 GB).');
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  let at = 0;
  const u16 = (v: number) => {
    view.setUint16(at, v, true);
    at += 2;
  };
  const u32 = (v: number) => {
    view.setUint32(at, v, true);
    at += 4;
  };
  const bytes = (b: Uint8Array) => {
    out.set(b, at);
    at += b.length;
  };
  const offsets: number[] = [];
  const crcs = files.map((f) => crc32(f.data));
  files.forEach((f, i) => {
    offsets.push(at);
    u32(0x04034b50); // local file header
    u16(20); // version needed
    u16(0x0800); // flags: the name is UTF-8
    u16(0); // method: stored
    u16(time);
    u16(date);
    u32(crcs[i]);
    u32(f.data.length); // compressed size
    u32(f.data.length); // size
    u16(names[i].length);
    u16(0); // no extra field
    bytes(names[i]);
    bytes(f.data);
  });
  const directory = at;
  files.forEach((f, i) => {
    u32(0x02014b50); // central directory header
    u16(20); // made by
    u16(20); // version needed
    u16(0x0800);
    u16(0);
    u16(time);
    u16(date);
    u32(crcs[i]);
    u32(f.data.length);
    u32(f.data.length);
    u16(names[i].length);
    u16(0); // extra
    u16(0); // comment
    u16(0); // disk
    u16(0); // internal attributes
    u32(0); // external attributes
    u32(offsets[i]);
    bytes(names[i]);
  });
  const end = at;
  u32(0x06054b50); // end of central directory
  u16(0);
  u16(0);
  u16(files.length);
  u16(files.length);
  u32(end - directory); // size of the directory
  u32(directory); // where it begins
  u16(0); // no comment
  return out;
}
