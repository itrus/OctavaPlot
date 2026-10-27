import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { chartToSvgString } from '../chart/export/export';
import { GALLERY } from '../model/graph/chartGallery';
import { createEmptyProject, createExampleProject } from '../model/defaults';
import type { TableKind } from '../model/types';
import type { Project } from '../model/types';
import { addAnnotation, addChart, addDataTable, addReferenceLine, patchStyle, setProjectName, setRowTitles } from './commands';
import { MAX_PROJECT_BYTES, PROJECT_EXTENSION, projectToFileText, readProjectFile, type ProjectSource } from './projectFile';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = Record<string, any>;

const encoder = new TextEncoder();
const source = (name: string, bytes: Uint8Array | string): ProjectSource => {
  const data = typeof bytes === 'string' ? encoder.encode(bytes) : bytes;
  return { name, size: data.byteLength, arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer };
};

/** A project with what a file has to keep: UTF-8 text, annotations, styles, missing values. */
function richProject(): Project {
  let p = createExampleProject();
  const chart = p.charts[0];
  p = setProjectName('Étude № 3: 日本語 ✓')(p);
  p = setRowTitles(p.dataTables[0].id, [{ row: 0, title: 'µ-sample "α"' }])(p);
  p = addAnnotation(chart.id, { id: 'note', text: 'p < 0.05 — ✓', xFrac: 0.3, yFrac: 0.2, fontSizePt: 24, color: '#aa0000', opacity: 1 })(p);
  p = addReferenceLine(chart.id, { id: 'ref', axis: 'y', value: 1.5, color: '#0000ff', widthPt: 2, style: 'dotted', opacity: 1, label: 'cut-off', showLabel: true })(p);
  p = patchStyle(chart.id, 'all', { symbolSizePt: 14, barFill: '#336699' })(p);
  return p;
}

