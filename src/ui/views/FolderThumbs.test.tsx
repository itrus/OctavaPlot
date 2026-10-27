import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { addChart } from '../../state/commands';
import { createExampleProject } from '../../model/defaults';
import { ChartThumb } from './FolderThumbs';

const idsOf = (m: string) => [...m.matchAll(/ id="([^"]+)"/g)].map((x) => x[1]);

describe('chart thumbnails', () => {
  it('keep their internal ids apart, and every reference resolves inside its own picture', () => {
    const p0 = createExampleProject();
    // Two graphs on one overview page, each a picture of its own.
    const p = addChart('chart_b', p0.dataTables[0].id, { widthPx: 600, heightPx: 300 })(p0);
    const parts = p.charts.map((c) => renderToStaticMarkup(<ChartThumb chart={c} project={p} />));
    const [a, b] = parts.map(idsOf);
    expect(a.length).toBeGreaterThan(0);
    expect(new Set(a).size).toBe(a.length);
    expect(a.filter((id) => b.includes(id))).toEqual([]);
    for (const m of parts) {
      const ids = new Set(idsOf(m));
      const refs = [...m.matchAll(/url\(#([^)]+)\)/g)].map((x) => x[1]);
      expect(refs.length).toBeGreaterThan(0);
      for (const r of refs) expect(ids.has(r)).toBe(true);
    }
  });
  it('are a note for a graph whose table is gone', () => {
    const p = createExampleProject();
    expect(renderToStaticMarkup(<ChartThumb chart={p.charts[0]} project={{ ...p, dataTables: [] }} />)).toContain('No data');
  });
});
