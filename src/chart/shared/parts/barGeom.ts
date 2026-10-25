import type { FillSpec } from '../../../model/graph/fill';
import type { Id } from '../../../model/types';
import type { PatternMarks, Point, Rect } from './hatch';

/** One bar as it is drawn: its rectangle, its look, and the pattern marks that fill it. */
export interface BarGeom {
  id: Id;
  groupId: Id;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  opacity: number;
  stroke: string;
  strokeWidth: number;
  /** Opacity of the border, 0 to 1. */
  strokeOpacity: number;
  /** Resolved fill (mode, pattern and its physical sizes); the legacy fields above stay as they were. */
  fillSpec: FillSpec;
  /** Pattern lattice anchor: bar centre x, baseline pixel of the group's own axis. */
  anchor: Point;
  /** Bar rectangle intersected with the plot area; null when empty. */
  bounds: Rect | null;
  /** Pattern marks, only in pattern mode with bounds. */
  marks: PatternMarks | null;
}
