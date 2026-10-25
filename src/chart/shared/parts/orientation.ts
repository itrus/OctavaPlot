import type { Rect } from './layout';

/**
 * A horizontal column chart is built as a vertical one (categories along x, values along y) in a "virtual" plotting region
 * `virtual` whose width is the height of the real one and whose height is its width; `toScreen` turns a point of that
 * drawing into a point of the real region `real` (a quarter turn with a flip: lengths and angles between lines stay).
 */
export interface Orientation {
  horizontal: boolean;
  real: Rect;
  virtual: Rect;
  /** Position on the page of a point of the virtual drawing. */
  toScreen: (x: number, y: number) => { x: number; y: number };
  /** The SVG matrix that does the same to a whole group of shapes. */
  matrix: string | null;
}
