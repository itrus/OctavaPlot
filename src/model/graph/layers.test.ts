import { describe, expect, it } from 'vitest';
import { buildXyModel } from '../../chart/xy/xyModel';
import { addAnnotation, addChart, addDataTable, addReferenceLine, patchLayerStyle, setLayerHidden } from '../../state/commands';
import { parseProject, parseProjectWithNotes, stringifyProject } from '../../state/serialize';
import { NO_FIT_SETTINGS } from '../options/fitOptions';
import { CHART_TYPES } from './chartTypes';
import { createExampleProject } from '../defaults';
import { BAND_OPACITY } from '../../chart/survival/survivalModel';
import { DEFAULT_BAND_OPACITY, layerLook, layerRows, layersOf, sanitizeLayerStyles } from './layers';
import type { Chart, Project } from '../types';

const projectWith = (patch: (c: Chart) => Chart = (c) => c): Project => {
  const p = addChart('c', 't', undefined, 'xyLine')(addDataTable('t', 'xy', { sample: true })(createExampleProject()));
  return { ...p, charts: p.charts.map((c) => (c.id === 'c' ? patch(c) : c)) };
};
const tableOf = (p: Project) => p.dataTables.find((t) => t.id === 't')!;
const chartOf = (p: Project) => p.charts.find((c) => c.id === 'c')!;
const layers = (p: Project) => layersOf(chartOf(p), tableOf(p));
const withStyle = (patch: Record<string, unknown>) => (c: Chart): Chart => ({ ...c, layers: c.layers.map((l, i) => (i === 0 ? { ...l, style: { ...l.style, ...patch } } : l)) });
describe('layers of an XY chart', () => {
  it('are there for every kind of chart, with unique ids and a drawing order that counts up', () => {
    for (const info of CHART_TYPES) {
      const p = addChart('k', 'k-table', undefined, info.type)(addDataTable('k-table', info.tableKind, { sample: true })(createExampleProject()));
      const chart = p.charts.find((c) => c.id === 'k')!;
      const ls = layersOf(chart, p.dataTables.find((t) => t.id === 'k-table')!);
      expect(ls.length, info.type).toBeGreaterThan(0);
      expect(new Set(ls.map((l) => l.id)).size, info.type).toBe(ls.length);
      expect(ls.map((l) => l.z), info.type).toEqual(ls.map((_, i) => i));
    }
  });
  it('have unique ids and a strictly increasing drawing order', () => {
    const ls = layers(projectWith());
    expect(new Set(ls.map((l) => l.id)).size).toBe(ls.length);
    expect(ls.map((l) => l.z)).toEqual(ls.map((_, i) => i));
  });
  it('give each series points and a line, bound to its table and series', () => {
    const p = projectWith();
    const ls = layers(p);
    for (const kind of ['points', 'line'] as const) {
      const of = ls.filter((l) => l.kind === kind);
      expect(of.length).toBeGreaterThan(0);
      for (const l of of) expect(l.binding?.tableId).toBe('t');
    }
  });
  it('keep their ids and order when only the style changes, and when a chart is renamed', () => {
    const p = projectWith();
    const base = layers(p);
    const edit = (patch: (c: Chart) => Chart): Project => ({ ...p, charts: p.charts.map((c) => (c.id === 'c' ? patch(c) : c)) });
    expect(layers(edit(withStyle({ symbolSizePt: 9, lineWidthPt: 3 }))).map((l) => l.id)).toEqual(base.map((l) => l.id));
    expect(layers(edit((c) => ({ ...c, name: 'other' })))).toEqual(base);
  });
  it('turn the show flags into visibility without removing the layer (hiding is not disabling)', () => {
    const ls = layers(projectWith(withStyle({ showSymbols: false, showLines: false })));
    for (const l of ls.filter((x) => x.kind === 'points' || x.kind === 'line')) {
      expect(l.visible).toBe(false);
      expect(l.enabled).toBe(true);
    }
  });
  it('agree with what the model draws', () => {
    for (const patch of [{}, { showSymbols: false }, { showLines: false }, { showErrorBars: false }]) {
      const p = projectWith(withStyle(patch));
      const m = buildXyModel(chartOf(p), tableOf(p));
      const ls = layers(p);
      for (const s of m.series) {
        const at = (kind: string) => ls.find((l) => l.id === `${s.groupId}:${kind}`);
        expect(at('points')?.visible).toBe(s.style.showSymbols);
        expect(at('line')?.visible).toBe(s.style.showLines);
        if (s.errorPath !== '') expect(at('errorBars')?.visible).toBe(true);
      }
    }
  });
  it('put the fit curve and its band in only when a fit is chosen, and keep the band out of the axis range', () => {
    expect(layers(projectWith()).some((l) => l.kind === 'fitCurve' || l.kind === 'fitBand')).toBe(false);
    const ls = layers(projectWith((c) => ({ ...c, fit: { ...c.fit, analysisId: 'a1', band: 'confidence' } })));
    const curve = ls.find((l) => l.kind === 'fitCurve')!;
    const band = ls.find((l) => l.kind === 'fitBand')!;
    expect(curve.calc).toEqual({ kind: 'curvefit', analysisId: 'a1' });
    expect(curve.rangeContribution).toBe(true);
    expect(band.rangeContribution).toBe(false);
    expect(band.z).toBeLessThan(curve.z);
    const noBand = layers(projectWith((c) => ({ ...c, fit: { ...c.fit, analysisId: 'a1', band: 'none' } })));
    expect(noBand.some((l) => l.kind === 'fitBand')).toBe(false);
    expect(noBand.some((l) => l.kind === 'fitCurve')).toBe(true);
  });
  it('draw points over the line parts, or under them when lines go on top', () => {
    const z = (ls: ReturnType<typeof layers>, kind: string) => ls.find((l) => l.kind === kind)!.z;
    const normal = layers(projectWith());
    expect(z(normal, 'points')).toBeGreaterThan(z(normal, 'line'));
    const top = layers(projectWith((c) => ({ ...c, lineOrder: 'onTop' })));
    expect(z(top, 'points')).toBeLessThan(z(top, 'line'));
  });
});