describe('project file (.oplot)', () => {
  it('is the project as JSON text, the same text every time', () => {
    const p = richProject();
    const text = projectToFileText(p);
    expect(JSON.parse(text).format).toBe('octavaplot-project');
    expect(JSON.parse(text).version).toBe(1);
    expect(projectToFileText(p)).toBe(text);
    expect(projectToFileText(JSON.parse(text).project)).toBe(text);
  });

  it('is read back as the same project: text, annotations, styles, sizes, ids', async () => {
    const p = richProject();
    const { project, notes } = await readProjectFile(source('study.oplot', projectToFileText(p)));
    expect(notes).toEqual([]);
    expect(project).toEqual(p);
    expect(project.name).toBe('Étude № 3: 日本語 ✓');
    expect(project.charts[0].annotations[0].text).toBe('p < 0.05 — ✓');
    expect(project.charts[0].widthPx).toBe(p.charts[0].widthPx);
    expect(project.charts[0].layers[0].style.symbolSizePt).toBe(14);
  });

  it('keeps a missing value missing', async () => {
    const p = createExampleProject();
    p.dataTables[0].groups[0].observations[2] = { ...p.dataTables[0].groups[0].observations[2], value: null };
    const { project } = await readProjectFile(source('a.oplot', projectToFileText(p)));
    expect(project.dataTables[0].groups[0].observations[2].value).toBeNull();
  });

  it('is recognised by its extension in any case, and only by that', async () => {
    const text = projectToFileText(createExampleProject());
    await expect(readProjectFile(source('A.OPLOT', text))).resolves.toBeDefined();
    for (const name of ['a.json', 'a.oplot.txt', 'oplot', 'a.zip']) await expect(readProjectFile(source(name, text))).rejects.toThrow(/end in \.oplot/);
    expect(PROJECT_EXTENSION).toBe('.oplot');
  });

  it('refuses a file that is too large before reading it', async () => {
    let read = false;
    const big: ProjectSource = { name: 'big.oplot', size: MAX_PROJECT_BYTES + 1, arrayBuffer: async () => ((read = true), new ArrayBuffer(0)) };
    await expect(readProjectFile(big)).rejects.toThrow(/too large/);
    expect(read).toBe(false);
  });

  it('refuses text that is not UTF-8, not JSON, or not a project, with a message that says which', async () => {
    await expect(readProjectFile(source('a.oplot', new Uint8Array([0x7b, 0xff, 0xfe, 0x7d])))).rejects.toThrow(/not UTF-8/);
    await expect(readProjectFile(source('a.oplot', '{"format": '))).rejects.toThrow(/not valid JSON/);
    await expect(readProjectFile(source('a.oplot', '{"format":"other","version":1,"project":{}}'))).rejects.toThrow(/format/);
    await expect(readProjectFile(source('a.oplot', JSON.stringify({ ...JSON.parse(projectToFileText(createExampleProject())), version: 2 })))).rejects.toThrow(/version/);
    await expect(readProjectFile(source('a.oplot', 'PK\u0003\u0004 a zip archive'))).rejects.toThrow(/not valid JSON/);
  });

  it('refuses a damaged project', async () => {
    const env = JSON.parse(projectToFileText(createExampleProject()));
    const bad = (mutate: (p: Any) => void) => {
      const copy = JSON.parse(JSON.stringify(env));
      mutate(copy.project);
      return readProjectFile(source('a.oplot', JSON.stringify(copy)));
    };
    await expect(bad((p) => ((p.dataTables = []), (p.charts = [])))).rejects.toThrow(/at least one table/);
    await expect(bad((p) => (p.charts[0].dataTableId = 'nope'))).rejects.toThrow(/missing data table/);
    await expect(bad((p) => p.charts.push(p.charts[0]))).rejects.toThrow(/same ID/);
    await expect(bad((p) => (p.dataTables[0].groups[0].observations[0].value = 'x'))).rejects.toThrow(/finite number/);
  });

  it('survives annotations and display names of the wrong type, with notes', async () => {
    const env = JSON.parse(projectToFileText(createExampleProject()));
    env.project.charts[0].annotations = [null, { id: 'a', text: { x: 1 }, xFrac: 'x', yFrac: 0.5, fontSizePt: 'big', color: 3 }];
    env.project.charts[0].displayNames = { a: { x: 1 }, b: 'ok' };
    const { project, notes } = await readProjectFile(source('a.oplot', JSON.stringify(env)));
    expect(project.charts[0].displayNames).toEqual({ b: 'ok' });
    expect(notes.length).toBeGreaterThan(0);
  });

  it('reads back every kind of chart exactly, with no note', async () => {
    for (const kind of Object.keys(GALLERY) as TableKind[]) {
      for (const tab of GALLERY[kind]) {
        for (const item of tab.items) {
          if (item.type === null) continue;
          let p = addDataTable('t1', kind, { sample: true })(createEmptyProject());
          p = addChart('c1', 't1', undefined, item.type, item.variant)(p);
          const { project, notes } = await readProjectFile(source('a.oplot', projectToFileText(p)));
          expect(notes, item.id).toEqual([]);
          expect(project, item.id).toEqual(p);
        }
      }
    }
  });

  it('resets a value of the wrong type, notes it, and the chart still draws', async () => {
    const bad: Record<string, (c: Any) => void> = {
      'a text for a font size': (c) => (c.titleFontSizePt = 'x'),
      'a number for the title': (c) => (c.title = 5),
      'a text for a legend size': (c) => (c.legend.fontSizePt = 'x'),
      'a text for an axis limit': (c) => (c.yAxis.min = 'x'),
      'a text for a tick size': (c) => (c.yAxis.tickFontSizePt = 'x'),
      'a text for the jitter': (c) => (c.jitter.widthFraction = 'x'),
      'a text for a symbol size': (c) => (c.defaults.symbolSizePt = 'x'),
      'a number for a style flag': (c) => (c.layers[0].style.showBars = 1),
      'a number for a list': (c) => (c.hiddenGroupIds = 5),
      'a number for a group of settings': (c) => (c.heatmap = 5),
    };
    for (const [what, mutate] of Object.entries(bad)) {
      const env = JSON.parse(projectToFileText(createExampleProject()));
      mutate(env.project.charts[0]);
      const { project, notes } = await readProjectFile(source('a.oplot', JSON.stringify(env)));
      expect(notes.length, what).toBeGreaterThan(0);
      const svg = chartToSvgString(project.charts[0], project.dataTables[0]);
      expect(svg, what).not.toMatch(/NaN|undefined/);
    }
  });

  it('keeps null where null is allowed, and values it does not know', async () => {
    const env = JSON.parse(projectToFileText(createExampleProject()));
    Object.assign(env.project.charts[0], { plotColor: null, pageColor: null, mystery: 7 });
    env.project.charts[0].defaults.barPatternBackground = null;
    env.project.charts[0].yAxis.min = null;
    const { project, notes } = await readProjectFile(source('a.oplot', JSON.stringify(env)));
    expect(notes).toEqual([]);
    expect(project.charts[0].plotColor).toBeNull();
    expect(project.charts[0].defaults.barPatternBackground).toBeNull();
    expect((project.charts[0] as unknown as Any).mystery).toBe(7);
  });

  it('matches the checked-in example file', async () => {
    // docs/example.oplot is written by this test when it is missing. To regenerate it after a deliberate
    // change of the format, delete the file and run `npm test`; review the new file in the diff.
    const path = resolve(__dirname, '../../docs/example.oplot');
    const example = createExampleProject();
    const chart = { ...example.charts[0], id: 'chart-1', dataTableId: 'table-1', layers: example.charts[0].layers.map((l, i) => ({ ...l, id: `layer-${i}` })) };
    const project: Project = {
      ...example,
      id: 'example-project',
      name: 'Example',
      dataTables: example.dataTables.map((t) => ({
        ...t,
        id: 'table-1',
        rows: t.rows.map((r, i) => ({ ...r, id: `row-${i}` })),
        groups: t.groups.map((g, gi) => ({ ...g, id: `group-${gi}`, observations: g.observations.map((o, oi) => ({ ...o, id: `obs-${gi}-${oi}` })) })),
      })),
      charts: [chart],
    };
    if (!existsSync(path)) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, projectToFileText(project));
    }
    const { project: read, notes } = await readProjectFile(source('example.oplot', readFileSync(path)));
    expect(notes).toEqual([]);
    expect(projectToFileText(read)).toBe(readFileSync(path, 'utf8'));
    expect(read.name).toBe('Example');
    expect(read.dataTables[0].groups).toHaveLength(4);
  });
});
