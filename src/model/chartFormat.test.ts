import { describe, expect, it } from 'vitest';
import { addAnnotation, addChartLike, addDataTable, addReferenceLine, patchAxis, patchLook, patchStyle, removeChart, removeTable, setChartType, unlinkChart, type Command } from '../state/commands';
import { historyReducer, initialHistory, type HistoryState } from '../state/history';
import { parseProject, stringifyProject } from '../state/serialize';
import { inheritChart } from './chartFormat';
import { createExampleProject } from './defaults';
import type { Project } from './types';

/** A styled graph of the example table (four data sets) and a second column table. */
function setup(): { p: Project; sourceId: string; t2: string } {
  let p = createExampleProject();
  const c = p.charts[0];
  const [g0, g1] = p.dataTables[0].groups;
  p = patchLook(c.id, { fontFamily: "Georgia, 'Times New Roman', serif", frame: 'box', axisColor: '#112233' })(p);
  p = patchAxis(c.id, 'yAxis', { min: 0, max: 10, title: 'Absorbance', tickFontSizePt: 20 })(p);
  p = patchStyle(c.id, g0.id, { barFill: '#aa0000' })(p);
  p = patchStyle(c.id, g1.id, { barFill: '#00aa00' })(p);
  p = addAnnotation(c.id, { id: 'ann', text: 'note', xFrac: 0.1, yFrac: 0.1, fontSizePt: 12, color: '#000000', opacity: 1 })(p);
  p = addReferenceLine(c.id, { id: 'ref', axis: 'y', value: 3, color: '#000000', widthPt: 1, style: 'solid', opacity: 1, label: '', showLabel: false })(p);
  p = addDataTable('table_2', 'column', { sample: true })(p);
  return { p, sourceId: c.id, t2: 'table_2' };
}

