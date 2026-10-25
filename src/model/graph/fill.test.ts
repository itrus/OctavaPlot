import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createChart, createExampleProject, DEFAULT_STYLE, PRESET_KEYS, TYPE_PRESETS } from './defaults';
import {
  describeBarFillUi,
  FILL_LIMITS,
  FILL_PATTERN_OPTIONS,
  FILL_PATTERNS,
  isPatternInvisible,
  legendKeyFill,
  resolveBarFill,
  sanitizeFillKeys,
} from './fill';
import { resolveStyle } from './style';
import type { ChartStyle } from './types';
import { patchStyle, resetStyle, setChartType } from '../state/commands';
import { parseProject, parseProjectWithNotes, stringifyProject } from '../state/serialize';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = Record<string, any>;

const style = (patch: Partial<ChartStyle> = {}): ChartStyle => ({ ...DEFAULT_STYLE, ...patch });
const pattern = (patch: Partial<ChartStyle> = {}) => style({ barFillMode: 'pattern', ...patch });

describe('defaults and options', () => {
  it('fill defaults', () => {
    expect(DEFAULT_STYLE.barFillMode).toBe('solid');
    expect(DEFAULT_STYLE.barPattern).toBe('horizontal');
    expect(DEFAULT_STYLE.barPatternSpacingPt).toBe(8);
    expect(DEFAULT_STYLE.barPatternWidthPt).toBe(2);
    expect(DEFAULT_STYLE.barPatternColor).toBeNull();
    expect(DEFAULT_STYLE.barPatternBackground).toBe('#ffffff');
  });
  it('option list', () => {
    expect(FILL_PATTERN_OPTIONS.map((o) => o.label)).toEqual([
      'Horizontal lines',
      'Vertical lines',
      'Diagonal lines (rising)',
      'Diagonal lines (falling)',
      'Crosshatch',
      'Diagonal crosshatch',
      'Dots',
    ]);
    expect(FILL_PATTERN_OPTIONS.map((o) => o.value)).toEqual([...FILL_PATTERNS]);
  });
  it('PRESET_KEYS unchanged', () => {
    expect([...PRESET_KEYS]).toEqual(['showBars', 'showSymbols', 'showLines', 'showMeanLine']);
  });
});

describe('resolveBarFill', () => {
  it('defaults', () => {
    expect(resolveBarFill(style())).toEqual({
      mode: 'solid',
      solidColor: DEFAULT_STYLE.barFill,
      pattern: 'horizontal',
      spacingPt: 8,
      widthPt: 2,
      markWidthPt: 2,
      patternColor: '#000000',
      background: '#ffffff',
      opacity: 1,
    });
  });
  it('clamps spacing, width and opacity; mark width never exceeds spacing', () => {
    const r = resolveBarFill(pattern({ barPatternSpacingPt: 120, barPatternWidthPt: 18, barOpacity: 3 }));
    expect([r.spacingPt, r.widthPt, r.opacity]).toEqual([FILL_LIMITS.spacingPt.max, FILL_LIMITS.widthPt.max, 1]);
    const lo = resolveBarFill(pattern({ barPatternSpacingPt: 0.4, barPatternWidthPt: 0.02, barOpacity: -1 }));
    expect([lo.spacingPt, lo.widthPt, lo.opacity]).toEqual([2, 0.2, 0]);
    expect(resolveBarFill(pattern({ barPatternSpacingPt: 2, barPatternWidthPt: 10 })).markWidthPt).toBe(2);
  });
  it('is total for invalid values', () => {
    const bad = {
      barFillMode: 'x',
      barPattern: 'y',
      barPatternSpacingPt: NaN,
      barPatternWidthPt: -2,
      barPatternColor: 'red',
      barPatternBackground: 7,
      barOpacity: NaN,
      barBorderColor: 'nope',
    } as unknown as Partial<ChartStyle>;
    const r = resolveBarFill(style(bad));
    expect(r).toMatchObject({ mode: 'solid', pattern: 'horizontal', spacingPt: 8, widthPt: 1, patternColor: '#000000', background: null, opacity: 1 });
  });
  it('pattern colour falls back to the border colour; background null stays null', () => {
    const r = resolveBarFill(pattern({ barBorderColor: '#336699', barPatternBackground: null }));
    expect(r.patternColor).toBe('#336699');
    expect(r.background).toBeNull();
    expect(resolveBarFill(pattern({ barPatternColor: '#ff0000' })).patternColor).toBe('#ff0000');
  });
});

