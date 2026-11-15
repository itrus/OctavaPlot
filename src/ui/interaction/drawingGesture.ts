import type { Drawing } from '../../model/types';
import { snapToAxis } from '../../model/graph/drawingPresets';

/** Drawing objects being moved (all the selected ones) or resized by a handle: where the drag began, how far it has gone, and where each object's points were drawn when it began (pt). */
export interface ShapeDrag {
  mode: 'move' | 'from' | 'to';
  start: { x: number; y: number };
  delta: { x: number; y: number };
  items: Array<{ drawing: Drawing; from: { x: number; y: number }; to: { x: number; y: number } }>;
}

/** The live points of an object being moved or resized, pt: a move shifts both, a handle one. */
export function draggedPoints(it: ShapeDrag['items'][number], d: Pick<ShapeDrag, 'mode' | 'delta'>) {
  const shift = (q: { x: number; y: number }) => ({ x: q.x + d.delta.x, y: q.y + d.delta.y });
  if (d.mode === 'move') return { from: shift(it.from), to: shift(it.to) };
  // A handle of a straight line close to across or to up and down puts it exactly so, from its other end.
  const straight = it.drawing.shape === 'line' && (it.drawing.route ?? 'straight') === 'straight';
  if (d.mode === 'from') return { from: straight ? snapToAxis(it.to, shift(it.from)) : shift(it.from), to: it.to };
  return { from: it.from, to: straight ? snapToAxis(it.from, shift(it.to)) : shift(it.to) };
}

