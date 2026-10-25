import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createExampleProject } from '../../model/defaults';
import { parseProject, stringifyProject } from '../../state/serialize';
import { patchPointStyle, patchStyle, patchSummary, setChartType, setRowTitles } from '../../state/commands';
import type { Project } from '../../model/types';
import { n2 } from '../../model/units';
import { ColumnChartSvg } from '../column/ColumnChartSvg';
import { chartToSvgString } from './export';
import { hitAttrs } from '../shared/scene/hitTest';
import { buildColumnModel } from '../column/columnModel';

describe('SVG export', () => {
  it('is a vector SVG without editor-only or hit-test content', () => {
    let p = createExampleProject();
    p = patchSummary(p.charts[0].id, 'all', { spread: 'sd' })(p);
    const svg = chartToSvgString(p.charts[0], p.dataTables[0]);
    expect(svg).toMatch(/^<\?xml/);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('width="1024px"');
    expect(svg).toContain('<rect');
    expect(svg).toContain('<text');
    expect(svg).not.toContain('data-editor-only');
    expect(svg).not.toContain('data-hit');
    expect(svg).not.toContain('<image');
  });

  it('exports error bars for spreads beyond SD and SEM', () => {
    const base = createExampleProject();
    const p = patchSummary(base.charts[0].id, 'all', { spread: 'ci' })(base);
    expect(chartToSvgString(p.charts[0], p.dataTables[0])).not.toBe(chartToSvgString(base.charts[0], base.dataTables[0]));
  });

  it('draws one symbol path per observation in scatter mode', () => {
    let p = createExampleProject();
    p = { ...p, charts: p.charts.map((c) => ({ ...c, legend: { ...c.legend, visible: false } })) };
    p = setChartType(p.charts[0].id, 'scatter')(p);
    const svg = chartToSvgString(p.charts[0], p.dataTables[0]);
    expect((svg.match(/<path d="M[\d.]+,[\d.]+a/g) ?? []).length).toBe(20);
  });
});

describe('project JSON', () => {
  it('round-trips without losing data or settings', () => {
    let p = createExampleProject();
    p = patchStyle(p.charts[0].id, p.dataTables[0].groups[0].id, { barFill: '#123456', barBorderWidthPt: 4 })(p);
    p = { ...p, charts: [{ ...p.charts[0], yAxis: { ...p.charts[0].yAxis, min: 0.5, max: 3 } }] };
    expect(parseProject(stringifyProject(p))).toEqual(p);
  });
  it('rejects malformed files with a clear message', () => {
    expect(() => parseProject('not json')).toThrow(/not valid JSON/);
    expect(() => parseProject('{"format":"x"}')).toThrow(/format/);
  });
});

describe('point label rendering', () => {
  const labelledFrom = (p: Project, patch: Record<string, unknown> = {}) =>
    patchStyle(p.charts[0].id, 'all', { showSymbols: true, showPointLabels: true, pointLabelSource: 'value', ...patch })(p);
  const labelled = (patch: Record<string, unknown> = {}) => labelledFrom(createExampleProject(), patch);
  const svgOf = (p: Project): string => chartToSvgString(p.charts[0], p.dataTables[0]);
  const editorHtml = (p: Project): string =>
    renderToStaticMarkup(
      createElement(ColumnChartSvg, {
        chart: p.charts[0],
        model: buildColumnModel(p.charts[0], p.dataTables[0]),
        editor: { selection: { kind: 'chart' } as never },
        cssWidth: '1px',
        cssHeight: '1px',
      }),
    );
  const modelOf = (p: Project) => buildColumnModel(p.charts[0], p.dataTables[0]);
  // Without legend or annotations the labels are the last block of the export.
  const labelBlock = (s: string) => s.slice(s.indexOf('<g><g><text'));
  const farOff = { pointLabelPlacement: 'custom', pointLabelOffsetXPt: 40, pointLabelOffsetYPt: -40 };

  it('labels off leaves the export unchanged', () => {
    const ex = createExampleProject();
    const base = patchStyle(ex.charts[0].id, 'all', { showSymbols: true })(ex);
    const on = labelledFrom(base);
    expect(svgOf(on)).not.toBe(svgOf(base));
    expect(svgOf(patchStyle(base.charts[0].id, 'all', { showPointLabels: false })(on))).toBe(svgOf(base));
    expect(svgOf(base)).not.toContain('<g><g><text');
  });

  it('adds only text elements and no editor content to the export', () => {
    const p = labelled();
    const s = svgOf(p);
    const n = modelOf(p).labels.items.length;
    expect(n).toBeGreaterThan(0);
    const block = labelBlock(s);
    expect((block.match(/<text /g) ?? []).length).toBe(n);
    expect(block.replace(/<g>|<\/g>|<text [^>]*>[^<]*<\/text>|<\/svg>\s*/g, '')).toBe('');
    expect(block).not.toContain('text-anchor');
    expect(s).not.toContain('data-hit');
    expect(s).not.toContain('transparent');
    expect(s).not.toContain('<tspan');
  });

  it('draws start-anchored text at model coordinates with the pinned attribute order', () => {
    const p = labelled();
    const it = modelOf(p).labels.items[0];
    expect(svgOf(p)).toContain(`<text x="${n2(it.x)}" y="${n2(it.y)}" font-size="${it.fontSizePt}" fill="#000000">${it.shown}</text>`);
  });

  it('sets bold and italic only when requested and uses the label colour', () => {
    expect(labelBlock(svgOf(labelled()))).not.toMatch(/font-weight|font-style/);
    const p = labelled({ pointLabelBold: true, pointLabelItalic: true, pointLabelColor: '#ff0000' });
    const it = modelOf(p).labels.items[0];
    expect(svgOf(p)).toContain(`font-size="${it.fontSizePt}" fill="#ff0000" font-weight="bold" font-style="italic">${it.shown}</text>`);
    expect(labelBlock(svgOf(labelled({ pointLabelBold: true })))).not.toContain('font-style');
  });

  it('draws a per-point colour, bold and italic override on that point only', () => {
    const base = labelled();
    const id = modelOf(base).labels.items[0].id;
    const p = patchPointStyle(base.charts[0].id, id, { pointLabelColor: '#ff0000', pointLabelBold: true, pointLabelItalic: true })(base);
    const it = modelOf(p).labels.items[0];
    expect(it.id).toBe(id);
    expect(svgOf(p)).toContain(`fill="#ff0000" font-weight="bold" font-style="italic">${it.shown}</text>`);
    const bolds = (s: string) => (s.match(/font-weight="bold"/g) ?? []).length;
    expect(bolds(svgOf(p))).toBe(bolds(svgOf(base)) + 1);
  });

  it('draws after the legend, before annotations, outside the plot clip', () => {
    let p = labelled();
    p = { ...p, charts: [{ ...p.charts[0], annotations: [{ id: 'an1', text: 'NOTE', xFrac: 0.5, yFrac: 0.1, fontSizePt: 10, color: '#000000' } as never] }] };
    const s = svgOf(p);
    const it = modelOf(p).labels.items[0];
    const iLabel = s.indexOf(`>${it.shown}</text>`);
    expect(iLabel).toBeGreaterThan(s.indexOf('>Value</text>'));
    expect(iLabel).toBeLessThan(s.indexOf('NOTE'));
    const clipStart = s.indexOf('<g clip-path="url(#plot-clip)">');
    const clipEnd = s.indexOf('</g><g stroke=', clipStart);
    expect(clipEnd).toBeGreaterThan(clipStart);
    expect(s.slice(clipStart, clipEnd)).not.toContain('<text');
  });

  it('draws the legend before the labels', () => {
    const p = labelled();
    const withLegend = { ...p, charts: [{ ...p.charts[0], legend: { ...p.charts[0].legend, visible: true } }] } as Project;
    const s = svgOf(withLegend);
    const m = modelOf(withLegend);
    if (!m.layout.legend) return;
    expect(s.indexOf(`>${m.layout.legend.items[0].label}</text>`)).toBeLessThan(s.indexOf(`>${m.labels.items[0].shown}</text>`));
  });

  it('escapes label text', () => {
    let p = labelled({ pointLabelSource: 'rowTitle' });
    p = setRowTitles(p.dataTables[0].id, [{ row: 0, title: 'a<b & "c"' }])(p);
    const s = svgOf(p);
    expect(s).toContain('a&lt;b &amp; ');
    expect(s).not.toContain('a<b');
  });

  it('draws a leader only for a displaced label with leaders enabled', () => {
    const paths = (p: Project) => (labelBlock(svgOf(p)).match(/<path /g) ?? []).length;
    expect(paths(labelled({ ...farOff, pointLabelLeader: false }))).toBe(0);
    const withLeader = labelled({ ...farOff, pointLabelLeader: true });
    const displaced = modelOf(withLeader).labels.items.filter((i) => i.leader).length;
    expect(displaced).toBeGreaterThan(0);
    const s = svgOf(withLeader);
    const start = s.indexOf('<g><path d="M');
    expect(start).toBeGreaterThan(-1);
    const block = s.slice(start);
    expect((block.match(/<path d="M[\d.-]+,[\d.-]+L[\d.-]+,[\d.-]+" fill="none" stroke="#000000" stroke-width="1">/g) ?? []).length).toBe(displaced);
    expect(block.lastIndexOf('<path')).toBeLessThan(block.indexOf('<text'));
  });

  it('does not draw a leader for a label that is not displaced', () => {
    const p = labelled({ pointLabelLeader: true });
    expect(modelOf(p).labels.items.every((i) => !i.leader)).toBe(true);
    expect(labelBlock(svgOf(p))).not.toContain('<path');
  });

  it('exposes the label hit kind with the point id in the editor', () => {
    const p = labelled();
    const it = modelOf(p).labels.items[0];
    const h = editorHtml(p);
    expect(h).toContain('data-hit="label"');
    expect(h).toContain(`data-object-id="${it.id}"`);
    expect(h).toMatch(/data-hit="label"[^>]*><rect[^>]*fill="transparent"/);
  });

  it('builds label hit attributes', () => {
    expect(hitAttrs('label', 'g1', 'p1')).toEqual({ 'data-hit': 'label', 'data-group-id': 'g1', 'data-object-id': 'p1' });
  });
});

describe('SVG export identity', () => {
  it('has a title and a description, and ids that cannot collide with another export', () => {
    const p = createExampleProject();
    const a = chartToSvgString(p.charts[0], p.dataTables[0], undefined, { metadata: true });
    expect(a).toMatch(/<svg role="img" [^>]*aria-labelledby="octp-[^"]+-title octp-[^"]+-desc">/);
    expect(a).toMatch(/<title id="octp-[^"]+-title">[^<]+<\/title><desc id="octp-[^"]+-desc">/);
    const other = { ...p.charts[0], id: 'another-chart' };
    const b = chartToSvgString(other, p.dataTables[0], undefined, { metadata: true });
    const ids = (svg: string) => [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids(a).filter((id) => ids(b).includes(id))).toEqual([]);
    // Every reference points at an id that exists.
    for (const ref of a.matchAll(/url\(#([^)]+)\)/g)) expect(ids(a)).toContain(ref[1]);
  });
});
