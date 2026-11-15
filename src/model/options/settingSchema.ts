/** Structural types of settings. Bounds and enum membership belong to the option sanitizers. */
type SettingKind = 'number' | 'string' | 'boolean' | 'array' | 'nullableNumber' | 'nullableString' | 'nullableColor';
export interface SettingSchema { readonly [key: string]: SettingKind | SettingSchema }

/** Check schema keys against model keys and their value types at compile time. */
type KindFor<T> = NonNullable<T> extends readonly unknown[] ? 'array'
  : NonNullable<T> extends number ? (null extends T ? 'nullableNumber' : 'number')
  : NonNullable<T> extends boolean ? 'boolean'
  : NonNullable<T> extends string ? (null extends T ? 'nullableString' | 'nullableColor' : 'string')
  : NonNullable<T> extends object ? SchemaFor<NonNullable<T>> : never;
export type SchemaFor<T> = { readonly [K in keyof T]?: KindFor<T[K]> };

type Obj = Record<string, unknown>;
const isObject = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v);
function accepts(kind: SettingKind, value: unknown): boolean {
  switch (kind) {
    case 'number': return finite(value);
    case 'string': return typeof value === 'string';
    case 'boolean': return typeof value === 'boolean';
    case 'array': return Array.isArray(value);
    case 'nullableNumber': return value === null || finite(value);
    case 'nullableString': return value === null || typeof value === 'string';
    case 'nullableColor': return value === null || (typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value));
  }
}

/** Drop malformed known fields; leave other fields for their dedicated readers. No defaults or field-name heuristics. */
export function checkSettings(raw: Obj, schema: SettingSchema, path: string, notes: string[]): Obj {
  const out: Obj = {};
  for (const key of Object.keys(raw)) if (key !== '__proto__') out[key] = raw[key];
  for (const [key, rule] of Object.entries(schema)) {
    if (!Object.hasOwn(raw, key)) continue;
    const value = raw[key];
    const ok = typeof rule === 'string' ? accepts(rule, value) : isObject(value);
    if (!ok) {
      delete out[key];
      notes.push(`${path}.${key} had an invalid value and was reset to the default.`);
    } else if (typeof rule !== 'string') out[key] = checkSettings(value as Obj, rule, `${path}.${key}`, notes);
  }
  return out;
}
