import { afterEach, describe, expect, it, vi } from 'vitest';
import { chartToSvgString } from '../chart/export';
import { formatLabelValue } from '../chart/labels';
import { createExampleProject, DEFAULT_STYLE, DEFAULT_SUMMARY } from '../model/defaults';
import type { Project } from '../model/types';
import { AUTOSAVE_KEY, loadAutosave, parseProject, parseProjectWithNotes, saveAutosave, stringifyProject } from './serialize';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = Record<string, any>;

/** A version 1 file: layers without summary, errorType in styles. */
function v1Text(mutate?: (p: Any) => void): string {
  const p = JSON.parse(JSON.stringify(createExampleProject())) as Any;
  for (const c of p.charts) {
    for (const l of c.layers) {
      delete l.summary;
      delete l.groupSummary;
    }
  }
  mutate?.(p);
  return JSON.stringify({ format: 'scientific-plotter-project', version: 1, project: p });
}
const layer0 = (p: Project) => p.charts[0].layers[0];

describe('version', () => {
  it('writes version 2', () => {
    const env = JSON.parse(stringifyProject(createExampleProject()));
    expect(env.version).toBe(2);
  });
  it('rejects version 3 and 0', () => {
    const env = JSON.parse(stringifyProject(createExampleProject()));
    expect(() => parseProject(JSON.stringify({ ...env, version: 3 }))).toThrow(/not supported/);
    expect(() => parseProject(JSON.stringify({ ...env, version: 0 }))).toThrow(/not supported/);
  });
  it('round trips and a valid project has no notes', () => {
    const p = createExampleProject();
    const r = parseProjectWithNotes(stringifyProject(p));
    expect(r.notes).toEqual([]);
    expect(r.project).toEqual(p);
  });
});

describe('version 1 migration', () => {
  it('loads with default summary', () => {
    const p = parseProject(v1Text());
    expect(layer0(p).summary).toEqual(DEFAULT_SUMMARY);
    expect(layer0(p).groupSummary).toEqual({});
  });
  it('layer errorType wins over defaults errorType', () => {
    const p = parseProject(
      v1Text((j) => {
        j.charts[0].defaults.errorType = 'sem';
        j.charts[0].layers[0].style.errorType = 'sd';
      }),
    );
    expect(layer0(p).summary.spread).toBe('sd');
    const q = parseProject(
      v1Text((j) => {
        j.charts[0].defaults.errorType = 'sem';
      }),
    );
    expect(layer0(q).summary.spread).toBe('sem');
  });
  it('group overrides migrate, object overrides are dropped, equal values kept', () => {
    const p = parseProject(
      v1Text((j) => {
        const l = j.charts[0].layers[0];
        l.style.errorType = 'sd';
        l.groupOverrides = { g1: { errorType: 'sd' }, g2: { errorType: 'bogus' }, g3: { barFill: '#000000' } };
        l.objectOverrides = { o1: { errorType: 'sem' } };
      }),
    );
    expect(layer0(p).groupSummary).toEqual({ g1: { spread: 'sd' } });
  });
});

describe('errorType stripping', () => {
  it('removes errorType from defaults, style, group and object overrides', () => {
    const r = parseProjectWithNotes(
      v1Text((j) => {
        const c = j.charts[0];
        c.defaults.errorType = 'sem';
        const l = c.layers[0];
        l.style.errorType = 'sd';
        l.groupOverrides = { g1: { errorType: 'sd' }, g2: { errorType: 'sd', barFill: '#000000' } };
        l.objectOverrides = { o1: { errorType: 'sem' } };
      }),
    );
    const c = r.project.charts[0];
    expect('errorType' in c.defaults).toBe(false);
    expect('errorType' in c.layers[0].style).toBe(false);
    expect(c.layers[0].groupOverrides).toEqual({ g2: { barFill: '#000000' } });
    expect(c.layers[0].objectOverrides).toEqual({});
    expect(c.layers[0].groupSummary).toEqual({ g1: { spread: 'sd' }, g2: { spread: 'sd' } });
    expect(JSON.stringify(r.project)).not.toContain('errorType');
  });
  it('files without errorType load as stored and without notes', () => {
    const p = createExampleProject();
    const r = parseProjectWithNotes(stringifyProject(p));
    expect(r.project).toEqual(p);
    expect(r.notes).toEqual([]);
  });
});

