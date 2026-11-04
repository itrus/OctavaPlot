import { afterEach, describe, expect, it, vi } from 'vitest';
import { chartToSvgString } from '../chart/export/export';
import { formatLabelValue } from '../chart/shared/parts/labels';
import { createExampleProject, DEFAULT_STYLE, DEFAULT_SUMMARY } from '../model/defaults';
import type { Project } from '../model/types';
import { AUTOSAVE_KEY, loadAutosave, parseProject, parseProjectWithNotes, stringifyProject } from './serialize';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = Record<string, any>;

const layer0 = (p: Project) => p.charts[0].layers[0];

describe('version', () => {
  it('writes format octavaplot-project, version 1', () => {
    const env = JSON.parse(stringifyProject(createExampleProject()));
    expect(env.format).toBe('octavaplot-project');
    expect(env.version).toBe(1);
  });
  it('reads version 1 only', () => {
    const env = JSON.parse(stringifyProject(createExampleProject()));
    for (const version of [0, 2, 3, '1', null]) expect(() => parseProject(JSON.stringify({ ...env, version }))).toThrow(/version/);
    expect(() => parseProject(JSON.stringify({ ...env, format: 'other-project' }))).toThrow(/format/);
  });
  it('round trips and a valid project has no notes', () => {
    const p = createExampleProject();
    const r = parseProjectWithNotes(stringifyProject(p));
    expect(r.notes).toEqual([]);
    expect(r.project).toEqual(p);
  });
});