describe('layer rows and hiding', () => {
  const withFitChart = (p: Project): Project => ({ ...p, charts: p.charts.map((c) => (c.id === 'c' ? { ...c, fit: { ...c.fit, analysisId: 'a1', band: 'confidence' as const } } : c)) });

  it('list the layers topmost first, named by kind and series, with reference lines and annotations too', () => {
    const p = addAnnotation('c', { id: 'n1', text: 'A note', xFrac: 0.1, yFrac: 0.1, fontSizePt: 20, color: '#000000', opacity: 1 })(addReferenceLine('c', { id: 'r1', axis: 'y', value: 5, color: '#cc0000', widthPt: 2, style: 'dashed', label: '', showLabel: false, opacity: 1 })(withFitChart(projectWith())));
    const rows = layerRows(chartOf(p), tableOf(p));
    expect(rows.map((r) => r.label)).toContain('Reference line: Y = 5');
    expect(rows.map((r) => r.label)).toContain('Annotation: A note');
    expect(rows[0].layer.kind).toBe('annotation');
    expect(rows.map((r) => r.layer.z)).toEqual([...rows.map((r) => r.layer.z)].sort((a, b) => b - a));
    expect(rows.filter((r) => r.layer.kind === 'fitBand').map((r) => r.label)).toEqual(['Fit band: Series B', 'Fit band: Series A']);
  });
  it('offer hiding only where the style has not already switched the layer off', () => {
    const p = withFitChart(projectWith(withStyle({ showLines: false })));
    const rows = layerRows(chartOf(p), tableOf(p));
    const line = rows.find((r) => r.layer.kind === 'line')!;
    expect([line.shown, line.canToggle, line.reason]).toEqual([false, false, 'Switched off in Style']);
    expect(rows.find((r) => r.layer.kind === 'fitCurve')?.canToggle).toBe(true);
  });
  it('setLayerHidden hides and shows by id, and is idempotent', () => {
    const p = withFitChart(projectWith());
    const id = layersOf(chartOf(p), tableOf(p)).find((l) => l.kind === 'fitBand')!.id;
    const hidden = setLayerHidden('c', id, true)(p);
    expect(chartOf(hidden).hiddenLayerIds).toEqual([id]);
    expect(setLayerHidden('c', id, true)(hidden)).toEqual(hidden);
    expect(layerRows(chartOf(hidden), tableOf(hidden)).find((r) => r.layer.id === id)?.shown).toBe(false);
    expect(chartOf(setLayerHidden('c', id, false)(hidden)).hiddenLayerIds).toEqual([]);
  });
  it('hiding leaves the axes of the chart as they were', () => {
    const p = withFitChart(projectWith());
    const ids = layersOf(chartOf(p), tableOf(p)).filter((l) => l.kind === 'fitCurve' || l.kind === 'fitBand').map((l) => l.id);
    const fit = { ...NO_FIT_SETTINGS, model: 'linear' as const, band: 'confidence' as const, level: 0.95 };
    const a = buildXyModel(chartOf(p), tableOf(p), fit);
    const b = buildXyModel({ ...chartOf(p), hiddenLayerIds: ids }, tableOf(p), fit);
    expect([b.y.domain, b.x.domain]).toEqual([a.y.domain, a.x.domain]);
  });
  it('are saved and read back, and anything that is not an id is dropped', () => {
    const p = withFitChart(projectWith());
    const id = layersOf(chartOf(p), tableOf(p))[0].id;
    const hidden = setLayerHidden('c', id, true)(p);
    expect(chartOf(parseProject(stringifyProject(hidden))).hiddenLayerIds).toEqual([id]);
    const raw = JSON.parse(stringifyProject(hidden));
    raw.project.charts.find((c: { id: string }) => c.id === 'c').hiddenLayerIds = [id, 3, null, { a: 1 }];
    expect(chartOf(parseProject(JSON.stringify(raw))).hiddenLayerIds).toEqual([id]);
    delete raw.project.charts.find((c: { id: string }) => c.id === 'c').hiddenLayerIds;
    expect(chartOf(parseProject(JSON.stringify(raw))).hiddenLayerIds).toEqual([]);
  });
});

