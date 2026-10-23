/**
 * Results that depend only on an array of observations and a few settings, kept for as long as the array lives. Commands
 * replace the arrays of the table and never change them, so a style-only edit finds the result it needs.
 */
const caches = new WeakMap<ReadonlyArray<unknown>, Map<string, unknown>>();
const LIMIT = 32;

export function memoFor<T>(source: ReadonlyArray<unknown>, key: string, compute: () => T): T {
  let byKey = caches.get(source);
  if (!byKey) {
    byKey = new Map();
    caches.set(source, byKey);
  }
  if (byKey.has(key)) return byKey.get(key) as T;
  const value = compute();
  if (byKey.size >= LIMIT) byKey.clear();
  byKey.set(key, value);
  return value;
}