describe('version 2 sanitising', () => {
  const v2 = (mutate: (l: Any) => void) => {
    const j = JSON.parse(stringifyProject(createExampleProject())) as Any;
    mutate(j.project.charts[0].layers[0]);
    return JSON.stringify(j);
  };
  it('drops invalid summary values with a note', () => {
    const r = parseProjectWithNotes(
      v2((l) => {
        l.summary = { centre: 'median', spread: 'bogus', confidenceLevel: 5 };
        l.groupSummary = JSON.parse('{"a":{"spread":"sd","centre":"x"},"b":"nope","__proto__":{"spread":"sd"}}');
      }),
    );
    expect(layer0(r.project).summary).toEqual({ ...DEFAULT_SUMMARY, centre: 'median' });
    expect(layer0(r.project).groupSummary).toEqual({ a: { spread: 'sd' } });
    expect(r.notes.length).toBeGreaterThan(0);
  });
  it('a legacy errorType in a v2 file wins over the stored summary spread', () => {
    const p = parseProject(
      v2((l) => {
        l.style.errorType = 'sd';
        l.summary = { ...DEFAULT_SUMMARY, spread: 'iqr' };
      }),
    );
    expect(layer0(p).summary.spread).toBe('sd');
  });
  it('a v2 file without errorType keeps its stored spread', () => {
    const p = parseProject(v2((l) => (l.summary = { ...DEFAULT_SUMMARY, spread: 'iqr' })));
    expect(layer0(p).summary.spread).toBe('iqr');
  });
  it('invalid style enums are dropped with notes', () => {
    const r = parseProjectWithNotes(
      v2((l) => {
        l.style.symbolShape = 'star';
        l.groupOverrides = { a: { errorCap: 'x', barFill: '#111111' } };
      }),
    );
    expect(layer0(r.project).style.symbolShape).toBeUndefined();
    expect(layer0(r.project).groupOverrides.a).toEqual({ barFill: '#111111' });
    expect(r.notes).toHaveLength(2);
  });
  it('sanitises malformed label keys so the project loads and renders', () => {
    const j = JSON.parse(stringifyProject(createExampleProject())) as Any;
    for (const c of j.project.charts) {
      Object.assign(c.defaults, {
        showPointLabels: true,
        pointLabelSource: 'value',
        pointLabelDecimals: 1e9,
        pointLabelOffsetXPt: 'a',
        pointLabelPlacement: 'zzz',
        pointLabelCollision: 'zzz',
        pointLabelFontSizePt: null,
        pointLabelColor: 5,
        axisBinding: 'weird',
      });
      c.layers[0].style.pointLabelDecimals = -3;
      c.layers[0].style.pointLabelBold = 'yes';
    }
    const r = parseProjectWithNotes(JSON.stringify(j));
    expect(r.notes.length).toBeGreaterThanOrEqual(7);
    const d = r.project.charts[0].defaults;
    expect(d.pointLabelDecimals).toBe(10);
    expect(d.pointLabelOffsetXPt).toBe(DEFAULT_STYLE.pointLabelOffsetXPt);
    expect(d.pointLabelPlacement).not.toBe('zzz');
    expect(layer0(r.project).style.pointLabelDecimals).toBe(0);
    expect(layer0(r.project).style.pointLabelBold).toBeUndefined();
    for (const c of r.project.charts) {
      const table = r.project.dataTables.find((t) => t.id === c.dataTableId)!;
      expect(() => chartToSvgString(c, table)).not.toThrow();
      expect(chartToSvgString(c, table)).not.toContain('NaN');
    }
  });
  it('formatLabelValue never throws on out-of-range decimals', () => {
    expect(() => formatLabelValue(1.5, 200)).not.toThrow();
    expect(formatLabelValue(1.5, -3)).toBe('1.5');
  });
  it('keeps override entries that become empty and skips __proto__', () => {
    const r = parseProject(
      v2((l) => {
        l.groupOverrides = JSON.parse('{"a":{"errorCap":"x"},"__proto__":{"barFill":"#000000"},"b":5}');
      }),
    );
    expect(layer0(r).groupOverrides).toEqual({ a: {} });
    expect(Object.getPrototypeOf(layer0(r).groupOverrides)).toBe(Object.prototype);
  });
});

