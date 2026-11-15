/** The small dense linear algebra of the fits: solving and inverting a square system, and J'J. */

// Small dense linear algebra: matrices as arrays of rows.

export type Mat = number[][];

/** Solve A x = b (A square) by Gaussian elimination with partial pivoting; null when A is singular. */
export function solve(a: Mat, b: readonly number[]): number[] | null {
  const n = a.length;
  const m = a.map((row, i) => [...row, b[i]]);
  let scale = 0;
  for (const row of a) for (const v of row) scale = Math.max(scale, Math.abs(v));
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    if (!(Math.abs(m[p][c]) > 1e-13 * Math.max(scale, 1e-300))) return null;
    [m[c], m[p]] = [m[p], m[c]];
    for (let r = c + 1; r < n; r++) {
      const f = m[r][c] / m[c][c];
      for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = m[r][n];
    for (let k = r + 1; k < n; k++) s -= m[r][k] * x[k];
    x[r] = s / m[r][r];
  }
  return x;
}

/** The inverse of a square matrix; null when it is singular. */
export function invert(a: Mat): Mat | null {
  const n = a.length;
  const cols: number[][] = [];
  for (let j = 0; j < n; j++) {
    const e = new Array<number>(n).fill(0);
    e[j] = 1;
    const col = solve(a, e);
    if (!col) return null;
    cols.push(col);
  }
  return a.map((_, i) => cols.map((c) => c[i]));
}

export const jtj = (j: Mat): Mat => {
  const p = j[0]?.length ?? 0;
  const out: Mat = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  for (const row of j) for (let a = 0; a < p; a++) for (let b = a; b < p; b++) out[a][b] += row[a] * row[b];
  for (let a = 0; a < p; a++) for (let b = 0; b < a; b++) out[a][b] = out[b][a];
  return out;
};