describe('sanitizeFillKeys', () => {
  it('drops only invalid keys', () => {
    const raw = {
      barFillMode: 'sideways',
      barPattern: 'dots',
      barPatternSpacingPt: 0,
      barPatternWidthPt: NaN,
      barPatternColor: 'red',
      barPatternBackground: '#ABCDEF',
      showBars: false,
    };
    const { style: s, dropped } = sanitizeFillKeys(raw);
    expect(dropped).toEqual(['barFillMode', 'barPatternSpacingPt', 'barPatternWidthPt', 'barPatternColor']);
    expect(s).toEqual({ barPattern: 'dots', barPatternBackground: '#ABCDEF', showBars: false });
    expect(raw.barFillMode).toBe('sideways');
  });
  it('keeps values outside the P limits and nulls', () => {
    const raw = { barPatternSpacingPt: 60, barPatternWidthPt: 0.05, barPatternColor: null, barPatternBackground: null };
    const { style: s, dropped } = sanitizeFillKeys(raw);
    expect(dropped).toEqual([]);
    expect(s).toEqual(raw);
    expect(sanitizeFillKeys({ barPatternSpacingPt: 0.5 }).dropped).toEqual([]);
    expect(sanitizeFillKeys({ barPatternWidthPt: -1 }).dropped).toEqual(['barPatternWidthPt']);
    expect(sanitizeFillKeys({ barPatternWidthPt: '1' }).dropped).toEqual(['barPatternWidthPt']);
  });
});

function fileText(mutate: (p: Any) => void): string {
  const p = JSON.parse(JSON.stringify(createExampleProject())) as Any;
  mutate(p);
  return JSON.stringify({ format: 'octavaplot-project', version: 1, project: p });
}

describe('serialize', () => {
  it('files without fill keys load with defaults', () => {
    const text = fileText((p) => {
      for (const k of Object.keys(DEFAULT_STYLE)) {
        if (k.startsWith('barPattern') || k === 'barFillMode') delete p.charts[0].defaults[k];
      }
    });
    const r = parseProjectWithNotes(text);
    expect(r.notes).toEqual([]);
    expect(r.project.charts[0].defaults.barFillMode).toBe('solid');
    expect(r.project.charts[0].defaults.barPatternSpacingPt).toBe(8);
  });
  it('corrupt fill keys in defaults, layer and overrides fall back with notes', () => {
    const text = fileText((p) => {
      const c = p.charts[0];
      c.defaults.barPatternSpacingPt = -3;
      c.layers[0].style.barFillMode = 'stripes';
      c.layers[0].groupOverrides.g1 = { barPatternColor: 'red', barPattern: 'dots' };
      c.layers[0].objectOverrides.o1 = { barPatternWidthPt: 0 };
    });
    const { project, notes } = parseProjectWithNotes(text);
    const c = project.charts[0];
    expect(c.defaults.barPatternSpacingPt).toBe(8);
    expect(c.layers[0].style.barFillMode).toBeUndefined();
    expect(c.layers[0].groupOverrides.g1).toEqual({ barPattern: 'dots' });
    expect(c.layers[0].objectOverrides.o1).toEqual({});
    expect(notes).toHaveLength(4);
  });
  it('round trip with nulls and non-default fill keys', () => {
    const p = createExampleProject();
    p.charts[0].defaults = { ...p.charts[0].defaults, barFillMode: 'pattern', barPattern: 'dots', barPatternColor: null, barPatternBackground: null, barPatternSpacingPt: 60 };
    const r = parseProjectWithNotes(stringifyProject(p));
    expect(r.notes).toEqual([]);
    expect(r.project).toEqual(p);
    expect(parseProject(stringifyProject(p)).charts[0].defaults.barPatternBackground).toBeNull();
  });
});