describe('the look of a single layer', () => {
  const fitProject = () => {
    const p = projectWith((c) => ({ ...c, fit: { ...c.fit, analysisId: 'a1', band: 'confidence' as const } }));
    const ls = layersOf(chartOf(p), tableOf(p));
    return { p, curve: ls.find((l) => l.kind === 'fitCurve')!.id, band: ls.find((l) => l.kind === 'fitBand')!.id, line: ls.find((l) => l.kind === 'line')!.id };
  };

  it('keeps the band opacity of the charts in one place', () => {
    expect(DEFAULT_BAND_OPACITY).toBe(BAND_OPACITY);
  });
  it('takes only the settings that suit the kind of layer, each valid, and counts what it drops', () => {
    const r = sanitizeLayerStyles({
      'a:fitCurve': { color: '#AA0000', widthPt: 3, lineStyle: 'dotted', opacity: 0.5, bogus: 1 },
      'b:fitBand': { color: '#00ff00', opacity: 2, widthPt: 3 },
      'c:annotation': { color: '#000000' },
      'd:fitCurve': { color: 'red', widthPt: 0, lineStyle: 'zigzag' },
      'e:fitCurve': 'x',
    });
    expect(r.styles).toEqual({ 'a:fitCurve': { color: '#aa0000', widthPt: 3, lineStyle: 'dotted', opacity: 0.5 }, 'b:fitBand': { color: '#00ff00' } });
    expect(r.dropped).toBe(1 + 1 + 1 + 1 + 3 + 1);
    expect(sanitizeLayerStyles(undefined)).toEqual({ styles: {}, dropped: 0 });
    expect(sanitizeLayerStyles([]).dropped).toBe(1);
  });
  it('is set, changed and given back to the series by a command', () => {
    const { p, curve } = fitProject();
    const a = patchLayerStyle('c', curve, { color: '#112233', widthPt: 4 })(p);
    expect(chartOf(a).layerStyles).toEqual({ [curve]: { color: '#112233', widthPt: 4 } });
    const b = patchLayerStyle('c', curve, { widthPt: null })(a);
    expect(chartOf(b).layerStyles).toEqual({ [curve]: { color: '#112233' } });
    expect(chartOf(patchLayerStyle('c', curve, { color: null })(b)).layerStyles).toEqual({});
  });
  it('ignores a setting the layer does not take, and a layer that takes none', () => {
    const { p, band } = fitProject();
    expect(chartOf(patchLayerStyle('c', band, { widthPt: 4 })(p)).layerStyles).toEqual({});
    expect(chartOf(patchLayerStyle('c', 'n1:annotation', { color: '#112233' })(p)).layerStyles).toEqual({});
  });
  it('falls back to the series line look, and to its own settings where given', () => {
    const { p, curve, band } = fitProject();
    const series = { lineColor: '#123456', lineWidthPt: 3, lineStyle: 'dashed' as const };
    expect(layerLook(chartOf(p), curve, series)).toEqual({ color: '#123456', widthPt: 3, lineStyle: 'dashed', opacity: 1 });
    expect(layerLook(chartOf(p), band, series).opacity).toBe(DEFAULT_BAND_OPACITY);
    const own = chartOf(patchLayerStyle('c', curve, { color: '#abcdef', lineStyle: 'dotted' })(p));
    expect(layerLook(own, curve, series)).toMatchObject({ color: '#abcdef', widthPt: 3, lineStyle: 'dotted' });
  });
  it('are saved and read back, and an unreadable one is dropped with a note', () => {
    const { p, curve } = fitProject();
    const styled = patchLayerStyle('c', curve, { color: '#112233' })(p);
    expect(chartOf(parseProject(stringifyProject(styled))).layerStyles).toEqual({ [curve]: { color: '#112233' } });
    const raw = JSON.parse(stringifyProject(styled));
    raw.project.charts.find((c: { id: string }) => c.id === 'c').layerStyles = { [curve]: { color: 'nope', widthPt: 2 } };
    const read = parseProjectWithNotes(JSON.stringify(raw));
    expect(chartOf(read.project).layerStyles).toEqual({ [curve]: { widthPt: 2 } });
    expect(read.notes.join(' ')).toContain('layerStyles');
  });
});
