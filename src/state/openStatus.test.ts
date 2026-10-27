import { describe, expect, it } from 'vitest';
import { openedStatus, refusedStatus } from './openStatus';
import { parseProjectWithNotes } from './serialize';

describe('status after opening', () => {
  it('a clean file says only that it was opened', () => expect(openedStatus('a.oplot', [])).toBe('Opened a.oplot.'));
  it('one repair is named', () => {
    expect(openedStatus('a.oplot', ['project.charts[2].heatmap.palette was reset.'])).toBe('Opened a.oplot. 1 stored value was reset to defaults: project.charts[2].heatmap.palette was reset.');
  });
  it('several repairs give the count, the first and a pointer to the rest', () => {
    const s = openedStatus('a.oplot', ['one', 'two', 'three']);
    expect(s).toMatch(/3 stored values were reset/);
    expect(s).toMatch(/: one /);
    expect(s).toMatch(/2 more: see Details/);
  });
  it('a refusal names the file, the path and says the open project stays', () => {
    let err: unknown;
    try {
      parseProjectWithNotes('{"format":"octavaplot-project","version":1,"project":{"id":"p","dataTables":[],"charts":[]}}');
    } catch (e) {
      err = e;
    }
    const s = refusedStatus('b.oplot', err);
    expect(s).toMatch(/^b\.oplot was not opened\. Invalid project file: project\.dataTables/);
    expect(s).toMatch(/open project was not changed\.$/);
  });
});