describe('style hierarchy', () => {
  const group = { id: 'g1', paletteIndex: 0 };
  it('fill keys resolve object > group > layer > defaults', () => {
    const chart = createChart('t');
    chart.defaults = { ...chart.defaults, barPattern: 'vertical' };
    const layer = chart.layers[0];
    layer.style = { ...layer.style, barPatternSpacingPt: 8 };
    layer.groupOverrides = { g1: { barPatternSpacingPt: 6, barFillMode: 'pattern' } };
    layer.objectOverrides = { 'g1:bar': { barPatternSpacingPt: 5 } };
    const st = resolveStyle(chart, layer, group, 'g1:bar');
    expect([st.barPattern, st.barPatternSpacingPt, st.barFillMode]).toEqual(['vertical', 5, 'pattern']);
    expect(resolveStyle(chart, layer, group).barPatternSpacingPt).toBe(6);
  });
  it('reset removes group fill overrides; type switch keeps fill keys', () => {
    const project = createExampleProject();
    const chart = project.charts[0];
    const table = project.dataTables[0];
    const gid = table.groups[0].id;
    const p1 = patchStyle(chart.id, gid, { barFillMode: 'pattern', barPattern: 'dots' })(project);
    expect(p1.charts[0].layers[0].groupOverrides[gid]).toMatchObject({ barFillMode: 'pattern', barPattern: 'dots' });
    const p2 = setChartType(chart.id, 'scatter')(p1);
    expect(p2.charts[0].layers[0].groupOverrides[gid]).toMatchObject({ barFillMode: 'pattern', barPattern: 'dots' });
    expect(p2.charts[0].layers[0].style.showBars).toBe(TYPE_PRESETS.scatter.showBars);
    const p3 = resetStyle(chart.id, gid, table)(p2);
    expect(p3.charts[0].layers[0].groupOverrides[gid]).toBeUndefined();
  });
});

describe('describeBarFillUi', () => {
  it('solid mode', () => {
    const u = describeBarFillUi(style());
    expect(u).toMatchObject({ mode: 'solid', solidColorEnabled: true, patternControlsEnabled: false, spacingError: null, invisibleWarning: null });
    expect(u.note).toMatch(/Pattern/);
  });
  it('none mode', () => {
    const u = describeBarFillUi(style({ barFillMode: 'none' }));
    expect(u).toMatchObject({ solidColorEnabled: false, patternControlsEnabled: false });
    expect(u.note).toMatch(/border/);
  });
  it('pattern mode, limits and invisible warning', () => {
    const ok = describeBarFillUi(pattern());
    expect(ok).toMatchObject({ solidColorEnabled: false, patternControlsEnabled: true, note: null, spacingError: null, widthError: null, invisibleWarning: null });
    const bad = describeBarFillUi(pattern({ barPatternSpacingPt: 120, barPatternWidthPt: 0 }));
    expect(bad.spacingError).toMatch(/P limit 2 to 100/);
    expect(bad.widthError).toMatch(/positive/);
    expect(describeBarFillUi(pattern({ barPatternColor: '#FFFFFF' })).invisibleWarning).not.toBeNull();
  });
  it('hidden bars disable everything', () => {
    const u = describeBarFillUi(pattern({ showBars: false }));
    expect(u).toMatchObject({ solidColorEnabled: false, patternControlsEnabled: false, note: 'Bars are hidden.' });
  });
});

describe('legendKeyFill', () => {
  it('caps spacing at 8 and mark width at half the spacing', () => {
    const k = legendKeyFill(resolveBarFill(pattern({ barPatternSpacingPt: 20, barPatternWidthPt: 6 })));
    expect([k.spacingPt, k.markWidthPt]).toEqual([8, 4]);
  });
  it('leaves small values and other fields alone', () => {
    const f = resolveBarFill(pattern({ barPatternSpacingPt: 4, barPatternWidthPt: 1 }));
    expect(legendKeyFill(f)).toEqual(f);
  });
});

describe('isPatternInvisible', () => {
  it('only pattern mode can be invisible', () => {
    expect(isPatternInvisible(resolveBarFill(style({ barBorderColor: '#ffffff' })))).toBe(false);
    expect(isPatternInvisible(resolveBarFill(style({ barFillMode: 'none' })))).toBe(false);
  });
  it('marks matching an opaque background, or zero opacity', () => {
    expect(isPatternInvisible(resolveBarFill(pattern({ barPatternColor: '#FFFFFF' })))).toBe(true);
    expect(isPatternInvisible(resolveBarFill(pattern({ barOpacity: 0 })))).toBe(true);
    expect(isPatternInvisible(resolveBarFill(pattern({ barPatternColor: '#FFFFFF', barPatternBackground: null })))).toBe(false);
    expect(isPatternInvisible(resolveBarFill(pattern()))).toBe(false);
  });
});

describe('import guard', () => {
  it('fill.ts imports only types', () => {
    const src = readFileSync(new URL('./fill.ts', import.meta.url), 'utf8');
    const imports = src.split('\n').filter((l) => /^import /.test(l));
    expect(imports).toEqual(["import type { ChartStyle, FillMode, FillPattern } from './types';"]);
  });
});
