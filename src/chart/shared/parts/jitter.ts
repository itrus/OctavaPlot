/** Deterministic pseudo-random in [0,1) from a string (FNV-1a hash -> mulberry32). */
export function hash01(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let t = (h + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** How many of the points placed last a new one is checked against: a swarm is never wider than a few dozen symbols, and a pile of equal values would otherwise cost n squared. */
const SWARM_WINDOW = 96;

/**
 * Beeswarm: the sideways offset of each point so that no two symbols touch while each keeps its height. `ys` are the heights in the
 * units of the drawing, `diameter` is the symbol's, `maxHalf` the most a point may leave the middle (a point that would go further is
 * put at the edge, and so may touch another). Points are placed from the lowest up, each at the free place nearest the middle, left and
 * right in turn; there is no randomness, so the same data always give the same picture. A point with no finite height stays in the middle.
 */
export function swarmOffsets(ys: readonly number[], diameter: number, maxHalf: number): number[] {
  const out = new Array<number>(ys.length).fill(0);
  if (!(diameter > 0) || !(maxHalf > 0)) return out;
  const order: number[] = [];
  ys.forEach((y, i) => {
    if (Number.isFinite(y)) order.push(i);
  });
  order.sort((a, b) => ys[a] - ys[b]);
  const placed: Array<{ x: number; y: number }> = [];
  const eps = 1e-9;
  let side = 1;
  for (const i of order) {
    const y = ys[i];
    // The ones placed before it that are less than a diameter below, each shutting out a stretch of the row.
    const near: Array<[number, number]> = [];
    for (let k = placed.length - 1; k >= 0 && placed.length - k <= SWARM_WINDOW; k--) {
      const dy = y - placed[k].y;
      if (dy >= diameter) break;
      const h = Math.sqrt(diameter * diameter - dy * dy);
      near.push([placed[k].x - h, placed[k].x + h]);
    }
    // The free place nearest the middle: the middle itself, or the end of a shut-out stretch.
    let best = Infinity;
    const candidates = [0];
    for (const [a, b] of near) candidates.push(a, b);
    for (const c of candidates) {
      if (near.some(([a, b]) => c > a + eps && c < b - eps)) continue;
      const closer = Math.abs(c) < Math.abs(best) - eps;
      const tie = Math.abs(Math.abs(c) - Math.abs(best)) <= eps && Math.sign(c) === side;
      if (closer || tie) best = c;
    }
    if (!Number.isFinite(best)) best = 0;
    if (best !== 0) side = -Math.sign(best);
    const x = Math.max(-maxHalf, Math.min(maxHalf, best));
    placed.push({ x, y });
    out[i] = x;
  }
  return out;
}

/** What decides where the dots of a plot of individual values sit sideways. */
export interface DotSpread {
  enabled: boolean;
  swarm: boolean;
  widthFraction: number;
}

/**
 * The sideways offset of each dot of one column (or bar): none when the dots are aligned, a fixed pseudo-random one from the dot's ID
 * for jitter, or a beeswarm. `width` is the room the dots may use (the slot or bar width times the fraction already), `ys` their
 * heights in the drawing and `diameter` the symbol's.
 */
export function dotOffsets(spread: Pick<DotSpread, 'enabled' | 'swarm'>, ids: readonly string[], ys: readonly number[], diameter: number, width: number): number[] {
  if (!spread.enabled) return ids.map(() => 0);
  if (spread.swarm) return swarmOffsets(ys, diameter, width / 2);
  return ids.map((id) => (hash01(id) - 0.5) * width);
}
