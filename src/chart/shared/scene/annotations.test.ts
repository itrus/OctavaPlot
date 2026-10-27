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
