import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../model/defaults';
import { historyReducer, initialHistory, scopeCoalesceKey } from './history';
import { patchChart } from './commands';

describe('undo transactions', () => {
  it('does not merge title edits on different charts made within the coalescing window', () => {
    const p = createExampleProject();
    const [a, b] = [p.charts[0], { ...p.charts[0], id: 'chart-b' }];
    const withTwo = { ...p, charts: [a, b] };
    const key = (id: string) => scopeCoalesceKey({ view: { kind: 'chart', id }, selection: { kind: 'chart' } }, 'chart:title');
    let h = initialHistory(withTwo);
    h = historyReducer(h, { type: 'commit', label: 'Title A', command: patchChart(a.id, { title: 'A' }), coalesceKey: key(a.id), now: 0 });
    h = historyReducer(h, { type: 'commit', label: 'Title B', command: patchChart(b.id, { title: 'B' }), coalesceKey: key(b.id), now: 100 });
    expect(h.past).toHaveLength(2);
    h = historyReducer(h, { type: 'undo' });
    expect(h.present.charts[0].title).toBe('A');
    expect(h.present.charts[1].title).toBe(a.title);
  });
  it('still merges consecutive edits of the same object', () => {
    const p = createExampleProject();
    const key = scopeCoalesceKey({ view: { kind: 'chart', id: p.charts[0].id }, selection: { kind: 'chart' } }, 'chart:title');
    let h = initialHistory(p);
    h = historyReducer(h, { type: 'commit', label: 'T', command: patchChart(p.charts[0].id, { title: 'A' }), coalesceKey: key, now: 0 });
    h = historyReducer(h, { type: 'commit', label: 'T', command: patchChart(p.charts[0].id, { title: 'AB' }), coalesceKey: key, now: 100 });
    expect(h.past).toHaveLength(1);
  });
});
