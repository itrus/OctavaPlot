import { prepareChartInput } from '../../model/table/preparedChart';
import type { Chart, DataTable, FitSettings, Id, Project } from '../../model/types';
import { exportFileName } from '../../util/download';
import { zipStore, type ZipFile } from '../../util/zip';
import { exportPixels, fitsCanvas } from './pngDpi';

/**
 * Batch export: several graphs of one project written as the files of one ZIP. The graphs are read from one project value (an
 * edit makes a new value, so a batch that is running cannot see one), each from its prepared input like the graph's own export
 * (the effective table, the fit settings), and each is drawn by the same function as the export of a single graph.
 */

export type BatchFormat = 'png' | 'svg' | 'pdf';

/** The drawing of one graph: SVG text, or the bytes of a PNG or PDF at a resolution. The browser ones are in export.tsx; tests pass their own. */
export interface BatchRenderers {
  svg: (chart: Chart, table: DataTable, fit: FitSettings | undefined) => string;
  raster: (kind: 'png' | 'pdf', chart: Chart, table: DataTable, dpi: number, fit: FitSettings | undefined) => Promise<Blob>;
}

interface BatchItem {
  chart: Chart;
  table: DataTable;
  fit: FitSettings | undefined;
  /** The name of the file in the ZIP. */
  file: string;
  /** Pixels of the picture; null for SVG. */
  pixels: { width: number; height: number } | null;
}

export interface BatchPlan {
  items: BatchItem[];
  /** Graphs that cannot be exported (their data table is gone), by name. */
  skipped: string[];
  /** The graphs whose picture is larger than a browser can make at the resolution, by name with their size. */
  tooBig: string[];
}

/** The file names with a number put before the extension where two would be the same (compared without regard to case, as a file system may). */
export function uniqueFileNames(files: readonly string[]): string[] {
  const used = new Set<string>();
  return files.map((file) => {
    const dot = file.lastIndexOf('.');
    const [stem, ext] = dot > 0 ? [file.slice(0, dot), file.slice(dot)] : [file, ''];
    let name = file;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${stem}_${n}${ext}`;
    used.add(name.toLowerCase());
    return name;
  });
}

/**
 * What a batch would write: the graphs picked (ids that are not graphs of the project are ignored), in the order given, each with
 * the name of its file. The resolution is that of the format (a PNG has its own, see settings).
 */
export function planBatch(project: Project, ids: readonly Id[], format: BatchFormat, dpi: number, stamped: boolean, now: Date = new Date()): BatchPlan {
  const skipped: string[] = [];
  const found: Array<{ chart: Chart; table: DataTable; fit: FitSettings | undefined }> = [];
  for (const id of ids) {
    const chart = project.charts.find((c) => c.id === id);
    if (!chart) continue;
    const prepared = prepareChartInput(project, chart);
    if (prepared) found.push({ chart, table: prepared.table, fit: prepared.fit });
    else skipped.push(chart.name);
  }
  const files = uniqueFileNames(found.map((f) => exportFileName(f.chart.name, format, stamped, now)));
  const items = found.map((f, i): BatchItem => ({ ...f, file: files[i], pixels: format === 'svg' ? null : exportPixels(f.chart, dpi) }));
  const tooBig = items.flatMap((it) => (it.pixels && !fitsCanvas(it.pixels.width, it.pixels.height) ? [`${it.chart.name} (${it.pixels.width} × ${it.pixels.height} px)`] : []));
  return { items, skipped, tooBig };
}

/**
 * Draws every graph of a plan and returns the ZIP. `step` is told which graph is being drawn (1-based) before each one. A graph that
 * fails to draw stops the batch with its name in the message: a ZIP missing a graph is not made.
 */
export async function runBatch(plan: BatchPlan, format: BatchFormat, dpi: number, render: BatchRenderers, step: (index: number, count: number, name: string) => void = () => {}, now: Date = new Date()): Promise<Blob> {
  const files: ZipFile[] = [];
  for (const [i, item] of plan.items.entries()) {
    step(i + 1, plan.items.length, item.chart.name);
    try {
      const data = format === 'svg' ? new TextEncoder().encode(render.svg(item.chart, item.table, item.fit)) : new Uint8Array(await (await render.raster(format, item.chart, item.table, dpi, item.fit)).arrayBuffer());
      files.push({ name: item.file, data });
    } catch (err) {
      throw new Error(`${item.chart.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
    // Let the page breathe between graphs: one that is slow to draw does not freeze the status line for the rest.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return new Blob([zipStore(files, now) as BlobPart], { type: 'application/zip' });
}
