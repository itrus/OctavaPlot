/**
 * Small checks for settings read from a file or a patch: a value that is not valid is replaced by the fallback,
 * a number outside its limits is held at the nearest limit. Used by the sanitize* functions of the settings.
 */

export type Options<T extends string> = ReadonlyArray<{ value: T }>;

/** The values of a list of options. */
export const valuesOf = <T extends string>(options: Options<T>): T[] => options.map((o) => o.value);

/** `v` when it is one of `values`, else the fallback. */
export const oneOf = <T extends string>(values: readonly T[], v: unknown, fallback: T): T => (values.includes(v as T) ? (v as T) : fallback);

export const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

/** A finite number held within [lo, hi]. */
export const clamp = (v: unknown, lo: number, hi: number, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);

/** Like `clamp`, and `null` stays `null`. */
export const clampOrNull = (v: unknown, lo: number, hi: number, fallback: number | null): number | null => (v === null ? null : typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);

/** A finite number as it is, `null` as `null`. */
export const numberOrNull = (v: unknown, fallback: number | null): number | null => (v === null ? null : typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** A string cut to `max` characters. */
export const text = (v: unknown, max: number, fallback: string): string => (typeof v === 'string' ? v.slice(0, max) : fallback);

const HEX = /^#[0-9a-fA-F]{6}$/;

/** A colour as #rrggbb in lower case. */
export const hex = (v: unknown, fallback: string): string => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : fallback);

/** A colour, `null` for none; an invalid value falls back (and the fallback may be none). */
export const optionalHex = (v: unknown, fallback: string | null): string | null => (v === null ? null : typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : fallback);

/** An object read as a record of unknown values; anything else is an empty one. */
export const record = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
