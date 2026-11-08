import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../../model/defaults';
import type { Project } from '../../model/types';
import { addChart, renameItem } from '../../state/commands';
import { crc32 } from '../../util/zip';
import { planBatch, runBatch, uniqueFileNames, type BatchRenderers } from './batchExport';
import { chartToSvgString } from './export';

const WHEN = new Date(2026, 9, 29, 14, 36);
const three = (): Project => {
  const p = createExampleProject();
  const t = p.dataTables[0].id;
  const q = addChart('chart_c', t)(addChart('chart_b', t)(p));
  return renameItem('chart', 'chart_c', 'Fig 1')(renameItem('chart', 'chart_b', 'Fig 1')(q));
};
/** The files of a ZIP of stored files: name and bytes, read from the local headers in order. */
function unzip(bytes: Uint8Array): Array<{ name: string; data: Uint8Array; crc: number }> {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = v.getUint16(bytes.length - 12, true);
  const out = [];
  let at = 0;
  for (let i = 0; i < count; i++) {
    expect(v.getUint32(at, true)).toBe(0x04034b50);
    const [crc, size, n] = [v.getUint32(at + 14, true), v.getUint32(at + 22, true), v.getUint16(at + 26, true)];
    out.push({ name: new TextDecoder().decode(bytes.subarray(at + 30, at + 30 + n)), data: bytes.subarray(at + 30 + n, at + 30 + n + size), crc });
    at += 30 + n + size;
  }
  return out;
}
const bytesOf = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

describe('file names of a batch', () => {
  it('number the second and later of the same name before the extension, without regard to case', () => {
    expect(uniqueFileNames(['a.png', 'A.png', 'b.png', 'a.png'])).toEqual(['a.png', 'A_2.png', 'b.png', 'a_3.png']);
  });
  it('do not take a name that a number made for another', () => {
    expect(uniqueFileNames(['a.png', 'a_2.png', 'a.png'])).toEqual(['a.png', 'a_2.png', 'a_3.png']);
  });
});

describe('planning a batch', () => {
  it('lists the graphs in the order picked, each with its safe file name, and two graphs of one name get two files', () => {
    const p = three();
    const [a, b, c] = p.charts;
    const plan = planBatch(p, [c.id, a.id, b.id], 'svg', false);
    expect(plan.items.map((i) => i.file)).toEqual(['Fig_1.svg', `${a.name.replace(/[^\w.-]+/g, '_')}.svg`, 'Fig_1_2.svg']);
    expect(plan.items.map((i) => i.chart.id)).toEqual([c.id, a.id, b.id]);
    expect(plan.items.every((i) => i.pixels === null)).toBe(true);
  });
  it('adds the date and time to every name when asked, and ignores ids that are not graphs', () => {
    const p = three();
    const plan = planBatch(p, [p.charts[1].id, 'nothing', p.dataTables[0].id], 'png', true, WHEN);
    expect(plan.items.map((i) => i.file)).toEqual(['Fig_1_261029_1436.png']);
  });
  it('gives the pixels of each picture at the size of its graph, and names a graph larger than the browser can make', () => {
    const p = three();
    const wide = (widthPx: number) => ({ ...p, charts: p.charts.map((c, i) => (i === 1 ? { ...c, widthPx, heightPx: 400 } : c)) });
    const fits = planBatch(wide(6000), wide(6000).charts.map((c) => c.id), 'png', false);
    expect(fits.items[1].pixels).toEqual({ width: 6000, height: 400 });
    expect(fits.tooBig).toEqual([]);
    const big = wide(17000);
    const ids = big.charts.map((c) => c.id);
    expect(planBatch(big, ids, 'png', false).tooBig).toEqual(['Fig 1 (17000 × 400 px)']);
    expect(planBatch(big, ids, 'svg', false).tooBig).toEqual([]);
  });
  it('leaves out a graph whose data table is gone, and says which', () => {
    const p = three();
    const broken = { ...p, charts: p.charts.map((c, i) => (i === 1 ? { ...c, dataTableId: 'gone' } : c)) };
    const plan = planBatch(broken, broken.charts.map((c) => c.id), 'svg', false);
    expect(plan.skipped).toEqual(['Fig 1']);
    expect(plan.items).toHaveLength(2);
  });
});

