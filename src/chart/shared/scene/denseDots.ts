/**
 * The preview of a graph with very many dots. Above this many, the screen draws the dots that follow each other with the same
 * (opaque) look as a few shapes, because a browser takes seconds to lay out and paint a hundred thousand elements; the export and
 * every smaller graph draw each dot as a shape of its own, as always. Nothing is dropped from the data or the export.
 */
export const DENSE_PREVIEW_DOTS = 100_000;

/** The side, in pt, of the squares of the page that the dots of a simplified preview are gathered in (see compileColumnMarks). */
export const DENSE_CELL_PT = 12;

export const isDense = (dots: number): boolean => dots >= DENSE_PREVIEW_DOTS;

/** The notice that goes with a simplified preview (an export is never simplified). */
export const densePreviewNote = (dots: number): string =>
  `This preview draws ${dots.toLocaleString('en-US').replace(/,/g, ' ')} dots in simplified form (dots of one look are one shape; dots with transparency are unchanged). The export draws every dot.`;

/** How far beyond the edge of a dot a click still picks it, in pt. */
const REACH_PT = 2;

/**
 * The dot a pointer is on, when the dots are not elements of their own: the nearest of those whose size (and a little reach) covers
 * the pointer, the last drawn of two equally near. `at` gives the position of a dot on the page, in the units of the pointer.
 */
export function nearestDot<T extends { id: string; size: number }>(dots: readonly T[], at: (dot: T) => { x: number; y: number }, x: number, y: number): T | null {
  let best: T | null = null;
  let bestD2 = Infinity;
  for (const d of dots) {
    const p = at(d);
    const [dx, dy] = [p.x - x, p.y - y];
    const d2 = dx * dx + dy * dy;
    const reach = d.size / 2 + REACH_PT;
    if (d2 <= reach * reach && d2 <= bestD2) {
      best = d;
      bestD2 = d2;
    }
  }
  return best;
}
