import { describe, expect, it } from 'vitest';
import type { Bracket } from '../../model/types';
import { placeBrackets } from './bracketPlacement';

const br = (id: string, from: string, to: string, label = id, fontSizePt = 24): Bracket => ({ id, from, to, label, color: '#000000', widthPt: 2, fontSizePt });
const order = ['A', 'B', 'C', 'D'];
const PLOT = 400;
const place = (brackets: Bracket[], tops: Array<number | null> = [10, 20, 15, 12], extra: Partial<Parameters<typeof placeBrackets>[0]> = {}) =>
  placeBrackets({ brackets, order, tops, primary: order.map(() => true), log: false, values: [0, 20], includeZero: false, plotLengthPt: PLOT, ...extra });
const at = (r: ReturnType<typeof place>, id: string) => r.placed.find((p) => p.bracket.id === id)!;
/** The gap between two lines in data units: a label of 24 pt needs 33.6 pt; the plot shows the data and (levels + 1) such gaps. */
const step = (range: number, levels: number, labelPt = 33.6, plot = PLOT) => (range * 1.1 * labelPt) / (plot - (levels + 1) * labelPt);

describe('where a comparison bracket stands', () => {
  it('stands one step above the highest data set it joins, and its label room is one step above that', () => {
    const r = place([br('x', 'A', 'B')]);
    expect(at(r, 'x').value).toBeCloseTo(20 + step(20, 1), 9);
    expect(at(r, 'x').top).toBeCloseTo(20 + 2 * step(20, 1), 9);
    expect([at(r, 'x').i, at(r, 'x').j]).toEqual([0, 1]);
  });
  it('makes a step as long on the page as a label is tall: the lines are a label and a margin apart, whatever the data', () => {
    // 24 pt text: 24 * 0.9 + 12 = 33.6 pt. With the plot 400 pt long and two gaps (one bracket and the room above it) used, one gap is
    // 33.6 / (400 - 2 * 33.6) of the range, i.e. 33.6 pt of the 332.8 pt left for the data.
    const r = place([br('x', 'A', 'B')], [10, 20, 15, 12], { values: [0, 1000] });
    expect(at(r, 'x').value - 20).toBeCloseTo((1000 * 1.1 * 33.6) / (400 - 67.2), 6);
  });
  it('asks for a bigger step for a bigger label, and for less when no label is written', () => {
    const big = at(place([br('x', 'A', 'B', 'x', 48)]), 'x').value;
    const small = at(place([br('x', 'A', 'B', 'x', 12)]), 'x').value;
    const none = at(place([br('x', 'A', 'B', '')]), 'x').value;
    expect(big).toBeGreaterThan(small);
    expect(small).toBeGreaterThan(none);
    expect(none - 20).toBeCloseTo(step(20, 1, 12), 9);
  });
  it('measures the step against a range that starts at 0 when the axis will include 0 (bars), as the plot shows it', () => {
    // The values run 15 to 20, but the plot shows 0 to 20: the step is of 20, not of 5.
    const r = place([br('x', 'A', 'B')], [10, 20, 15, 12], { values: [15, 20], includeZero: true });
    expect(at(r, 'x').value - 20).toBeCloseTo(step(20, 1), 9);
    const without = place([br('x', 'A', 'B')], [10, 20, 15, 12], { values: [15, 20] });
    expect(at(without, 'x').value - 20).toBeCloseTo(step(5, 1), 9);
  });
  it('stands above the highest data set between its two ends too, not only above the ends', () => {
    // A and C are low (10, 15) but B between them is 20.
    expect(at(place([br('x', 'A', 'C')]), 'x').value).toBeCloseTo(20 + step(20, 1), 9);
  });
  it('does not mind which end is named first', () => {
    const a = at(place([br('x', 'A', 'C')]), 'x');
    const b = at(place([br('x', 'C', 'A')]), 'x');
    expect([b.i, b.j, b.value]).toEqual([a.i, a.j, a.value]);
  });
  it('stacks brackets that overlap: the one that spans the other stands higher, whichever was added first', () => {
    for (const list of [[br('short', 'A', 'B'), br('long', 'A', 'C')], [br('long', 'A', 'C'), br('short', 'A', 'B')]]) {
      const r = place(list);
      expect(at(r, 'long').value).toBeGreaterThan(at(r, 'short').value);
      expect(at(r, 'long').value - at(r, 'short').value).toBeCloseTo(step(20, 2), 9);
    }
  });
  it('leaves room for every level: the top of the highest label still fits the plot length it was given', () => {
    const r = place([br('a', 'A', 'B'), br('b', 'A', 'C'), br('c', 'A', 'D')]);
    const top = Math.max(...r.placed.map((p) => p.top));
    // Three levels: the data (0 to 20) and the three steps and the room of the last make 4 gaps of the plot, 20 data units over what is left.
    expect(top).toBeCloseTo(20 + 4 * step(20, 3), 9);
    // On the page: the data (0 to 20 of the range from 0 to the top) take what the four gaps of 33.6 pt leave of the 400 pt.
    expect(4 * 33.6 + ((20 * 1.1) / (20 + 4 * step(20, 3) - 20 + 20 * 1.1)) * 400).toBeCloseTo(400, 6);
  });
  it('lets brackets that do not overlap stand each over its own data sets', () => {
    const r = place([br('left', 'A', 'B'), br('right', 'C', 'D')]);
    expect(at(r, 'left').value).toBeCloseTo(20 + step(20, 1), 9);
    // C and D are lower (15, 12): their bracket stands lower than the one over B.
    expect(at(r, 'right').value).toBeCloseTo(15 + step(20, 1), 9);
  });
  it('stacks brackets that share only an end data set', () => {
    const r = place([br('ab', 'A', 'B'), br('bc', 'B', 'C')]);
    expect(Math.abs(at(r, 'ab').value - at(r, 'bc').value)).toBeCloseTo(step(20, 2), 9);
  });
  it('returns the brackets in the order of the list', () => {
    expect(place([br('one', 'C', 'D'), br('two', 'A', 'B')]).placed.map((p) => p.bracket.id)).toEqual(['one', 'two']);
  });
  it('uses a factor on a log axis, where a distance means nothing: a step of the same length on the page', () => {
    const r = place([br('x', 'A', 'B')], [10, 20, 15, 12], { log: true, values: [1, 100] });
    // Two decades of data over the plot: one gap of 33.6 pt out of (400 - 67.2) pt is 2 * 33.6 / 332.8 decades.
    const factor = 10 ** ((2 * 33.6) / (400 - 67.2));
    expect(at(r, 'x').value).toBeCloseTo(20 * factor, 9);
    expect(at(r, 'x').top).toBeCloseTo(20 * factor * factor, 9);
  });
  it('is not placed above a value of 0 or less on a log axis, and is skipped when none of its data sets has a value', () => {
    expect(place([br('x', 'A', 'B')], [-1, 0, 5, 5], { log: true, values: [1, 100] }).skipped.map((s) => s.reason)).toEqual(['the data sets it joins have no values to stand above']);
    expect(place([br('x', 'A', 'B')], [null, null, 5, 5]).skipped).toHaveLength(1);
  });
  it('says why a bracket is skipped: a data set that is not on the graph, a data set joined to itself, a data set on the right axis', () => {
    const r = placeBrackets({ brackets: [br('gone', 'A', 'Z'), br('same', 'B', 'B'), br('right', 'A', 'C')], order, tops: [10, 20, 15, 12], primary: [true, true, false, true], log: false, values: [0, 20], includeZero: false, plotLengthPt: PLOT });
    expect(r.placed).toEqual([]);
    expect(r.skipped.map((s) => s.reason)).toEqual(['a data set it joins is not on the graph', 'it joins a data set to itself', 'a data set it joins is on the right axis']);
  });
  it('measures the step against the value when the data have no range, or against 1 when there is nothing to measure', () => {
    expect(place([br('x', 'A', 'B')], [10, 20, 15, 12], { values: [5, 5] }).placed[0].value).toBeCloseTo(20 + step(5, 1), 9);
    expect(place([br('x', 'A', 'B')], [10, 20, 15, 12], { values: [] }).placed[0].value).toBeCloseTo(20 + step(1, 1), 9);
  });
  it('does not blow up on a plot that is too short for the stack: the step is capped by what a fifth of the plot can show', () => {
    const r = place([br('a', 'A', 'B'), br('b', 'A', 'C'), br('c', 'A', 'D')], [10, 20, 15, 12], { plotLengthPt: 50 });
    for (const p of r.placed) expect(Number.isFinite(p.top)).toBe(true);
    const free = 50 * 0.2;
    expect(at(r, 'a').value - 20).toBeCloseTo((20 * 1.1 * 33.6) / free, 6);
  });
});
