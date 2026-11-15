import { describe, expect, it } from 'vitest';
import { createDrawing, DRAWING_PRESETS, DRAWING_WIDTH, drawingName, pointsOfDrag, presetById, snapToAxis } from '../../../model/graph/drawingPresets';
import type { Drawing } from '../../../model/types';
import type { AnnotationPlacer } from './annotationPlace';
import { belowSide, drawingElements, drawingGeometry, drawingPatchForPoints, linePath, nudgeDrawings, skippedDrawings } from './drawings';
import type { SceneElement } from './sceneElement';

// The look a new object takes in the app, width included (a drawing made without one is 1 pt wide, which the app never does).
const look = { color: '#000000', fontSizePt: 12, widthPt: DRAWING_WIDTH.chart };
const make = (id: string, over: Partial<Drawing> = {}): Drawing => ({ ...createDrawing(presetById(id)!, { xFrac: 0.1, yFrac: 0.5 }, { xFrac: 0.5, yFrac: 0.5 }, look, 'd1'), ...over });
const numbers = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
const flat = (nodes: readonly SceneElement[]): SceneElement[] => nodes.flatMap((n) => [n, ...flat(n.children ?? [])]);

describe('the presets of the Graphics menu', () => {
  it('are told apart by name when they differ only by their lock: a bracket across, a side bracket down', () => {
    expect(drawingName(make('bracket'))).toBe('Bracket');
    const down = { from: { xFrac: 0.5, yFrac: 0.1 }, to: { xFrac: 0.5, yFrac: 0.6 } };
    expect(drawingName(make('right', down))).toBe('Side bracket, open to the left');
    expect(drawingName(make('left', down))).toBe('Side bracket, open to the right');
    expect(drawingName(make('rightText', down))).toBe('Side bracket, open to the left with text');
  });

  it('are eleven shapes, eleven lines and the same eleven lines with a text, each with its own ID', () => {
    for (const g of ['shapes', 'lines', 'text'] as const) expect(DRAWING_PRESETS.filter((p) => p.group === g)).toHaveLength(11);
    expect(new Set(DRAWING_PRESETS.map((p) => p.id)).size).toBe(33);
    expect(DRAWING_PRESETS.filter((p) => p.group === 'text').every((p) => createDrawing(p, { xFrac: 0, yFrac: 0 }, { xFrac: 1, yFrac: 0 }, look).text === 'ns')).toBe(true);
  });

  it('turn a drag into the two points of the object: a click is the size of the object, a bracket stays across, a circle square, a bent line goes corner to corner', () => {
    const at = { x: 10, y: 20 };
    expect(pointsOfDrag(presetById('line')!, at, { x: 11, y: 21 })).toEqual([at, { x: 82, y: 20 }]);
    expect(pointsOfDrag(presetById('bracket')!, at, { x: 60, y: 45 })).toEqual([at, { x: 60, y: 20 }]);
    expect(pointsOfDrag(presetById('right')!, at, { x: 60, y: 45 })).toEqual([at, { x: 10, y: 45 }]);
    expect(pointsOfDrag(presetById('circle')!, at, { x: 30, y: 60 })).toEqual([at, { x: 50, y: 60 }]);
    // Dragged from the top left, an arrow that goes across then up still starts at the bottom left.
    expect(pointsOfDrag(presetById('elbowArrowUp')!, at, { x: 70, y: 60 })).toEqual([{ x: 10, y: 60 }, { x: 70, y: 20 }]);
  });

  it('put a line within 5 degrees of across or of up and down exactly so, and leave a steeper slant as drawn', () => {
    const at = { x: 0, y: 0 };
    expect(snapToAxis(at, { x: 100, y: 8 })).toEqual({ x: 100, y: 0 });
    expect(snapToAxis(at, { x: -100, y: -8 })).toEqual({ x: -100, y: 0 });
    expect(snapToAxis(at, { x: 8, y: 100 })).toEqual({ x: 0, y: 100 });
    expect(snapToAxis(at, { x: 100, y: 10 })).toEqual({ x: 100, y: 10 });
    expect(pointsOfDrag(presetById('arrow')!, at, { x: 100, y: -6 })).toEqual([at, { x: 100, y: 0 }]);
    // A bent line goes corner to corner and is not straightened.
    expect(pointsOfDrag(presetById('elbowUp')!, at, { x: 100, y: 6 })[1]).toEqual({ x: 100, y: 0 });
  });

  it('take the width they are given: 4 pt on a graph and on a page, with ticks in proportion', () => {
    expect(DRAWING_WIDTH).toEqual({ chart: 4, page: 4 });
    const page = createDrawing(presetById('bracket')!, { xFrac: 0, yFrac: 0 }, { xFrac: 1, yFrac: 0 }, { ...look, widthPt: DRAWING_WIDTH.page });
    expect(page.widthPt).toBe(4);
    expect(page.endSizePt).toBe(10);
  });

  it('name an object by the preset it matches', () => {
    expect(drawingName(make('bracket'))).toBe('Bracket');
    expect(drawingName(make('tall'))).toBe('Tall bracket');
    expect(drawingName(make('capsText'))).toBe('Line with end caps with text');
    expect(drawingName(make('rounded'))).toBe('Rounded rectangle');
    expect(drawingName(make('circle'))).toBe('Ellipse');
    expect(drawingName(make('arrow', { start: 'arrow' }))).toBe('Double arrow');
  });
});