describe('stored values', () => {
  const stored = (mutate: (l: Any) => void) => {
    const j = JSON.parse(stringifyProject(createExampleProject())) as Any;
    mutate(j.project.charts[0].layers[0]);
    return JSON.stringify(j);
  };
  it('drops invalid summary values with a note', () => {
    const r = parseProjectWithNotes(
      stored((l) => {
        l.summary = { centre: 'median', spread: 'bogus', confidenceLevel: 5 };
        l.groupSummary = JSON.parse('{"a":{"spread":"sd","centre":"x"},"b":"nope","__proto__":{"spread":"sd"}}');
      }),
    );
    expect(layer0(r.project).summary).toEqual({ ...DEFAULT_SUMMARY, centre: 'median' });
    expect(layer0(r.project).groupSummary).toEqual({ a: { spread: 'sd' } });
    expect(r.notes.length).toBeGreaterThan(0);
  });
  it('a stored spread is kept', () => {
    const p = parseProject(stored((l) => (l.summary = { ...DEFAULT_SUMMARY, spread: 'iqr' })));
    expect(layer0(p).summary.spread).toBe('iqr');
  });
  it('invalid style enums are dropped with notes', () => {
    const r = parseProjectWithNotes(
      stored((l) => {
        l.style.symbolShape = 'blob';
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
      stored((l) => {
        l.groupOverrides = JSON.parse('{"a":{"errorCap":"x"},"__proto__":{"barFill":"#000000"},"b":5}');
      }),
    );
    expect(layer0(r).groupOverrides).toEqual({ a: {} });
    expect(Object.getPrototypeOf(layer0(r).groupOverrides)).toBe(Object.prototype);
  });
});

describe('rows', () => {
  const rowsOf = (p: Project) => p.dataTables[0].rows;
  const titled = () => {
    const p = createExampleProject();
    p.dataTables[0].rows[2] = { ...p.dataTables[0].rows[2], title: 'Sample 3' };
    return p;
  };
  const fileJson = (p: Project = titled()) => JSON.parse(stringifyProject(p)) as Any;
  it('a file without a rows list has one empty row for each value', () => {
    const env = fileJson(createExampleProject());
    expect(env.project.dataTables[0].rows).toBeUndefined();
    const p = parseProject(JSON.stringify(env));
    expect(rowsOf(p)).toHaveLength(p.dataTables[0].rowCount);
    expect(new Set(rowsOf(p).map((r) => r.id)).size).toBe(rowsOf(p).length);
    expect(rowsOf(p).every((r) => r.title === '')).toBe(true);
  });
  it('writes the rows that have a title and no others', () => {
    expect(fileJson().project.dataTables[0].rows).toEqual([[2, 'Sample 3']]);
  });
  it('round trips titles and ids', () => {
    const p = titled();
    const q = parseProject(stringifyProject(p));
    expect(q).toEqual(p);
    expect(rowsOf(q)[2].title).toBe('Sample 3');
  });
  it('writes the ID of a row that is not at its place, and reads it back', () => {
    const p = titled();
    p.dataTables[0].rows[1] = { ...p.dataTables[0].rows[1], id: 'row_moved' };
    expect(fileJson(p).project.dataTables[0].rows).toEqual([[1, '', 'row_moved'], [2, 'Sample 3']]);
    expect(parseProject(stringifyProject(p))).toEqual(p);
  });
  it('sanitises titles on load', () => {
    const j = fileJson();
    j.project.dataTables[0].rows = [[0, ' a\r\n b\u0000 '], [1, '   ']];
    const p = parseProject(JSON.stringify(j));
    expect(rowsOf(p)[0].title).toBe('a b');
    expect(rowsOf(p)[1].title).toBe('');
  });
  it('rejects malformed rows', () => {
    const bad = (rows: unknown) => {
      const j = fileJson();
      j.project.dataTables[0].rows = rows;
      return () => parseProject(JSON.stringify(j));
    };
    expect(bad([[99999, 'x']])).toThrow(/row index/);
    expect(bad([[-1, 'x']])).toThrow(/row index/);
    expect(bad([[1.5, 'x']])).toThrow(/row index/);
    expect(bad([[3, 'x'], [2, 'y']])).toThrow(/larger than/);
    expect(bad([[2, 'x'], [2, 'y']])).toThrow(/larger than/);
    expect(bad([[1, 'x', '']])).toThrow(/empty/);
    expect(bad([[1, 'x', 'same'], [2, 'y', 'same']])).toThrow(/another one/);
    expect(bad([[1, 5]])).toThrow(/string/);
    expect(bad([[1]])).toThrow(/entries/);
    expect(bad([{ id: 'r', title: 'x' }])).toThrow(/array/);
    expect(bad('nope')).toThrow(/rows/);
  });
});

describe('autosave', () => {
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

  it('loads the project back from its one key', () => {
    const p = createExampleProject();
    const data = fakeStorage({ [AUTOSAVE_KEY]: stringifyProject(p) });
    expect([...data.keys()]).toEqual([AUTOSAVE_KEY]);
    expect(loadAutosave()).toEqual(p);
  });
  it('loads nothing from an empty or damaged store', () => {
    fakeStorage();
    expect(loadAutosave()).toBeNull();
    fakeStorage({ [AUTOSAVE_KEY]: '{not json' });
    expect(loadAutosave()).toBeNull();
  });
});

describe('malformed persisted fields', () => {
  const build = (mutate: (p: Any) => void) => {
    const p = JSON.parse(JSON.stringify(createExampleProject())) as Any;
    mutate(p);
    return stringifyProject(p as unknown as Project);
  };
  it('drops null annotations, coerces numeric text and notes both', () => {
    const r = parseProjectWithNotes(build((p) => (p.charts[0].annotations = [null, { id: 'a1', text: 42, xFrac: 2, yFrac: 'x', fontSizePt: -1, color: 'red' }])));
    const a = r.project.charts[0].annotations;
    expect(a).toHaveLength(1);
    expect(a[0]).toEqual({ id: 'a1', text: '42', xFrac: 1, yFrac: 0.5, fontSizePt: 24, color: '#000000', opacity: 1 });
    expect(r.notes.some((n) => n.includes('annotations[0]'))).toBe(true);
    expect(() => chartToSvgString(r.project.charts[0], r.project.dataTables[0])).not.toThrow();
  });
  it('keeps a reference line bound to a result, and drops the binding (with a note) when it cannot be read', () => {
    const line = { id: 'r1', axis: 'y', value: 3, color: '#000000', widthPt: 2, style: 'dashed', opacity: 1, label: 'mean {{mean Control}}', showLabel: true };
    const ok = parseProjectWithNotes(build((p) => (p.charts[0].referenceLines = [{ ...line, valueFrom: { stat: 'sem', groupId: 'g1' } }])));
    expect(ok.project.charts[0].referenceLines[0].valueFrom).toEqual({ stat: 'sem', groupId: 'g1' });
    expect(ok.notes).toEqual([]);
    for (const bad of [{ stat: 'mode', groupId: 'g1' }, { stat: 'mean' }, 'mean']) {
      const r = parseProjectWithNotes(build((p) => (p.charts[0].referenceLines = [{ ...line, valueFrom: bad }])));
      expect(r.project.charts[0].referenceLines[0]).not.toHaveProperty('valueFrom');
      expect(r.project.charts[0].referenceLines[0].value).toBe(3);
      expect(r.notes.some((n) => n.includes('referenceLines[0].valueFrom'))).toBe(true);
    }
    expect(parseProjectWithNotes(build((p) => (p.charts[0].referenceLines = [line]))).notes).toEqual([]);
  });
  it('drops display names that are not text', () => {
    const r = parseProjectWithNotes(build((p) => (p.charts[0].displayNames = { a: { x: 1 }, b: 'ok' })));
    expect(r.project.charts[0].displayNames).toEqual({ b: 'ok' });
    expect(r.notes.length).toBeGreaterThan(0);
  });
  it('rejects repeated table, graph and observation IDs', () => {
    expect(() => parseProject(build((p) => p.dataTables.push(JSON.parse(JSON.stringify(p.dataTables[0])))))).toThrow(/same ID/);
    expect(() => parseProject(build((p) => p.charts.push(JSON.parse(JSON.stringify(p.charts[0])))))).toThrow(/same ID/);
    expect(() => parseProject(build((p) => p.dataTables[0].groups[0].observations.slice(0, 2).forEach((o: Any) => (o.id = 'twice'))))).toThrow(/ID twice/);
  });
});

describe('table size limits in a file', () => {
  const withTable = (patch: Any) => {
    const raw = JSON.parse(stringifyProject(createExampleProject())) as Any;
    Object.assign(raw.project.dataTables[0], patch);
    return JSON.stringify(raw);
  };
  it('refuses a huge declared rowCount quickly, naming the path and the limit', () => {
    const t0 = performance.now();
    expect(() => parseProject(withTable({ rowCount: 1e9, rows: undefined }))).toThrow(/dataTables\[0\]\.rowCount.*100,000/);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
  it('refuses a rowCount times columns past the cell limit', () => {
    const raw = JSON.parse(stringifyProject(createExampleProject())) as Any;
    const t = raw.project.dataTables[0];
    t.rowCount = 100000;
    t.groups = Array.from({ length: 300 }, (_, i) => ({ id: `g${i}`, name: `G${i}`, observations: [] }));
    expect(() => parseProject(JSON.stringify(raw))).toThrow(/dataTables\[0\].*20,000,000 cells/);
  });
});
