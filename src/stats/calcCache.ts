/**
 * One cache for calculation results, keyed by what a result is computed from and by nothing else (roadmap rule 4): the data,
 * the exclusions already applied to it, the method and its parameters, the level, the seed and the version of the algorithm.
 * A colour, a title or an axis edit is not part of the identity, so it never finds a reason to calculate again; a change to
 * any part of the identity, an algorithm version included, never finds a stale result.
 */
export interface CalcIdentity {
  /** What is calculated: 'summary', 'fit' and so on. */
  kind: string;
  /** The version of the algorithm; raise it when the numbers a method gives change. */
  algorithm: number;
  /** The numbers the result is computed from, as they are after exclusions (a missing value is written as such). */
  data: ReadonlyArray<number | null>;
  /** The method, e.g. a fit model or a centre and spread. */
  method: string;
  /** Anything else the result depends on. Only what changes the result belongs here. */
  params?: ReadonlyArray<string | number | boolean | null>;
  level?: number | null;
  seed?: number | null;
}

/** How many results were calculated and how many were found, for the tests. */
export const calcStats = { computed: 0, hits: 0 };

/** Beyond this the least recently used result goes. A large table recalculates what it cannot keep, never shows a wrong one. */
const CAPACITY = 20000;
const cache = new Map<string, unknown>();

/** The key of an identity: the numbers themselves, not a hash, since a collision would show another series' result. */
export function calcKey(id: CalcIdentity): string {
  let data = '';
  for (const v of id.data) data += v === null ? ';' : `${v};`;
  return JSON.stringify([id.kind, id.algorithm, id.method, id.params ?? [], id.level ?? null, id.seed ?? null, id.data.length]) + '|' + data;
}

/** The result for an identity: the one kept, or the one `compute` gives (and is then kept). Results are shared: do not change them. */
export function cachedCalc<T>(id: CalcIdentity, compute: () => T): T {
  const key = calcKey(id);
  if (cache.has(key)) {
    const hit = cache.get(key) as T;
    cache.delete(key);
    cache.set(key, hit);
    calcStats.hits++;
    return hit;
  }
  calcStats.computed++;
  const made = compute();
  cache.set(key, made);
  if (cache.size > CAPACITY) cache.delete(cache.keys().next().value as string);
  return made;
}

/** Forget everything; for the tests. */
export const clearCalcCache = (): void => cache.clear();
