import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../../../model/defaults';
import { layersOf } from '../../../model/graph/layers';
import type { Chart, ChartType, Project, TableKind } from '../../../model/types';
import { addAnnotation, addChart, addDataTable, addReferenceLine, setLayerHidden } from '../../../state/commands';
import { parseProject, stringifyProject } from '../../../state/serialize';
import { buildAnyModel, ChartCanvas } from '../../anyModel';
import { chartToSvgString } from '../../export/export';
import { type Scene, sceneTargets } from './scene';
import type { SceneElement } from './sceneElement';
import { svgId } from './svgIds';
import { buildXyModel } from '../../xy/xyModel';
import { compileXyScene } from '../../xy/xyScene';

/** `at` is a value inside the range of the axis, so that the reference line is drawn. */
const project = (kind: TableKind, type: ChartType, at = 5, layout?: Parameters<typeof addDataTable>[2]): Project => {
  const p = addChart('c', 't', undefined, type)(addDataTable('t', kind, { sample: true, ...layout })(createExampleProject()));
  const decorated = addAnnotation('c', { id: 'n1', text: 'A note', xFrac: 0.1, yFrac: 0.1, fontSizePt: 20, color: '#000000', opacity: 1 })(p);
  return addReferenceLine('c', { id: 'r1', axis: 'y', value: at, color: '#cc0000', widthPt: 2, style: 'dashed', label: 'Limit', showLabel: true, opacity: 1 })(decorated);
};
const chartOf = (p: Project) => p.charts.find((c) => c.id === 'c')!;
const tableOf = (p: Project) => p.dataTables.find((t) => t.id === 't')!;
const svgOf = (p: Project, editor = false, css = '600px'): string => {
  const any = buildAnyModel(chartOf(p), tableOf(p));
  return renderToStaticMarkup(createElement(ChartCanvas, { chart: chartOf(p), any, cssWidth: css, cssHeight: css, ...(editor ? { editor: { selection: { kind: 'chart' as const } } } : {}) }));
};
const idsOf = (svg: string): string[] => [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
const restyle = (p: Project, patch: Record<string, unknown>): Project => ({ ...p, charts: p.charts.map((c) => (c.id === 'c' ? { ...c, layers: c.layers.map((l, i) => (i === 0 ? { ...l, style: { ...l.style, ...patch } } : l)) } : c)) });

describe('stable ids in the drawing', () => {
  it('make an XML id from an object and a kind, and nothing else', () => {
    expect(svgId('grp_ab12:line')).toBe('grp_ab12-line');
    expect(svgId('layer', 'obs:1')).toBe('layer-obs-1');
  });

  for (const [name, p] of [
    ['XY', project('xy', 'xyLineSymbols')],
    ['survival', project('survival', 'survival', 0.5)],
    ['bar', project('column', 'bar', 1.5)],
  ] as const) {
    it(`are unique and valid in a ${name} drawing, and the same on the screen and in an export`, () => {
      const exported = idsOf(svgOf(p));
      expect(new Set(exported).size).toBe(exported.length);
      for (const id of exported) expect(id).toMatch(/^[A-Za-z_][A-Za-z0-9_.-]*$/);
      expect(exported).toEqual(expect.arrayContaining(['page', 'plot-area', 'chart-title', 'annotation-n1', 'reference-line-r1', 'reference-line-r1-label']));
      expect(idsOf(svgOf(p, true))).toEqual(exported);
    });
  }

  it('belong to the layers: each shape of the scene has its id in the drawing, once', () => {
    const p = project('xy', 'xyLineSymbols');
    const model = buildXyModel(chartOf(p), tableOf(p));
    const ids = idsOf(svgOf(p));
    const shapes = model.scene!.layers.flatMap((l) => l.paths.map((s) => s.id));
    expect(shapes.length).toBeGreaterThan(0);
    for (const id of shapes) expect(ids.filter((x) => x === id).length).toBe(1);
    // A layer's shape is named after its layer.
    for (const l of model.scene!.layers) expect(l.paths.every((s) => s.id.startsWith(svgId(l.id)))).toBe(true);
  });

  it('do not change when the chart is restyled, resized, renamed or hidden in part, nor after saving and opening', () => {
    const p = project('xy', 'xyLineSymbols');
    const base = idsOf(svgOf(p));
    expect(idsOf(svgOf(restyle(p, { symbolSizePt: 20, lineWidthPt: 6 })))).toEqual(base);
    const resized: Project = { ...p, charts: p.charts.map((c): Chart => (c.id === 'c' ? { ...c, name: 'other', widthPx: 500, heightPx: 400 } : c)) };
    expect(idsOf(svgOf(resized))).toEqual(base);
    expect(idsOf(svgOf(parseProject(stringifyProject(p))))).toEqual(base);
    // Hiding a layer removes its ids and leaves the others where they were.
    const line = layersOf(chartOf(p), tableOf(p)).find((l) => l.kind === 'line')!.id;
    const hidden = idsOf(svgOf(setLayerHidden('c', line, true)(p)));
    expect(hidden).toEqual(base.filter((id) => id !== svgId(line)));
  });

  it('are prefixed with the chart when a file says what it shows, so that two exports can share a page', () => {
    const p = project('xy', 'xyLineSymbols');
    const svg = chartToSvgString(chartOf(p), tableOf(p), undefined, { metadata: true });
    const ids = idsOf(svg);
    expect(ids.length).toBeGreaterThan(5);
    expect(ids.every((id) => id.startsWith('octp-'))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('the scene', () => {
  it('has the data layers that are drawn, in order, and none that are hidden', () => {
    const p = project('xy', 'xyLineSymbols');
    const layers = buildXyModel(chartOf(p), tableOf(p)).scene!.layers.map((l) => l.id);
    const wanted = layersOf(chartOf(p), tableOf(p)).filter((l) => l.visible && l.binding).map((l) => l.id);
    expect(layers).toEqual(wanted);
    const line = layersOf(chartOf(p), tableOf(p)).find((l) => l.kind === 'line')!.id;
    expect(buildXyModel(chartOf(setLayerHidden('c', line, true)(p)), tableOf(p)).scene!.layers.map((l) => l.id)).not.toContain(line);
  });

  it('is what the drawing is made from: every path of the scene is in the SVG with the same data and style', () => {
    const p = project('xy', 'xyLineSymbols');
    const model = buildXyModel(chartOf(p), tableOf(p));
    const svg = svgOf(p);
    for (const layer of model.scene!.layers) {
      for (const s of layer.paths) {
        const at = svg.indexOf(` id="${s.id}"`);
        expect(at, s.id).toBeGreaterThan(-1);
        const open = svg.lastIndexOf('<path', at);
        const tag = svg.slice(open, svg.indexOf('>', at));
        expect(tag).toContain(`d="${s.d}"`);
        expect(tag).toContain(`stroke="${s.stroke}"`);
        if (s.strokeWidth > 0) expect(tag).toContain(`stroke-width="${s.strokeWidth}"`);
      }
    }
  });

  it('gives the editor its hit targets, the same ones as the scene says, and an export none', () => {
    const p = project('xy', 'xyLineSymbols');
    const model = buildXyModel(chartOf(p), tableOf(p));
    const editor = svgOf(p, true);
    const targets = sceneTargets(model.scene!);
    expect(targets.length).toBeGreaterThan(0);
    for (const t of targets) {
      const at = editor.indexOf(` id="${t.id}"`);
      const open = editor.lastIndexOf('<path', at);
      const tag = editor.slice(open, editor.indexOf('>', at));
      expect(tag, t.id).toContain(`data-hit="${t.hit.kind}"`);
      expect(tag, t.id).toContain(`data-group-id="${t.hit.groupId}"`);
      if (t.hit.objectId) expect(tag).toContain(`data-object-id="${t.hit.objectId}"`);
    }
    expect(svgOf(p)).not.toContain('data-hit');
  });

  it('draws the same geometry on the screen and in an export, whatever the zoom', () => {
    const p = project('xy', 'xyLineSymbols');
    const plain = (svg: string) => svg.replace(/(<svg [^>]*?) width="[^"]*" height="[^"]*"/, '$1');
    // Zoom is only the size of the element: the viewBox, every coordinate, font size and stroke width are those of the page in pt.
    expect(plain(svgOf(p, false, '300px'))).toBe(plain(svgOf(p, false, '1800px')));
    // The editor adds its own marks to the same shapes: the data paths are the same ones.
    const dOf = (svg: string) => [...svg.matchAll(/ d="([^"]+)"[^>]* id="([^"]+)"/g)].map((m) => `${m[2]}:${m[1]}`);
    expect(dOf(svgOf(p, true))).toEqual(dOf(svgOf(p, false)));
  });

  it('is compiled for a histogram too, which is not drawn from layers', () => {
    const p = project('column', 'histogram');
    const any = buildAnyModel(chartOf(p), tableOf(p));
    expect(any.family).toBe('histogram');
    const scene = compileXyScene(chartOf(p), any.model as ReturnType<typeof buildXyModel>);
    expect(scene.widthPt).toBeGreaterThan(0);
    expect(svgOf(p)).not.toContain('NaN');
  });
});

/** The ids of the elements of a scene, depth first. */
const sceneIds = (nodes: ReadonlyArray<SceneElement>): string[] => nodes.flatMap((n) => [...(n.id ? [n.id] : []), ...sceneIds(n.children ?? [])]);
const flat = (nodes: ReadonlyArray<SceneElement>): SceneElement[] => nodes.flatMap((n) => [n, ...flat(n.children ?? [])]);

/** The scene of any chart that has one (XY, survival, histogram). */
const sceneOf = (p: Project) => (buildAnyModel(chartOf(p), tableOf(p)).model as { scene: Scene }).scene;

describe('the chrome in the scene', () => {
  const full = (): Project => {
    const p = project('survival', 'survival', 0.5);
    return { ...p, charts: p.charts.map((c) => ({ ...c, survival: { ...c.survival, atRisk: true }, frame: 'box' as const })) };
  };

  it('has the clip and backgrounds first, the axes, titles and legend in front, and the data between', () => {
    const p = project('xy', 'xyLineSymbols');
    const scene = buildXyModel(chartOf(p), tableOf(p)).scene!;
    expect(sceneIds(scene.defs)).toEqual(['plot-clip']);
    expect(sceneIds(scene.back)).toEqual(expect.arrayContaining(['page', 'plot-area', 'reference-line-r1', 'reference-line-r1-label']));
    expect(sceneIds(scene.front)).toEqual(expect.arrayContaining(['x-axis', 'y-axis', 'chart-title', 'legend']));
    expect(sceneIds(scene.back).indexOf('page')).toBeLessThan(sceneIds(scene.back).indexOf('plot-area'));
    expect(sceneIds(scene.front).indexOf('y-axis')).toBeLessThan(sceneIds(scene.front).indexOf('x-axis'));
  });

  it('writes every tick and number of an axis, with the text the scale gives', () => {
    const p = project('xy', 'xyLineSymbols');
    const model = buildXyModel(chartOf(p), tableOf(p));
    const texts = flat(model.scene!.front).filter((n) => n.tag === 'text' && n.hit?.kind === 'axis');
    const labels = (axis: string) => texts.filter((n) => n.hit?.objectId === axis).map((n) => n.text);
    expect(labels('x')).toEqual(model.x.ticks.map((t) => model.x.tickLabel(t)));
    expect(labels('y')).toEqual(model.y.ticks.map((t) => model.y.tickLabel(t)));
    // Each axis group is a hit target for the editor's axis selection.
    const groups = model.scene!.front.filter((n) => n.id === 'x-axis' || n.id === 'y-axis');
    expect(groups.map((g) => g.hit)).toEqual([{ kind: 'axis', objectId: 'y' }, { kind: 'axis', objectId: 'x' }]);
  });

  it('leaves out a hidden axis (its numbers and ticks), and keeps its scale bar when it asks for one', () => {
    const p = project('xy', 'xyLineSymbols');
    const hide: Project = { ...p, charts: p.charts.map((c) => ({ ...c, yAxis: { ...c.yAxis, visible: false, scaleBar: true } })) };
    const scene = buildXyModel(chartOf(hide), tableOf(hide)).scene!;
    expect(sceneIds(scene.front)).not.toContain('y-axis');
    expect(sceneIds(scene.front)).toContain('x-axis');
    expect(flat(scene.front).some((n) => n.tag === 'text' && n.hit?.objectId === 'y')).toBe(false);
    expect(flat(scene.front).filter((n) => n.tag === 'g' && !n.id && n.children?.length === 2).length).toBe(1);
  });

  it('does not depend on the editor: the same scene is drawn for the editor and for an export, which differ by hit attributes only', () => {
    const p = full();
    const scene = sceneOf(p);
    expect(sceneIds(scene.front)).toEqual(expect.arrayContaining(['at-risk-table', 'legend']));
    const editor = svgOf(p, true);
    const exported = svgOf(p, false);
    const clean = editor.replace(/ data-(?:hit|group-id|object-id|annotation-id)="[^"]*"/g, '').replace(/<path d="[^"]*"(?: fill="none")? stroke="transparent" stroke-width="[\d.]+"><\/path>/g, '').replace(/<path data-editor-only[^>]*><\/path>/g, '').replace(/<rect data-editor-only[^>]*><\/rect>/g, '');
    // The editor's own marks are the transparent twins of the axis and line (to be hit) and a transparent box behind an annotation.
    const result = clean.replace(/<rect x="[^"]*" y="[^"]*" width="[^"]*" height="[^"]*" fill="transparent"><\/rect>/g, '');
    expect(result).toBe(exported);
  });

  it('leaves out what is hidden by id: the at-risk table and a reference line', () => {
    const p = full();
    const atRisk = layersOf(chartOf(p), tableOf(p)).find((l) => l.kind === 'atRisk')!.id;
    const hidden = setLayerHidden('c', atRisk, true)(p);
    expect(sceneIds(sceneOf(hidden).front)).not.toContain('at-risk-table');
    const q = project('xy', 'xyLineSymbols');
    const ref = layersOf(chartOf(q), tableOf(q)).find((l) => l.kind === 'referenceLine')!.id;
    const gone = setLayerHidden('c', ref, true)(q);
    expect(sceneIds(buildXyModel(chartOf(gone), tableOf(gone)).scene!.back)).not.toContain('reference-line-r1');
  });

  it('keeps the legend entries in the order of the layout, each selecting its data set', () => {
    const p = project('xy', 'xyLineSymbols');
    const model = buildXyModel(chartOf(p), tableOf(p));
    const legend = model.scene!.front.find((n) => n.id === 'legend')!;
    expect(legend.children!.map((c) => c.hit?.groupId)).toEqual(model.layout.legend!.items.map((it) => model.series[model.legendSeries[it.index]].groupId));
    expect(legend.children!.every((c) => c.hit?.kind === 'legend')).toBe(true);
    expect(legend.children!.map((c) => c.children!.at(-1)!.text)).toEqual(model.layout.legend!.items.map((it) => it.label));
  });
});