describe('rows', () => {
  const rowsOf = (p: Project) => p.dataTables[0].rows;
  const v2Json = () => JSON.parse(stringifyProject(createExampleProject())) as Any;
  const stripRows = (j: Any) => {
    for (const t of j.dataTables) delete t.rows;
  };
  it('v1 and v2 files without rows regenerate them', () => {
    const env = v2Json();
    stripRows(env.project);
    for (const text of [v1Text(stripRows), JSON.stringify(env)]) {
      const p = parseProject(text);
      expect(rowsOf(p)).toHaveLength(p.dataTables[0].rowCount);
      expect(new Set(rowsOf(p).map((r) => r.id)).size).toBe(rowsOf(p).length);
      expect(rowsOf(p).every((r) => r.title === '')).toBe(true);
    }
  });
  it('round trips titles and ids', () => {
    const p = createExampleProject();
    p.dataTables[0].rows[2] = { ...p.dataTables[0].rows[2], title: 'Sample 3' };
    const q = parseProject(stringifyProject(p));
    expect(q).toEqual(p);
    expect(rowsOf(q)[2].title).toBe('Sample 3');
  });
  it('sanitises titles on load', () => {
    const j = v2Json();
    j.project.dataTables[0].rows[0].title = ' a\r\n b\u0000 ';
    j.project.dataTables[0].rows[1].title = 5;
    const p = parseProject(JSON.stringify(j));
    expect(rowsOf(p)[0].title).toBe('a b');
    expect(rowsOf(p)[1].title).toBe('');
  });
  it('rejects malformed rows', () => {
    const bad = (mutate: (rows: Any[]) => unknown) => {
      const j = v2Json();
      const t = j.project.dataTables[0];
      t.rows = mutate(t.rows);
      return () => parseProject(JSON.stringify(j));
    };
    expect(bad((r) => r.slice(1))).toThrow(/Invalid project file: .*rows/);
    expect(bad((r) => [...r, { id: 'extra', title: '' }])).toThrow(/rows/);
    expect(bad((r) => [{ ...r[0], id: r[1].id }, ...r.slice(1)])).toThrow(/duplicated/);
    expect(bad((r) => [{ ...r[0], id: '' }, ...r.slice(1)])).toThrow(/empty/);
    expect(bad((r) => [{ title: 'x' }, ...r.slice(1)])).toThrow(/rows/);
    expect(bad(() => 'nope')).toThrow(/rows/);
  });
});

describe('OctavaPlot rename', () => {
  const fakeStorage = (initial: Record<string, string> = {}) => {
    const data = new Map(Object.entries(initial));
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    });
    return data;
  };
  afterEach(() => vi.unstubAllGlobals());

  it('writes the octavaplot-project format', () => {
    expect(JSON.parse(stringifyProject(createExampleProject())).format).toBe('octavaplot-project');
  });
  it('still opens files written under the old scientific-plotter-project format', () => {
    expect(parseProject(v1Text()).charts).toHaveLength(1);
  });
  it('rejects an unknown format', () => {
    const env = JSON.parse(stringifyProject(createExampleProject()));
    expect(() => parseProject(JSON.stringify({ ...env, format: 'other-project' }))).toThrow(/format/);
  });
  it('loads a pre-rename autosave and moves it to the new key on the next save', () => {
    const p = createExampleProject();
    const data = fakeStorage({ 'scientific-plotter:project:v1': v1Text() });
    expect(loadAutosave()).not.toBeNull();
    expect(saveAutosave(p)).toBe(true);
    expect(data.has(AUTOSAVE_KEY)).toBe(true);
    expect(data.has('scientific-plotter:project:v1')).toBe(false);
  });
  it('prefers the new autosave key when both exist', () => {
    const p = createExampleProject();
    fakeStorage({ [AUTOSAVE_KEY]: stringifyProject(p), 'scientific-plotter:project:v1': v1Text() });
    expect(loadAutosave()?.id).toBe(p.id);
  });
});
