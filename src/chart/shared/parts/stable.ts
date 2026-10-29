/**
 * Identity that survives a rebuild. The model of a chart is made again for every edit, even a title; what the dots of a data set are
 * (and the shapes drawn from them) usually does not change. A list that equals the one made last time for the same data is replaced by
 * that one, so what is built from it can be kept and React can skip it (see shared/scene/sceneRuns.ts). The comparison is of the
 * values, so a list is reused only when it is the same, never because of what was assumed about the edit.
 */

/** Two flat records with the same fields and the same values (NaN equals NaN). */
export function sameRecords(a: object, b: object): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  const [ra, rb] = [a as Record<string, unknown>, b as Record<string, unknown>];
  return ka.every((k) => k in rb && Object.is(ra[k], rb[k]));
}

const BY_OWNER = new WeakMap<object, Map<string, unknown>>();
const KEYS_PER_OWNER = 16;

/** One value for an owner object and a key, made by `make` the first time. */
export function cachedFor<T>(owner: object, key: string, make: () => T): T {
  let byKey = BY_OWNER.get(owner);
  if (!byKey) BY_OWNER.set(owner, (byKey = new Map()));
  if (byKey.has(key)) return byKey.get(key) as T;
  const value = make();
  if (byKey.size >= KEYS_PER_OWNER) byKey.clear();
  byKey.set(key, value);
  return value;
}

const LISTS = new WeakMap<object, Map<string, readonly object[]>>();

/**
 * `fresh`, or the list last given for this owner (the array of observations a data set was drawn from) and key when it holds equal records.
 * A list of a hundred thousand records is worth a comparison written out field by field (`same`): the general one allocates.
 */
export function stableList<T extends object>(owner: object, key: string, fresh: T[], same: (a: T, b: T) => boolean = sameRecords): T[] {
  let byKey = LISTS.get(owner);
  if (!byKey) LISTS.set(owner, (byKey = new Map()));
  const before = byKey.get(key) as T[] | undefined;
  if (before && before.length === fresh.length && fresh.every((r, i) => same(r, before[i]))) return before;
  if (!before && byKey.size >= KEYS_PER_OWNER) byKey.clear();
  byKey.set(key, fresh);
  return fresh;
}
