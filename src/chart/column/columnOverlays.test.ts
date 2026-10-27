import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../../model/defaults';
import { patchStyle } from '../../state/commands';
import { buildColumnModel } from './columnModel';
import { compileColumnPointLabels, compileColumnSelection } from './columnMarks';
import type { SceneElement } from '../shared/scene/sceneElement';

const ex = createExampleProject();
const p = patchStyle(ex.charts[0].id, 'all', { showSymbols: true, showPointLabels: true, pointLabelSource: 'value' } as never)(ex);
const chart = p.charts[0];
const model = buildColumnModel(chart, p.dataTables[0]);
const all = (nodes: ReadonlyArray<SceneElement>): SceneElement[] => nodes.flatMap((n) => [n, ...all(n.children ?? [])]);

describe('the point labels of a column chart as scene elements', () => {
  it('are one group with a hit target and a stable id for each label, and nothing without labels', () => {
    const nodes = all(compileColumnPointLabels(chart, model));
    const groups = nodes.filter((n) => n.hit?.kind === 'label');
    expect(model.labels.items.length).toBeGreaterThan(0);
    expect(groups).toHaveLength(model.labels.items.length);
    expect(groups.map((g) => g.hit!.objectId)).toEqual(model.labels.items.map((i) => i.id));
    expect(new Set(groups.map((g) => g.id)).size).toBe(groups.length);
    expect(nodes.filter((n) => n.tag === 'text').map((n) => n.text)).toEqual(model.labels.items.map((i) => i.shown));
    expect(nodes.filter((n) => n.editorOnly)).toHaveLength(groups.length);
    const bare = buildColumnModel(p.charts[0], p.dataTables[0]);
    expect(compileColumnPointLabels(chart, { ...bare, labels: { ...bare.labels, items: [] } })).toEqual([]);
  });
});

describe('the editor selection marks of a column chart', () => {
  it('are none for nothing selected, and all editor-only otherwise', () => {
    expect(compileColumnSelection(model, null, null)).toEqual([]);
    const pid = model.labels.items[0].id;
    const sel = compileColumnSelection(model, model.groups[0].groupId, pid);
    expect(sel.map((n) => n.tag)).toEqual(['circle', 'rect', 'rect']);
    expect(sel.every((n) => n.editorOnly)).toBe(true);
    expect(compileColumnSelection(model, null, 'nobody')).toEqual([]);
  });
});
