import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../model/defaults';
import type { Chart, ChartType, Project, TableKind } from '../model/types';
import { addAnnotation, addChart, addDataTable, addReferenceLine } from '../state/commands';
import { buildAnyModel, ChartCanvas } from './anyModel';
import type { ChromeScene } from './scene';
import type { SceneElement } from './sceneElement';
import { SceneElements } from './SceneElements';

/** A project with one table of the kind and one chart of the type, a reference line at `at` and an annotation. */
const project = (kind: TableKind, type: ChartType, at: number): Project => {
  const p = addChart('c', 't', undefined, type)(addDataTable('t', kind, { sample: true })(createExampleProject()));
  const noted = addAnnotation('c', { id: 'n1', text: 'A note', xFrac: 0.1, yFrac: 0.1, fontSizePt: 20, color: '#000000', opacity: 1 })(p);
  return addReferenceLine('c', { id: 'r1', axis: 'y', value: at, color: '#cc0000', widthPt: 2, style: 'dashed', label: 'Limit', showLabel: true, opacity: 1 })(noted);
};
const chartOf = (p: Project) => p.charts.find((c) => c.id === 'c')!;
const tableOf = (p: Project) => p.dataTables.find((t) => t.id === 't')!;
const withChart = (p: Project, patch: (c: Chart) => Chart): Project => ({ ...p, charts: p.charts.map((c) => (c.id === 'c' ? patch(c) : c)) });
const style = (c: Chart, patch: Record<string, unknown>): Chart => ({ ...c, layers: c.layers.map((l, i) => (i === 0 ? { ...l, style: { ...l.style, ...patch } } : l)) });

const barP = (patch: (c: Chart) => Chart = (c) => c): Project => withChart(project('column', 'bar', 1.5), patch);
const groupedP = (type: ChartType = 'groupedBar', patch: (c: Chart) => Chart = (c) => c): Project => withChart(project('grouped', type, 50), patch);

const modelOf = (p: Project) => buildAnyModel(chartOf(p), tableOf(p)).model as unknown as { scene: ChromeScene } & Record<string, any>;
const chromeOf = (p: Project): ChromeScene => modelOf(p).scene;
const svgOf = (p: Project): string => renderToStaticMarkup(createElement(ChartCanvas, { chart: chartOf(p), any: buildAnyModel(chartOf(p), tableOf(p)), cssWidth: '600px', cssHeight: '400px' }));

const flat = (nodes: ReadonlyArray<SceneElement>): SceneElement[] => nodes.flatMap((n) => [n, ...flat(n.children ?? [])]);
const idsOf = (nodes: ReadonlyArray<SceneElement>): string[] => flat(nodes).flatMap((n) => (n.id ? [n.id] : []));
const textsOf = (nodes: ReadonlyArray<SceneElement>, axis: string) => flat(nodes).filter((n) => n.tag === 'text' && n.hit?.kind === 'axis' && n.hit.objectId === axis).map((n) => n.text);
const hasAttr = (n: SceneElement, name: string, value?: string | number) => !!n.attrs?.some(([k, v]) => k === name && (value === undefined || v === value));
const bindToRight = (p: Project) => tableOf(p).groups[0].id;
const rightAxis = (c: Chart, groupId: string, visible = true, grid = true): Chart => ({
  ...c,
  y2Axis: { ...c.y2Axis, visible, showGrid: grid },
  layers: c.layers.map((l, i) => (i === 0 ? { ...l, groupOverrides: { [groupId]: { axisBinding: 'secondary' as const } } } : l)),
});

