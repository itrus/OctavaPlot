let counter = 0;

/** Stable unique ID. Random part prevents collisions with IDs from loaded projects. */
export function newId(prefix: string): string {
  counter += 1;
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rand}${counter.toString(36)}`;
}
