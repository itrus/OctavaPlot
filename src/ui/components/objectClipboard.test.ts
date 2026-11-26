import { describe, expect, it } from 'vitest';
import type { Annotation, Drawing } from '../../model/types';
import { objectsCount, objectsFromText, objectsToText, pasteStep } from './objectClipboard';

const note: Annotation = { id: 'ann_1', text: 'p < 0.05', xFrac: 0.2, yFrac: 0.3, fontSizePt: 18, color: '#112233', opacity: 1, bold: true, anchor: 'data', x: 2, y: 5 };
const shape: Drawing = { id: 'drw_1', shape: 'line', from: { xFrac: 0.1, yFrac: 0.1, x: 1, y: 2 }, to: { xFrac: 0.5, yFrac: 0.1, x: 3, y: 2 }, anchor: 'data', end: 'arrow', color: '#000000', opacity: 1, widthPt: 4, lineStyle: 'solid' };

describe('texts and shapes on the clipboard', () => {
  it('come back as they were, with new IDs, on a graph', () => {
    const got = objectsFromText(objectsToText({ annotations: [note], drawings: [shape] }), false)!;
    expect(got.annotations).toHaveLength(1);
    expect(got.drawings).toHaveLength(1);
    const { id: noteId, ...noteRest } = got.annotations[0];
    const { id: shapeId, ...shapeRest } = got.drawings[0];
    expect(noteId).not.toBe(note.id);
    expect(shapeId).not.toBe(shape.id);
    const { id: _n, ...noteWas } = note;
    const { id: _s, ...shapeWas } = shape;
    expect(noteRest).toEqual(noteWas);
    expect(shapeRest).toEqual(shapeWas);
  });
  it('lose their data anchor on a page, which has no axes, and keep where they stood', () => {
    const got = objectsFromText(objectsToText({ annotations: [note], drawings: [shape] }), true)!;
    expect(got.annotations[0]).not.toHaveProperty('anchor');
    expect(got.annotations[0]).not.toHaveProperty('x');
    expect(got.annotations[0]).toMatchObject({ xFrac: 0.2, yFrac: 0.3, text: 'p < 0.05' });
    expect(got.drawings[0]).not.toHaveProperty('anchor');
    expect(got.drawings[0].from).toEqual({ xFrac: 0.1, yFrac: 0.1 });
  });
  it('are not read from any other text, and bad fields are checked as in a file', () => {
    expect(objectsFromText('Hello', false)).toBeNull();
    expect(objectsFromText('{"type":"other"}', false)).toBeNull();
    expect(objectsFromText('{"type":"octavaplot/objects","annotations":[],"drawings":[]}', false)).toBeNull();
    const bad = objectsFromText(JSON.stringify({ type: 'octavaplot/objects', annotations: [{ id: 'a', text: 'x', xFrac: 7, color: 'red' }] }), false)!;
    expect(bad.annotations[0]).toMatchObject({ xFrac: 1, color: '#000000' });
  });
  it('are moved 2% further on each paste of the same copy, and counted in words', () => {
    const text = objectsToText({ annotations: [note], drawings: [] });
    expect(pasteStep(text)).toBeCloseTo(0.02);
    expect(pasteStep(text)).toBeCloseTo(0.04);
    expect(pasteStep('other')).toBeCloseTo(0.02);
    expect(objectsCount({ annotations: [note, note], drawings: [shape] })).toBe('2 texts and 1 shape');
    expect(objectsCount({ annotations: [], drawings: [shape] })).toBe('1 shape');
  });
});
