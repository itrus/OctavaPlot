import { describe, expect, it } from 'vitest';
import type { SceneElement } from '../scene/sceneElement';
import { bracketElements, type BracketGeom } from './brackets';
import type { Orientation } from './orientation';

const upright: Orientation = {
  horizontal: false,
  real: { x: 0, y: 0, width: 400, height: 300 },
  virtual: { x: 0, y: 0, width: 400, height: 300 },
  toScreen: (x, y) => ({ x, y }),
  matrix: null,
};
const geom = (label: string, fontSizePt = 16): BracketGeom => ({ id: 'b', label, x1: 50, x2: 150, y: 100, tick: 10, color: '#000000', widthPt: 2, fontSizePt });

/** The y of the label of the only bracket drawn. */
function labelY(label: string, fontSizePt?: number): number {
  const [group] = bracketElements([geom(label, fontSizePt)], upright, new Set());
  const text = (group.children ?? []).find((c): c is SceneElement => c.tag === 'text')!;
  return Number(text.attrs!.find(([k]) => k === 'y')![1]);
}

describe('the label of a bracket on an upright chart', () => {
  it('stands 4 pt above the bar when it has no subscript', () => {
    expect(labelY('p = 0.003')).toBe(96);
    expect(labelY('p^{2}')).toBe(96);
  });
  it('stands high enough for a subscript, which sinks below the baseline, to clear the bar', () => {
    // A subscript sinks 0.28 em and its own descender reaches 0.2 of its 70% size below that: 0.42 em of the label's size.
    const size = 16;
    const sunk = 0.28 * size + 0.2 * 0.7 * size;
    expect(100 - labelY('p_{adj} = 0.03', size)).toBeGreaterThan(sunk);
  });
});
