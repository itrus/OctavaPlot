import { describe, expect, it } from 'vitest';
import type { Annotation } from '../../../model/types';
import { annotationElements } from './annotations';
import type { SceneElement } from './sceneElement';

const note = (over: Partial<Annotation> = {}): Annotation => ({ id: 'a1', text: 'one\n\nthree', xFrac: 0.5, yFrac: 0.25, fontSizePt: 10, color: '#112233', opacity: 1, ...over }) as Annotation;

const attr = (n: SceneElement, name: string) => n.attrs?.find(([k]) => k === name)?.[1];

describe('annotationElements', () => {
  it('writes one group per annotation, with its stable id and hit target', () => {
    const [g] = annotationElements([note()], 400, 200);
    expect(g.tag).toBe('g');
    expect(g.id).toContain('a1');
    expect(g.hit).toEqual({ kind: 'annotation', annotationId: 'a1' });
  });

  it('positions text at fractions of the size and keeps empty lines', () => {
    const text = annotationElements([note()], 400, 200)[0].children!.find((c) => c.tag === 'text')!;
    expect(attr(text, 'x')).toBe('200');
    expect(attr(text, 'fill-opacity')).toBeUndefined();
    expect(text.children!.map((t) => t.text)).toEqual(['one', ' ', 'three']);
    expect(attr(text.children![0], 'y')).toBe('59');
  });

  it('takes the live drag position as a parameter', () => {
    const text = annotationElements([note()], 400, 200, { id: 'a1', xFrac: 0.1, yFrac: 0.1 })[0].children!.find((c) => c.tag === 'text')!;
    expect(attr(text, 'x')).toBe('40');
    const other = annotationElements([note()], 400, 200, { id: 'zz', xFrac: 0.1, yFrac: 0.1 })[0].children!.find((c) => c.tag === 'text')!;
    expect(attr(other, 'x')).toBe('200');
  });

  it('keeps the hit pad and the selection frame to the editor', () => {
    const kids = annotationElements([note({ opacity: 0.5 })], 400, 200)[0].children!;
    expect(kids.filter((c) => c.editorOnly)).toHaveLength(1);
    expect(kids.find((c) => c.whenAnnotationSelected === 'a1')).toBeDefined();
    expect(attr(kids.find((c) => c.tag === 'text')!, 'fill-opacity')).toBe(0.5);
  });
});

describe('the look of a text annotation', () => {
  const textOf = (a: Annotation) => annotationElements([a], 400, 200)[0].children!.find((c) => c.tag === 'text')!;
  it('writes bold, italic and its own font, and nothing for the defaults', () => {
    const t = textOf(note({ bold: true, italic: true, fontFamily: "'Courier New', Courier, monospace" }));
    expect(attr(t, 'font-weight')).toBe('bold');
    expect(attr(t, 'font-style')).toBe('italic');
    expect(attr(t, 'font-family')).toBe("'Courier New', Courier, monospace");
    const plain = textOf(note());
    expect([attr(plain, 'font-weight'), attr(plain, 'font-style'), attr(plain, 'font-family'), attr(plain, 'text-anchor')]).toEqual([undefined, undefined, undefined, undefined]);
  });
  it('spaces the lines by the line spacing, from the same first baseline', () => {
    const ys = (a: Annotation) => textOf(a).children!.map((c) => Number(attr(c, 'y')));
    expect(ys(note())).toEqual([59, 71, 83]);
    expect(ys(note({ lineSpacing: 2 }))).toEqual([59, 79, 99]);
  });
  it('lines up the lines of a centred or right-aligned text inside a box that keeps its left edge', () => {
    const two = 'a\nwider line';
    const left = Number(attr(textOf(note({ text: two })), 'x'));
    const centre = textOf(note({ text: two, align: 'center' }));
    const right = textOf(note({ text: two, align: 'right' }));
    expect(attr(centre, 'text-anchor')).toBe('middle');
    expect(attr(right, 'text-anchor')).toBe('end');
    expect(Number(attr(centre, 'x'))).toBeGreaterThan(left);
    expect(Number(attr(right, 'x'))).toBeGreaterThan(Number(attr(centre, 'x')));
  });
  it('draws an underline as a line under each line that has text, so that every export shows it', () => {
    const g = annotationElements([note({ underline: true })], 400, 200)[0];
    const lines = g.children!.filter((c) => c.tag === 'path');
    expect(lines).toHaveLength(2);
    expect(attr(lines[0], 'stroke')).toBe('#112233');
    expect(annotationElements([note()], 400, 200)[0].children!.some((c) => c.tag === 'path')).toBe(false);
  });
});