describe('the shapes of a drawing object', () => {
  const a = { x: 10, y: 50 };
  const b = { x: 110, y: 50 };

  it('draw an ellipse and a rectangle as closed outlines, with arcs at the corners of a rounded one', () => {
    const e = drawingGeometry(make('ellipse'), { x: 0, y: 0 }, { x: 100, y: 40 });
    expect(e.closed).toBe(true);
    expect(e.d).toMatch(/^M0,20A50,20 0 1 0 100,20A50,20 0 1 0 0,20Z$/);
    expect(drawingGeometry(make('rect'), { x: 0, y: 0 }, { x: 100, y: 40 }).d).toBe('M0,0H100V40H0Z');
    const r = drawingGeometry(make('rounded'), { x: 0, y: 0 }, { x: 100, y: 40 });
    expect(r.d.match(/A8,8/g)).toHaveLength(4);
    // A corner never takes more than half a side.
    expect(drawingGeometry(make('rect', { cornerPt: 50 }), { x: 0, y: 0 }, { x: 100, y: 10 }).d).toContain('A5,5');
  });

  it('end an arrow in a filled head at its end, the line stopping inside the head', () => {
    const g = drawingGeometry(make('arrow'), a, b);
    expect(g.heads).toMatch(/^M110,50L/);
    const lineEnd = numbers(g.d).slice(-2);
    expect(lineEnd[0]).toBeLessThan(110);
    expect(lineEnd[0]).toBeGreaterThan(110 - 12); // the head of a 4 pt line is about 10 pt long
    expect(drawingGeometry(make('double'), a, b).heads.match(/M/g)).toHaveLength(2);
  });

  it('put the ticks of a bracket below a line across, to the left of one down, and the other way for flipped ticks', () => {
    expect(belowSide({ x: 1, y: 0 })).toEqual({ x: -0, y: 1 });
    expect(belowSide({ x: -1, y: 0 }).y).toBe(1);
    expect(belowSide({ x: 0, y: 1 }).x).toBe(-1);
    const bracket = drawingGeometry(make('bracket'), a, b);
    expect(bracket.caps).toBe('M10,50L10,60M110,50L110,60');
    const cup = drawingGeometry(make('cup'), a, b);
    expect(cup.caps).toBe('M10,50L10,34M110,50L110,34');
    // A side bracket drawn down, open to the left: its ticks point left.
    expect(drawingGeometry(make('right'), { x: 50, y: 0 }, { x: 50, y: 60 }).caps).toBe('M50,0L40,0M50,60L40,60');
  });

  it('write the text of a line over its middle, or under it; beside a line that runs down', () => {
    const over = drawingGeometry(make('bracketText'), a, b).text!;
    expect(over).toMatchObject({ x: 60, anchor: 'middle' });
    expect(over.y).toBeLessThan(50 - 3);
    const under = drawingGeometry(make('bracketText', { textSide: 'below' }), a, b).text!;
    expect(under.y).toBeGreaterThan(50 + 3);
    const side = drawingGeometry(make('rightText'), { x: 50, y: 0 }, { x: 50, y: 60 }).text!;
    expect(side).toMatchObject({ x: 53, anchor: 'start' });
    expect(drawingGeometry(make('rightText', { textSide: 'below' }), { x: 50, y: 0 }, { x: 50, y: 60 }).text).toMatchObject({ x: 47, anchor: 'end' });
  });

  it('bend a line across then down, or down then across, and draw a quarter of an ellipse for an arc', () => {
    expect(linePath({ route: 'hv' }, { x: 0, y: 0 }, { x: 10, y: 20 })).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 20 }]);
    expect(linePath({ route: 'vh' }, { x: 0, y: 0 }, { x: 10, y: 20 })).toEqual([{ x: 0, y: 0 }, { x: 0, y: 20 }, { x: 10, y: 20 }]);
    expect(linePath({ route: 'hv' }, { x: 0, y: 0 }, { x: 10, y: 0 })).toHaveLength(2);
    expect(drawingGeometry(make('arc'), { x: 0, y: 40 }, { x: 40, y: 0 }).d).toBe('M0,40A40,40 0 0 1 40,0');
  });
});