describe('running a batch', () => {
  it('writes the same SVG as the export of the single graph into the ZIP, in order, with its own CRC', async () => {
    const p = three();
    const renderers: BatchRenderers = { svg: (c, t, f) => chartToSvgString(c, t, f, { metadata: true }), raster: () => Promise.reject(new Error('unused')), pdf: () => Promise.reject(new Error('unused')) };
    const plan = planBatch(p, [p.charts[0].id, p.charts[2].id], 'svg', false);
    const files = unzip(await bytesOf(await runBatch(plan, 'svg', renderers, undefined, WHEN)));
    expect(files.map((f) => f.name)).toEqual(plan.items.map((i) => i.file));
    files.forEach((f, i) => {
      const alone = chartToSvgString(plan.items[i].chart, plan.items[i].table, plan.items[i].fit, { metadata: true });
      expect(new TextDecoder().decode(f.data)).toBe(alone);
      expect(f.crc).toBe(crc32(f.data));
    });
  });
  it('asks the PNG renderer for each graph and stores the bytes it returns', async () => {
    const p = three();
    const seen: string[] = [];
    const renderers: BatchRenderers = {
      svg: () => '',
      raster: async (chart) => {
        seen.push(`png:${chart.id}`);
        return new Blob([new Uint8Array([137, 80, 78, 71, 1])]);
      },
      pdf: () => Promise.reject(new Error('unused')),
    };
    const plan = planBatch(p, [p.charts[0].id, p.charts[1].id], 'png', false);
    const files = unzip(await bytesOf(await runBatch(plan, 'png', renderers, undefined, WHEN)));
    expect(seen).toEqual([`png:${p.charts[0].id}`, `png:${p.charts[1].id}`]);
    expect([...files[0].data]).toEqual([137, 80, 78, 71, 1]);
  });
  it('asks the PDF renderer for a PDF, with no resolution and no canvas to fit', async () => {
    const p = three();
    const seen: string[] = [];
    const renderers: BatchRenderers = {
      svg: () => '',
      raster: () => Promise.reject(new Error('unused')),
      pdf: async (chart) => {
        seen.push(chart.id);
        return new Blob([new Uint8Array([37, 80, 68, 70])]);
      },
    };
    const plan = planBatch(p, [p.charts[0].id, p.charts[1].id], 'pdf', false);
    expect(plan.items.every((i) => i.pixels === null)).toBe(true);
    expect(plan.tooBig).toEqual([]);
    const files = unzip(await bytesOf(await runBatch(plan, 'pdf', renderers, undefined, WHEN)));
    expect(seen).toEqual([p.charts[0].id, p.charts[1].id]);
    expect([...files[0].data]).toEqual([37, 80, 68, 70]);
  });
  it('draws the graphs of the project it was planned from, even when the project is edited while it runs', async () => {
    const p = three();
    const plan = planBatch(p, [p.charts[0].id, p.charts[1].id], 'svg', false);
    const drawn: string[] = [];
    let edited: Project = p;
    const renderers: BatchRenderers = {
      svg: (chart) => {
        drawn.push(chart.name);
        return '<svg/>';
      },
      raster: () => Promise.reject(new Error('unused')), pdf: () => Promise.reject(new Error('unused')),
    };
    // An edit between two graphs makes a new project value; the plan holds the old graphs.
    const progress = (i: number) => {
      if (i === 2) edited = renameItem('chart', p.charts[1].id, 'Renamed')(p);
    };
    await runBatch(plan, 'svg', renderers, progress, WHEN);
    expect(edited.charts[1].name).toBe('Renamed');
    expect(drawn).toEqual([p.charts[0].name, 'Fig 1']);
  });
  it('reports each graph before it is drawn, and stops with the name of the graph that failed', async () => {
    const p = three();
    const steps: Array<[number, number, string]> = [];
    const renderers: BatchRenderers = {
      svg: (chart) => {
        if (chart.id === p.charts[1].id) throw new Error('boom');
        return '<svg/>';
      },
      raster: () => Promise.reject(new Error('unused')), pdf: () => Promise.reject(new Error('unused')),
    };
    const plan = planBatch(p, [p.charts[0].id, p.charts[1].id, p.charts[2].id], 'svg', false);
    await expect(runBatch(plan, 'svg', renderers, (i, n, name) => steps.push([i, n, name]), WHEN)).rejects.toThrow('Fig 1: boom');
    expect(steps).toEqual([[1, 3, p.charts[0].name], [2, 3, 'Fig 1']]);
  });
  it('makes an empty ZIP of an empty plan', async () => {
    const zip = await bytesOf(await runBatch({ items: [], skipped: [], tooBig: [] }, 'svg', { svg: () => '', raster: () => Promise.reject(new Error('unused')), pdf: () => Promise.reject(new Error('unused')) }, undefined, WHEN));
    expect(zip.length).toBe(22);
  });
});