describe('graph like another graph', () => {
  it('takes the format and the style of each data set by position, not the data-specific parts', () => {
    const { p, sourceId, t2 } = setup();
    const q = addChartLike('chart_new', t2, sourceId)(p);
    const made = q.charts.find((c) => c.id === 'chart_new')!;
    const source = q.charts[0];
    const table2 = q.dataTables.find((t) => t.id === t2)!;
    expect(made.dataTableId).toBe(t2);
    expect(made.type).toBe(source.type);
    expect(made.fontFamily).toBe("Georgia, 'Times New Roman', serif");
    expect(made.frame).toBe('box');
    expect(made.axisColor).toBe('#112233');
    expect(made.widthPx).toBe(source.widthPx);
    expect(made.yAxis.tickFontSizePt).toBe(20);
    // Data-specific parts are the new graph's own.
    expect(made.yAxis.min).toBeNull();
    expect(made.yAxis.max).toBeNull();
    expect(made.yAxis.title).not.toBe('Absorbance');
    expect(made.title).toBe(table2.name);
    expect(made.name).toBe(table2.name);
    expect(made.annotations).toEqual([]);
    expect(made.referenceLines).toEqual([]);
    // The first two data sets of the new table are styled like the first two of the source.
    const overrides = made.layers[0].groupOverrides;
    expect(overrides[table2.groups[0].id]?.barFill).toBe('#aa0000');
    expect(overrides[table2.groups[1].id]?.barFill).toBe('#00aa00');
    expect(Object.keys(overrides).every((id) => table2.groups.some((g) => g.id === id))).toBe(true);
    // The source is untouched, and the two graphs share nothing.
    expect(source.yAxis.min).toBe(0);
    expect(made.layers[0]).not.toBe(source.layers[0]);
    expect(made.layers[0].id).not.toBe(source.layers[0].id);
  });
  it('takes only the general format from a table of another type', () => {
    let { p, sourceId } = setup();
    p = addDataTable('table_xy', 'xy', { sample: true })(p);
    const made = addChartLike('chart_xy', 'table_xy', sourceId)(p).charts.find((c) => c.id === 'chart_xy')!;
    const source = p.charts[0];
    expect(made.fontFamily).toBe("Georgia, 'Times New Roman', serif");
    expect(made.frame).toBe('box');
    expect(made.widthPx).toBe(source.widthPx);
    expect(made.type).not.toBe(source.type);
    expect(made.layers[0].groupOverrides).toEqual({});
    expect(made.yAxis.min).toBeNull();
    expect(made.yAxis.tickFontSizePt).toBe(20);
  });
  it('maps the styles of single objects of a data set (:bar, :mean) and drops those of single values', () => {
    const { p, sourceId, t2 } = setup();
    const source = p.charts.find((c) => c.id === sourceId)!;
    const [sg, tg] = [p.dataTables[0].groups[0], p.dataTables.find((t) => t.id === t2)!.groups[0]];
    const withObjects = {
      ...p,
      charts: p.charts.map((c) => (c.id === sourceId ? { ...c, layers: [{ ...c.layers[0], objectOverrides: { [`${sg.id}:bar`]: { barFill: '#123456' }, [sg.observations[0].id]: { symbolColor: '#654321' } } }] } : c)),
    };
    const made = inheritChart(withObjects.charts.find((c) => c.id === sourceId)!, p.dataTables[0], p.dataTables.find((t) => t.id === t2)!, 'x');
    expect(made.layers[0].objectOverrides).toEqual({ [`${tg.id}:bar`]: { barFill: '#123456' } });
    expect(source.layers[0].objectOverrides).toEqual({});
  });
  it('does nothing when the graph or the table is missing, and is undone by removing it', () => {
    const { p, sourceId, t2 } = setup();
    expect(addChartLike('x', 'nope', sourceId)(p)).toBe(p);
    expect(addChartLike('x', t2, 'nope')(p)).toBe(p);
    const q = addChartLike('chart_new', t2, sourceId)(p);
    expect(removeTable(t2)(q).charts.some((c) => c.id === 'chart_new')).toBe(false);
  });
  it('survives save and load', () => {
    const { p, sourceId, t2 } = setup();
    const q = addChartLike('chart_new', t2, sourceId)(p);
    expect(parseProject(stringifyProject(q)).charts.find((c) => c.id === 'chart_new')).toEqual(q.charts.find((c) => c.id === 'chart_new'));
  });
  it('keeps the chart type of the source when it suits the table', () => {
    let { p, sourceId, t2 } = setup();
    p = setChartType(sourceId, 'scatter')(p);
    const made = addChartLike('chart_new', t2, sourceId)(p).charts.find((c) => c.id === 'chart_new')!;
    expect(made.type).toBe('scatter');
  });
});

