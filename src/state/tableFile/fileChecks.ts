/** The checks of the shape of a project file, which refuse it with the path of what is wrong. Shared by the reader (serialize.ts) and the reading of the data tables (tableFile/tableCodec.ts). */

export type Obj = Record<string, unknown>;
export const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

export function fail(path: string, what: string): never {
  throw new Error(`Invalid project file: ${path} ${what}.`);
}
export const str = (v: unknown, path: string): string => (typeof v === 'string' ? v : fail(path, 'must be a string'));
export const num = (v: unknown, path: string): number => (typeof v === 'number' && Number.isFinite(v) ? v : fail(path, 'must be a finite number'));
export const arr = (v: unknown, path: string): unknown[] => (Array.isArray(v) ? v : fail(path, 'must be an array'));
export const obj = (v: unknown, path: string): Obj => (isObj(v) ? v : fail(path, 'must be an object'));
