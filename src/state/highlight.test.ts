import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../model/defaults';
import { HIGHLIGHTS } from '../model/project/highlight';
import { addAnalysis, addLayout, duplicateTable, setHighlight } from './commands';
import { parseProject, stringifyProject } from './serialize';
import type { Project } from '../model/types';

const withEverything = (): Project => {
  let p = createExampleProject();
  p = addAnalysis('a1', p.dataTables[0].id, 'descriptive')(p);
  p = addLayout('l1', { orientation: 'landscape', arrangement: { kind: 'grid', cols: 2, rows: 1 } } as never)(p);
  return p;
};

describe('highlighting an item of the navigator', () => {
  it('marks a table, a graph, a result and a layout, and clears the mark', () => {
    let p = withEverything();
    const [t, c] = [p.dataTables[0].id, p.charts[0].id];
    p = setHighlight('table', t, 'yellow')(p);
    p = setHighlight('chart', c, 'blue')(p);
    p = setHighlight('analysis', 'a1', 'green')(p);
    p = setHighlight('layout', 'l1', 'purple')(p);
    expect([p.dataTables[0].highlight, p.charts[0].highlight, p.analyses![0].highlight, p.layouts![0].highlight]).toEqual(['yellow', 'blue', 'green', 'purple']);
    p = setHighlight('table', t, null)(p);
    expect('highlight' in p.dataTables[0]).toBe(false);
    // The same colour again changes nothing; a colour that is not known is ignored.
    const once = setHighlight('chart', c, 'blue')(p);
    expect(once).toBe(p);
    expect(setHighlight('chart', c, 'pink' as never)(p)).toBe(p);
  });

  it('is kept by a copy and by a saved file, and a colour this version does not know is dropped', () => {
    let p = withEverything();
    p = setHighlight('table', p.dataTables[0].id, 'orange')(p);
    p = setHighlight('chart', p.charts[0].id, 'gray')(p);
    p = setHighlight('analysis', 'a1', 'red')(p);
    p = setHighlight('layout', 'l1', 'yellow')(p);
    expect(duplicateTable(p.dataTables[0].id, 'copy')(p).dataTables.find((x) => x.id === 'copy')?.highlight).toBe('orange');
    const back = parseProject(stringifyProject(p));
    expect([back.dataTables[0].highlight, back.charts[0].highlight, back.analyses![0].highlight, back.layouts![0].highlight]).toEqual(['orange', 'gray', 'red', 'yellow']);
    const text = JSON.parse(stringifyProject(p));
    text.project.dataTables[0].highlight = 'pink';
    text.project.charts[0].highlight = 7;
    text.project.analyses[0].highlight = 'pink';
    text.project.layouts[0].highlight = null;
    const dropped = parseProject(JSON.stringify(text));
    expect([dropped.dataTables[0].highlight, dropped.charts[0].highlight, dropped.analyses![0].highlight, dropped.layouts![0].highlight]).toEqual([undefined, undefined, undefined, undefined]);
  });

  it('has seven colours with different names and colours', () => {
    expect(HIGHLIGHTS.map((h) => h.id)).toEqual(['yellow', 'red', 'blue', 'green', 'purple', 'orange', 'gray']);
    expect(new Set(HIGHLIGHTS.map((h) => h.color)).size).toBe(7);
  });
});