describe('linked graphs', () => {
  const commit = (h: HistoryState, command: Command): HistoryState => historyReducer(h, { type: 'commit', label: 'x', command, now: 0 });
  /** Source graph, and a second table with a graph linked to it. */
  function linked(): { h: HistoryState; sourceId: string } {
    const { p, sourceId, t2 } = setup();
    const h = commit(initialHistory(p), addChartLike('child', t2, sourceId));
    return { h, sourceId };
  }
  const child = (h: HistoryState) => h.present.charts.find((c) => c.id === 'child')!;

  it('marks the new graph as linked, unless asked not to', () => {
    const { h, sourceId } = linked();
    expect(child(h).linkedTo).toBe(sourceId);
    const { p, t2 } = setup();
    expect(addChartLike('c2', t2, p.charts[0].id, false)(p).charts.find((c) => c.id === 'c2')!.linkedTo).toBeUndefined();
  });
  it('follows a change to a detail of the source that it has not changed itself', () => {
    let { h, sourceId } = linked();
    h = commit(h, patchLook(sourceId, { frame: 'none', axisColor: '#abcdef' }));
    expect(child(h).frame).toBe('none');
    expect(child(h).axisColor).toBe('#abcdef');
    h = commit(h, patchAxis(sourceId, 'yAxis', { tickFontSizePt: 31 }));
    expect(child(h).yAxis.tickFontSizePt).toBe(31);
  });
  it('keeps a detail it changed itself, and follows again when it is set back to the same as the source', () => {
    let { h, sourceId } = linked();
    h = commit(h, patchLook('child', { axisColor: '#222222' }));
    h = commit(h, patchLook(sourceId, { axisColor: '#333333' }));
    expect(child(h).axisColor).toBe('#222222');
    // The other details are still followed.
    h = commit(h, patchLook(sourceId, { plotColor: '#eeeeee' }));
    expect(child(h).plotColor).toBe('#eeeeee');
    // Set to what the source has now, it follows again.
    h = commit(h, patchLook('child', { axisColor: '#333333' }));
    h = commit(h, patchLook(sourceId, { axisColor: '#444444' }));
    expect(child(h).axisColor).toBe('#444444');
  });
  it('follows the style of a data set by position, and keeps the style the child gave it', () => {
    let { h, sourceId } = linked();
    const t2 = h.present.dataTables.find((t) => t.id === 'table_2')!;
    const [src0, src1] = h.present.dataTables[0].groups;
    h = commit(h, patchStyle(sourceId, src0.id, { barFill: '#101010' }));
    expect(child(h).layers[0].groupOverrides[t2.groups[0].id]?.barFill).toBe('#101010');
    h = commit(h, patchStyle('child', t2.groups[1].id, { barFill: '#202020' }));
    h = commit(h, patchStyle(sourceId, src1.id, { barFill: '#303030' }));
    expect(child(h).layers[0].groupOverrides[t2.groups[1].id]?.barFill).toBe('#202020');
  });
  it('never inherits what belongs to the data', () => {
    let { h, sourceId } = linked();
    h = commit(h, patchAxis(sourceId, 'yAxis', { min: 5, max: 6, title: 'Other' }));
    h = commit(h, addAnnotation(sourceId, { id: 'a2', text: 'x', xFrac: 0, yFrac: 0, fontSizePt: 10, color: '#000000', opacity: 1 }));
    expect(child(h).yAxis.min).toBeNull();
    expect(child(h).yAxis.title).not.toBe('Other');
    expect(child(h).annotations).toEqual([]);
  });
  it('is one undo step with the change that caused it', () => {
    let { h, sourceId } = linked();
    h = commit(h, patchLook(sourceId, { axisColor: '#abcdef' }));
    h = historyReducer(h, { type: 'undo' });
    expect(child(h).axisColor).not.toBe('#abcdef');
    expect(h.present.charts.find((c) => c.id === sourceId)!.axisColor).not.toBe('#abcdef');
  });
  it('stops following once unlinked, and a link to a deleted graph disappears', () => {
    let { h, sourceId } = linked();
    h = commit(h, unlinkChart('child'));
    expect(child(h).linkedTo).toBeUndefined();
    h = commit(h, patchLook(sourceId, { axisColor: '#abcdef' }));
    expect(child(h).axisColor).not.toBe('#abcdef');
    const again = linked();
    const gone = commit(again.h, removeChart(again.sourceId));
    expect(child(gone).linkedTo).toBeUndefined();
  });
  it('follows through a chain of links', () => {
    let { h, sourceId } = linked();
    h = commit(h, addChartLike('grandchild', 'table_2', 'child'));
    h = commit(h, patchLook(sourceId, { axisColor: '#123abc' }));
    expect(h.present.charts.find((c) => c.id === 'grandchild')!.axisColor).toBe('#123abc');
  });
  it('is kept in the file, and a bad link is dropped on opening', () => {
    const { h } = linked();
    expect(parseProject(stringifyProject(h.present)).charts.find((c) => c.id === 'child')!.linkedTo).toBe(h.present.charts[0].id);
    const env = JSON.parse(stringifyProject(h.present));
    env.project.charts.find((c: { id: string }) => c.id === 'child').linkedTo = 'child';
    expect(parseProject(JSON.stringify(env)).charts.find((c) => c.id === 'child')!.linkedTo).toBeUndefined();
    env.project.charts.find((c: { id: string }) => c.id === 'child').linkedTo = 'nowhere';
    expect(parseProject(JSON.stringify(env)).charts.find((c) => c.id === 'child')!.linkedTo).toBeUndefined();
  });
});
