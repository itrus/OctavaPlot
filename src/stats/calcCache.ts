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

/**
 * What the cache may hold, as the total length of the input data of its entries (a result costs about what its input does).
 * Beyond it the least recently used results go; one input larger than the whole budget is calculated and not kept.
 */
const BUDGET = 4_000_000;
/** A cap on the number of entries too, since many tiny inputs cost little each but their results are not free. */
const MAX_ENTRIES = 20000;

interface Entry {
  value: unknown;
  cost: number;
}
const cache = new Map<string, Entry>();
let used = 0;

/** The content signature of each input array object, worked out once per object: a lookup never walks the data again. */
const signatures = new WeakMap<object, string>();
const view = new DataView(new ArrayBuffer(8));

/**
 * Two independent 32-bit hashes of every value (its exact bits; a missing value has a bit pattern of its own) and the length.
 * The array must not be changed after it is first asked about; the callers build a fresh array for each series.
 */
function signatureOf(data: ReadonlyArray<number | null>): string {
  const known = signatures.get(data);
  if (known !== undefined) return known;
  let h1 = 0x811c9dc5;
  let h2 = 0x9747b28c;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (v === null) {
      view.setUint32(0, 0x7ff80001);
      view.setUint32(4, 0xdeadbeef);
    } else view.setFloat64(0, v);
    for (let k = 0; k < 8; k += 4) {
      const w = view.getUint32(k);
      h1 = Math.imul(h1 ^ w, 0x01000193);
      h1 ^= h1 >>> 15;
      h2 = Math.imul(h2 + w, 0x85ebca6b) ^ (h2 >>> 13);
    }
  }
  const sig = `${data.length}.${(h1 >>> 0).toString(36)}.${(h2 >>> 0).toString(36)}`;
  signatures.set(data, sig);
  return sig;
}

/** The key of an identity: everything but the data in full, the data by its signature (computed once for each array object). */
export function calcKey(id: CalcIdentity): string {
  return JSON.stringify([id.kind, id.algorithm, id.method, id.params ?? [], id.level ?? null, id.seed ?? null]) + '|' + signatureOf(id.data);
}

/** The result for an identity: the one kept, or the one `compute` gives (and is then kept). Results are shared: do not change them. */
export function cachedCalc<T>(id: CalcIdentity, compute: () => T): T {
  const key = calcKey(id);
  const found = cache.get(key);
  if (found) {
    cache.delete(key);
    cache.set(key, found);
    calcStats.hits++;
    return found.value as T;
  }
  calcStats.computed++;
  // Nothing is stored until a result exists, so a throw leaves no entry; a failure value is kept only under its full key.
  const made = compute();
  const cost = id.data.length + 1;
  if (cost > BUDGET) return made;
  cache.set(key, { value: made, cost });
  used += cost;
  for (const [oldest, e] of cache) {
    if (used <= BUDGET && cache.size <= MAX_ENTRIES) break;
    cache.delete(oldest);
    used -= e.cost;
  }
  return made;
}

/** Forget everything; for the tests. */
export function clearCalcCache(): void {
  cache.clear();
  used = 0;
}