describe('the chrome of bars and grouped charts in the scene', () => {
  it('is on the model of both families, with the clip and backgrounds first and the axes, titles and legend in front', () => {
    for (const p of [barP(), groupedP()]) {
      const scene = chromeOf(p);
      expect(idsOf(scene.defs)).toEqual(['plot-clip']);
      expect(idsOf(scene.back)).toEqual(expect.arrayContaining(['page', 'plot-area']));
      const front = idsOf(scene.front);
      expect(front).toEqual(expect.arrayContaining(['y-axis', 'x-axis', 'chart-title', 'legend']));
      expect(front.indexOf('y-axis')).toBeLessThan(front.indexOf('x-axis'));
      expect(front.indexOf('x-axis')).toBeLessThan(front.indexOf('legend'));
    }
  });

  it('has the reference line behind the data when it is inside the axis', () => {
    expect(idsOf(chromeOf(barP()).back)).toEqual(expect.arrayContaining(['reference-line-r1', 'reference-line-r1-label']));
    expect(idsOf(chromeOf(withChart(barP(), (c) => ({ ...c, referenceLines: c.referenceLines.map((r) => ({ ...r, value: 1000 })) }))).back)).not.toContain('reference-line-r1');
  });

  it('names every category on the category axis and writes the numbers of the value axis', () => {
    const model = modelOf(barP());
    expect(textsOf(model.scene.front, 'x')).toEqual(model.groups.map((g: { label: string }) => g.label));
    expect(textsOf(model.scene.front, 'y')).toEqual(model.y.ticks.map((t: number) => model.y.tickLabel(t)));
    const grouped = modelOf(groupedP());
    expect(textsOf(grouped.scene.front, 'x')).toEqual(grouped.categories.map((c: { label: string }) => c.label));
  });

  it('turns the names on to a slant when they do not fit, and puts them down the left of horizontal columns', () => {
    const names = (scene: ChromeScene) => flat(scene.front).filter((n) => n.tag === 'text' && n.hit?.objectId === 'x');
    const narrow = names(chromeOf(barP((c) => ({ ...c, widthPx: 260, xAxis: { ...c.xAxis, tickFontSizePt: 30 } }))));
    expect(narrow.length).toBeGreaterThan(0);
    expect(narrow.every((n) => n.attrs!.some(([k, v]) => k === 'transform' && String(v).startsWith('rotate(-45')))).toBe(true);
    expect(names(chromeOf(barP())).every((n) => !hasAttr(n, 'transform'))).toBe(true);
    const horizontal = chromeOf(barP((c) => ({ ...c, orientation: 'horizontal' })));
    expect(names(horizontal).length).toBeGreaterThan(0);
    expect(names(horizontal).every((n) => hasAttr(n, 'text-anchor', 'end') && hasAttr(n, 'dy'))).toBe(true);
    // The value axis then runs along the bottom, and is still the y axis.
    expect(textsOf(horizontal.front, 'y').length).toBeGreaterThan(0);
  });

  it('has the right-hand axis and its gridlines only while a data set is bound to it and the axis is shown', () => {
    const base = barP();
    expect(idsOf(chromeOf(base).front)).not.toContain('y2-axis');
    const bound = chromeOf(withChart(base, (c) => rightAxis(c, bindToRight(base))));
    expect(idsOf(bound.front)).toContain('y2-axis');
    expect(textsOf(bound.front, 'y2').length).toBeGreaterThan(0);
    // Its gridlines are behind the data, and dashed only when the left ones are drawn as well.
    expect(flat(bound.back).some((n) => hasAttr(n, 'stroke-dasharray', '3 3'))).toBe(false);
    const both = chromeOf(withChart(base, (c) => ({ ...rightAxis(c, bindToRight(base)), yAxis: { ...c.yAxis, showGrid: true } })));
    expect(flat(both.back).some((n) => hasAttr(n, 'stroke-dasharray', '3 3'))).toBe(true);
    const hiddenRight = chromeOf(withChart(base, (c) => rightAxis(c, bindToRight(base), false)));
    expect(idsOf(hiddenRight.front)).not.toContain('y2-axis');
  });

  it('leaves out a hidden axis, and a legend that is not shown', () => {
    const hidden = chromeOf(barP((c) => ({ ...c, xAxis: { ...c.xAxis, visible: false }, yAxis: { ...c.yAxis, visible: false }, legend: { ...c.legend, visible: false } })));
    const ids = idsOf(hidden.front);
    expect(ids).not.toContain('x-axis');
    expect(ids).not.toContain('y-axis');
    expect(ids).not.toContain('legend');
    expect(ids).toContain('chart-title');
  });

  it('keys the legend by what each family draws: a filled key for bars, a pattern key for patterns, a line and symbol for lines', () => {
    const keysOf = (scene: ChromeScene) => flat(scene.front.find((n) => n.id === 'legend')!.children![0].children!);
    expect(keysOf(chromeOf(barP())).some((n) => n.tag === 'rect' && hasAttr(n, 'fill-opacity'))).toBe(true);
    const pattern = keysOf(chromeOf(barP((c) => style(c, { barFillMode: 'pattern', barPattern: 'diagonal' }))));
    expect(pattern.some((n) => n.tag === 'clipPath' && n.id?.startsWith('fill-clip-'))).toBe(true);
    expect(pattern.some((n) => hasAttr(n, 'class', 'fill-marks'))).toBe(true);
    expect(keysOf(chromeOf(groupedP('groupedLine'))).some((n) => n.tag === 'path' && hasAttr(n, 'stroke-dasharray'))).toBe(true);
    expect(keysOf(chromeOf(groupedP('groupedBar'))).some((n) => n.tag === 'rect')).toBe(true);
  });

  it('selects the data set of a legend entry, in the order of the layout', () => {
    const model = modelOf(barP());
    const legend = model.scene.front.find((n) => n.id === 'legend')!;
    const items = model.layout.legend.items as Array<{ label: string }>;
    expect(legend.children!.map((c) => c.hit?.groupId)).toEqual(items.map((_, i) => model.groups[model.legendGroups[i]].groupId));
    expect(legend.children!.every((c) => c.hit?.kind === 'legend')).toBe(true);
    expect(legend.children!.map((c) => c.children!.at(-1)!.text)).toEqual(items.map((it) => it.label));
  });

  it('is written the same way for the screen and for an export: the editor adds hit attributes and its own marks, and nothing else', () => {
    const dotted = barP((c) => style(c, { barFillMode: 'pattern', barPattern: 'dots' }));
    for (const p of [barP(), dotted, groupedP()]) {
      const scene = chromeOf(p);
      const write = (nodes: ReadonlyArray<SceneElement>, editor: boolean) => renderToStaticMarkup(createElement(SceneElements, { nodes, editor }));
      for (const nodes of [scene.back, scene.front]) {
        const exportedRaw = write(nodes, false);
        const exported = exportedRaw.replace(/ pointer-events="[a-z]+"/g, '');
        expect(exportedRaw).not.toContain('data-hit');
        expect(exportedRaw).not.toContain('transparent');
        const editor = write(nodes, true)
          .replace(/ data-(?:hit|group-id|object-id|annotation-id)="[^"]*"/g, '')
          .replace(/ pointer-events="[a-z]+"/g, '')
          .replace(/<path d="[^"]*" stroke="transparent" stroke-width="[\d.]+"><\/path>/g, '');
        let at = 0;
        while (at < editor.length && editor[at] === exported[at]) at++;
        expect(editor.slice(at, at + 160)).toBe(exported.slice(at, at + 160));
      }
    }
  });

  it('is what the drawing is made from: the axis lines and ticks of the scene are in the SVG', () => {
    for (const p of [barP(), groupedP()]) {
      const svg = svgOf(p);
      const paths = flat(chromeOf(p).front).filter((n) => n.tag === 'path').map((n) => String(n.attrs!.find(([k]) => k === 'd')![1])).filter((d) => d !== '');
      expect(paths.length).toBeGreaterThan(3);
      for (const d of paths) expect(svg).toContain(`d="${d}"`);
    }
  });
});
