import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../../model/defaults';
import { layerRows, layersOf } from '../../model/graph/layers';
import type { ChartType, Project } from '../../model/types';
import { addChart, addDataTable, patchLayerStyle, patchSurvival, setLayerHidden } from '../../state/commands';
import { calcStats } from '../../stats/calcCache';
import { buildAnyModel, ChartCanvas } from '../anyModel';
import { BAND_OPACITY, buildSurvivalModel } from './survivalModel';

const project = (type: ChartType = 'survival'): Project => addChart('c', 't', undefined, type)(addDataTable('t', 'survival', { sample: true })(createExampleProject()));
const chartOf = (p: Project) => p.charts.find((c) => c.id === 'c')!;
const tableOf = (p: Project) => p.dataTables.find((t) => t.id === 't')!;
const render = (p: Project, layered = true): string => {
  const any = buildAnyModel(chartOf(p), tableOf(p));
  const model = !layered ? { ...any.model, layers: undefined } : any.model;
  return renderToStaticMarkup(createElement(ChartCanvas, { chart: chartOf(p), any: { ...any, model } as typeof any, cssWidth: '600px', cssHeight: '400px' }));
};
const full = (p: Project): Project => patchSurvival('c', { band: true, errorBars: true, atRisk: true })(p);
const count = (svg: string, text: string) => svg.split(text).length - 1;

describe('survival curves drawn from layers', () => {
  it('are there, for both kinds of curve', () => {
    for (const type of ['survival', 'cumulativeEvent'] as const) {
      const p = project(type);
      expect(layersOf(chartOf(p), p.dataTables[0]).length).toBeGreaterThan(0);
    }
  });

  it('have the band, the curve, the error bars, the censor marks and the at-risk table, in that order', () => {
    const ls = layersOf(chartOf(full(project())), tableOf(full(project())));
    const order = ls.map((l) => l.kind);
    const first = (k: string) => order.indexOf(k as never);
    expect(first('band')).toBeLessThan(first('line'));
    expect(first('line')).toBeLessThan(first('errorBars'));
    expect(first('errorBars')).toBeLessThan(first('points'));
    expect(first('points')).toBeLessThan(first('atRisk'));
    expect(ls.filter((l) => l.kind === 'atRisk').length).toBe(1);
    expect(ls.filter((l) => l.calc?.kind === 'survival').length).toBeGreaterThan(0);
    expect(ls.some((l) => l.kind === 'rawPoints' || l.kind === 'fitCurve')).toBe(false);
  });

  it('follow the survival options for what is visible, and keep what is off in the list', () => {
    const p = project();
    const vis = (q: Project, k: string) => layersOf(chartOf(q), tableOf(q)).filter((l) => l.kind === k).map((l) => l.visible);
    expect(vis(p, 'band').every((v) => !v)).toBe(true);
    expect(vis(full(p), 'band').every(Boolean)).toBe(true);
    expect(vis(full(p), 'errorBars').every(Boolean)).toBe(true);
    expect(layersOf(chartOf(p), tableOf(p)).find((l) => l.kind === 'atRisk')?.visible).toBe(false);
    expect(layersOf(chartOf(full(p)), tableOf(full(p))).find((l) => l.kind === 'atRisk')?.visible).toBe(true);
  });

  it('are named for what they draw', () => {
    const labels = layerRows(chartOf(full(project())), tableOf(full(project()))).map((r) => r.label);
    expect(labels).toContain('At-risk table');
    expect(labels.some((l) => l.startsWith('Curve: '))).toBe(true);
    expect(labels.some((l) => l.startsWith('Censor marks: '))).toBe(true);
    expect(labels.some((l) => l.startsWith('Confidence band: '))).toBe(true);
    expect(labels.some((l) => l.startsWith('Error bars (SE): '))).toBe(true);
  });

  it.each([
    ['plain', project()],
    ['band, error bars and at-risk table', full(project())],
    ['cumulative with all of them', full(project('cumulativeEvent'))],
  ])('draw as before, byte for byte: %s', (_, p) => {
    expect(render(p, true)).toBe(render(p, false));
  });

  it('hide the band and keep the curve, the marks, the numbers and every calculation', () => {
    const p = full(project());
    const band = layersOf(chartOf(p), tableOf(p)).filter((l) => l.kind === 'band').map((l) => l.id);
    const svg = render(p);
    expect(count(svg, `fill-opacity="${BAND_OPACITY}"`)).toBeGreaterThan(0);
    const before = calcStats.computed;
    const hidden = band.reduce((q, id) => ({ ...q, charts: q.charts.map((c) => (c.id === 'c' ? { ...c, hiddenLayerIds: [...c.hiddenLayerIds, id] } : c)) }), p);
    const without = render(hidden);
    expect(count(without, `fill-opacity="${BAND_OPACITY}"`)).toBe(0);
    expect(without).toContain('Number at risk');
    expect(svg.replace(/<path[^>]*fill-opacity="0.2" stroke="none" id="[^"]*"><\/path>/g, '')).toBe(without);
    expect(calcStats.computed).toBe(before);
  });

  it('hide the at-risk table without giving back its room', () => {
    const p = full(project());
    const atRiskId = layersOf(chartOf(p), tableOf(p)).find((l) => l.kind === 'atRisk')!.id;
    expect(atRiskId).toBe(`${chartOf(p).id}:atRisk`);
    const hidden = setLayerHidden('c', atRiskId, true)(p);
    const a = buildSurvivalModel(chartOf(p), tableOf(p));
    const b = buildSurvivalModel(chartOf(hidden), tableOf(hidden));
    expect(b.layout.plot).toEqual(a.layout.plot);
    expect(render(hidden)).not.toContain('Number at risk');
    expect(render(p)).toContain('Number at risk');
  });

  it('give the band a colour and an opacity of its own', () => {
    const p = full(project());
    const band = layersOf(chartOf(p), tableOf(p)).find((l) => l.kind === 'band')!;
    const styled = patchLayerStyle('c', band.id, { color: '#abcdef', opacity: 0.55 })(p);
    const svg = render(styled);
    expect(svg).toContain('fill="#abcdef" fill-opacity="0.55"');
    expect(count(svg, 'fill="#abcdef"')).toBe(1);
  });
});