describe('the elements of drawing objects', () => {
  it('are a group the editor can hit, with handles only in the editor while the object is selected; an export has the shape alone', () => {
    const els = drawingElements([make('arrowText')], 200, 100);
    expect(els).toHaveLength(1);
    expect(els[0].hit).toEqual({ kind: 'drawing', objectId: 'd1' });
    const all = flat(els);
    expect(all.filter((n) => n.hit?.kind === 'handle').every((n) => n.whenAnnotationSelected === 'd1')).toBe(true);
    expect(all.filter((n) => n.hit?.kind === 'handle').map((n) => n.hit?.handle)).toEqual(['from', 'to']);
    expect(all.find((n) => n.tag === 'text')?.text).toBe('ns');
  });

  it('leave out an object anchored to a value the axes do not show, and draw a draft in place of the stored object', () => {
    const placer = { widthPt: 200, heightPt: 100, supportsData: true, numericX: true, acrossPage: null, place: (s) => (s.anchor === 'data' && (s.y ?? 0) > 10 ? null : { x: s.xFrac * 200, y: s.yFrac * 100 }), fromPage: (x, y) => ({ x, y }), skipped: (list) => list.filter((s) => s.anchor === 'data' && (s.y ?? 0) > 10) } as AnnotationPlacer;
    const far = make('line', { anchor: 'data', from: { xFrac: 0, yFrac: 0, x: 0, y: 50 }, to: { xFrac: 1, yFrac: 0, x: 1, y: 1 } });
    expect(drawingElements([far], 200, 100, placer.place)).toEqual([]);
    expect(skippedDrawings([far, make('line')], placer).map((d) => d.id)).toEqual(['d1']);
    const live = drawingElements([make('line')], 200, 100, undefined, undefined, [{ drawing: make('line'), drag: { id: 'd1', from: { x: 1, y: 2 }, to: { x: 3, y: 4 } } }]);
    expect(flat(live).find((n) => n.tag === 'path' && !n.editorOnly)?.attrs?.find(([k]) => k === 'd')?.[1]).toBe('M1,2L3,4');
  });

  it('store a moved object as fractions, keeping the values on the axes of one anchored to data', () => {
    const placer = { widthPt: 200, heightPt: 100, numericX: true, fromPage: (x: number, y: number) => ({ x: x / 2, y: y / 4 }) } as unknown as AnnotationPlacer;
    expect(drawingPatchForPoints(make('line'), { x: 50, y: 25 }, { x: 150, y: 75 }, 200, 100)).toEqual({ from: { xFrac: 0.25, yFrac: 0.25 }, to: { xFrac: 0.75, yFrac: 0.75 } });
    const anchored = make('line', { anchor: 'data', from: { xFrac: 0, yFrac: 0, x: 0, y: 0 }, to: { xFrac: 0, yFrac: 0, x: 0, y: 0 } });
    expect(drawingPatchForPoints(anchored, { x: 50, y: 20 }, { x: 100, y: 40 }, 200, 100, placer).to).toEqual({ xFrac: 0.5, yFrac: 0.4, x: 50, y: 10 });
    expect(nudgeDrawings([make('line')], 0.1, -0.1, 200, 100)[0].patch).toEqual({ from: { xFrac: 0.2, yFrac: 0.4 }, to: { xFrac: 0.6, yFrac: 0.4 } });
  });
});

describe('objects made at the width the app makes them', () => {
  it('are named by their preset, not by another with the same ends', () => {
    const at = (id: string) => createDrawing(presetById(id)!, { xFrac: 0.1, yFrac: 0.5 }, { xFrac: 0.5, yFrac: 0.5 }, { ...look, widthPt: DRAWING_WIDTH.chart }, 'x');
    expect(drawingName(at('tall'))).toBe('Tall bracket');
    expect(drawingName(at('cup'))).toBe('Bracket open upwards');
    expect(drawingName(at('bracket'))).toBe('Bracket');
  });
  it('are held to the page, and a locked bracket dragged the wrong way is not a line of no length', () => {
    const near = createDrawing(presetById('bracket')!, { xFrac: 0.97, yFrac: 0.5 }, { xFrac: 1.07, yFrac: 0.5 }, look, 'x');
    expect(near.to.xFrac).toBe(1);
    const [a, b] = pointsOfDrag(presetById('bracket')!, { x: 100, y: 100 }, { x: 100, y: 140 });
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThan(3);
  });
});
