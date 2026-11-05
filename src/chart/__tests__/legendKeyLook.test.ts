import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../../model/defaults';
import { applyVariant } from '../../model/graph/chartVariant';
import { layersOf } from '../../model/graph/layers';
import type { Project } from '../../model/types';
import { addChart, addDataTable, patchLayerStyle, patchStyle } from '../../state/commands';
import { chartToSvgString } from '../export/export';

const chartOf = (p: Project) => p.charts.find((c) => c.id === 'c')!;
const tableOf = (p: Project) => p.dataTables.find((t) => t.id === 't')!;
const svg = (p: Project) => chartToSvgString(chartOf(p), tableOf(p));
const keyPaths = (s: string) => [...(/id="legend"[\s\S]*$/.exec(s)?.[0] ?? '').matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);

describe('the legend key of a chart over columns', () => {
  const base = (): Project => addChart('c', 't', undefined, 'scatter')(addDataTable('t', 'column', { sample: true })(createExampleProject()));

  it('shows the shape the dots of a data set were given, as the dots are drawn', () => {
    const p0 = base();
    const id = tableOf(p0).groups[3].id;
    const layered = patchLayerStyle('c', `${id}:points`, { shape: 'square' })(p0);
    const whole = patchStyle('c', id, { symbolShape: 'square' })(p0);
    expect(keyPaths(svg(layered))).toEqual(keyPaths(svg(whole)));
    expect(keyPaths(svg(layered))).not.toEqual(keyPaths(svg(p0)));
    // Only that data set's key changed.
    expect(keyPaths(svg(layered)).slice(0, 3)).toEqual(keyPaths(svg(p0)).slice(0, 3));
  });
});

describe('the legend key of a grouped chart of dots', () => {
  it('shows the shape the dots of a series were given', () => {
    let p0 = addDataTable('t', 'grouped', { sample: true })(createExampleProject());
    p0 = addChart('c', 't', undefined, 'groupedBar')(p0);
    const chart = applyVariant(chartOf(p0), { dotsOnly: true });
    p0 = { ...p0, charts: p0.charts.map((c) => (c.id === 'c' ? chart : c)) };
    const dots = layersOf(chartOf(p0), tableOf(p0)).find((l) => l.kind === 'rawPoints' || l.kind === 'points');
    expect(dots).toBeDefined();
    const id = dots!.binding!.seriesId;
    const layered = patchLayerStyle('c', dots!.id, { shape: 'diamond' })(p0);
    const whole = patchStyle('c', id, { symbolShape: 'diamond' })(p0);
    expect(keyPaths(svg(layered))).toEqual(keyPaths(svg(whole)));
    expect(keyPaths(svg(layered))).not.toEqual(keyPaths(svg(p0)));
  });
});
