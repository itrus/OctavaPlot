import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { SceneElements } from './SceneElements';
import { el, type SceneElement } from './sceneElement';
import { RUN_SIZE, sameRun, type RunProps } from './sceneRuns';

const dots = (n: number): SceneElement[] => Array.from({ length: n }, (_, i) => el('path', [['d', `M${i},0h1`], ['fill', '#123']], { id: `dot-${i}`, hit: { kind: 'point', groupId: 'g', objectId: `o${i}` } }));
const markup = (nodes: SceneElement[], editor = true) => renderToStaticMarkup(createElement(SceneElements, { nodes, editor }));

describe('long lists of shapes are written in runs', () => {
  it('writes exactly the markup of the same shapes one by one, in order, with no wrapper element', () => {
    const nodes = dots(RUN_SIZE * 3 + 7);
    const one = nodes.map((n) => markup([n])).join('');
    expect(markup(nodes)).toBe(one);
    expect(markup([el('g', [['clip-path', 'url(#c)']], { children: nodes })])).toBe(`<g clip-path="url(#c)">${one}</g>`);
  });

  it('writes the same markup without the editor, and with a selected data set', () => {
    const nodes = [...dots(RUN_SIZE + 5), el('rect', [['x', 1]], { whenSelected: 'g' })];
    expect(markup(nodes, false)).toBe(nodes.map((n) => markup([n], false)).join(''));
    const sel = (n: SceneElement[]) => renderToStaticMarkup(createElement(SceneElements, { nodes: n, editor: true, selectedGroups: new Set(['g']) }));
    expect(sel(nodes)).toBe(nodes.map((n) => sel([n])).join(''));
    expect(sel(nodes)).toContain('<rect');
  });

  it('skips a run only when its shapes are the very same objects and nothing it reads has changed', () => {
    const nodes = dots(10);
    const props: RunProps = { nodes, start: 0, editor: true, selectedGroups: new Set(['g']), selectedAnnotations: new Set<string>(), prefix: '' };
    expect(sameRun(props, { ...props, nodes: [...nodes], selectedGroups: new Set(['g']) })).toBe(true);
    expect(sameRun(props, { ...props, nodes: [...nodes.slice(0, 9), { ...nodes[9] }] })).toBe(false);
    expect(sameRun(props, { ...props, nodes: nodes.slice(0, 9) })).toBe(false);
    expect(sameRun(props, { ...props, editor: false })).toBe(false);
    expect(sameRun(props, { ...props, prefix: 'p-' })).toBe(false);
    expect(sameRun(props, { ...props, start: 10 })).toBe(false);
    expect(sameRun(props, { ...props, selectedAnnotations: new Set(['a']) })).toBe(false);
    expect(sameRun({ ...props, selectedAnnotations: new Set(['a', 'b']) }, { ...props, selectedAnnotations: new Set(['b', 'a']) })).toBe(true);
    expect(sameRun(props, { ...props, selectedGroups: new Set(['h']) })).toBe(false);
    expect(sameRun(props, { ...props, selectedGroups: new Set() })).toBe(false);
  });
});
