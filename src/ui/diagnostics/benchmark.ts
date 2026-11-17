/**
 * A tiny benchmark of the work this app does when it plots: the drawing of a graph with many dots (to SVG, the same code as the export), the same
 * drawing put in the page with the browser's layout and painting (only where there is a page), and a summary of many values. The curve fits will be added when they are done with R. It is for
 * comparing computers and browsers, not a pass or fail check, and it has no thresholds: the performance table of the ROADMAP is for the
 * whole app. Each step is run once to warm up, then several times; the result is the mean of those runs with its standard error. The
 * work is imported on demand so that the benchmark is not in the first download.
 */

/** `n`: how many timed runs the step gets. */
export interface BenchStep { id: 'draw' | 'dom' | 'stats'; label: string; n: number }
export interface BenchSize { values: number; dots: number; repeats: Record<BenchStep['id'], number> }
/** Mean time of `n` timed runs in ms, and the standard error of that mean (0 for a single run). */
export interface BenchResult { id: BenchStep['id']; mean: number; se: number; n: number }

// Three runs of each: the longer steps cannot have many, and three is the least that gives a standard error worth showing.
const DEFAULT_BENCH_SIZE: BenchSize = { values: 1_000_000, dots: 20_000, repeats: { draw: 3, dom: 3, stats: 3 } };

const hasPage = (): boolean => typeof document !== 'undefined';

export const benchSteps = (size: BenchSize = DEFAULT_BENCH_SIZE): BenchStep[] => [
  { id: 'draw', label: `Drawing: scatter graph of ${size.dots.toLocaleString('en-US')} dots, as SVG`, n: size.repeats.draw },
  ...(hasPage() ? [{ id: 'dom' as const, label: 'In the page: the same SVG, layout and paint', n: size.repeats.dom }] : []),
  { id: 'stats', label: `Statistics: summary of ${size.values.toLocaleString('en-US')} values`, n: size.repeats.stats },
];

/** The mean and the standard error of the mean (sample standard deviation over the square root of n). */
export function meanSe(times: readonly number[]): { mean: number; se: number } {
  const n = times.length;
  const mean = times.reduce((s, t) => s + t, 0) / n;
  if (n < 2) return { mean, se: 0 };
  const variance = times.reduce((s, t) => s + (t - mean) ** 2, 0) / (n - 1);
  return { mean, se: Math.sqrt(variance / n) };
}

/** The times of `repeats` runs after one warm-up run; a run may be asynchronous and is timed until it finishes. */
export async function timeRuns(repeats: number, run: () => void | Promise<void>, now: () => number = () => performance.now()): Promise<number[]> {
  await run();
  const times: number[] = [];
  for (let i = 0; i < repeats; i++) {
    const t0 = now();
    await run();
    times.push(now() - t0);
  }
  return times;
}

/** The same numbers every time. */
function random(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
}

/** Lets the browser paint (so the tab shows its progress) before the next step blocks the page. */
const yieldToPaint = (): Promise<void> =>
  new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(resolve, 0));
    else setTimeout(resolve, 0);
  });

/**
 * Puts the drawing in the page, makes the browser lay it out, and waits until the frame after it has been produced (a frame callback, then
 * a task). The host sits under the app, so it is laid out and painted like the real graph but never seen. Only approximate: a browser may
 * skip painting what is covered, and the real graph is also built by React, which this does not do.
 */
async function showInPage(markup: string): Promise<void> {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;top:0;left:0;z-index:-1;pointer-events:none;';
  document.body.appendChild(host);
  try {
    host.innerHTML = markup;
    host.getBoundingClientRect();
    await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
  } finally {
    host.remove();
  }
}

/** Runs the steps in order, reporting each as it finishes; stops early when `cancelled()` says so. */
export async function runBenchmark(onResult: (r: BenchResult) => void, cancelled: () => boolean, size: BenchSize = DEFAULT_BENCH_SIZE): Promise<void> {
  const [{ summarize }, { createExampleProject }, { replaceTableData, setChartType }, { chartToSvgString }] = await Promise.all([
    import('../../stats/summary'),
    import('../../model/defaults'),
    import('../../state/commands'),
    import('../../chart/export/export'),
  ]);
  const rnd = random(12345);

  const values = Array.from({ length: size.values }, () => 10 + 4 * rnd());
  const groups = 10;
  let project = createExampleProject();
  project = replaceTableData(project.dataTables[0].id, {
    names: Array.from({ length: groups }, (_, i) => `Group ${i + 1}`),
    titles: null,
    values: Array.from({ length: Math.max(1, Math.round(size.dots / groups)) }, () => Array.from({ length: groups }, () => Math.round((10 + 4 * rnd()) * 1000) / 1000)),
  })(project);
  project = setChartType(project.charts[0].id, 'scatter')(project);
  const table = project.dataTables[0];
  const chart = project.charts[0];

  const markup = chartToSvgString(chart, table);
  const jobs: Array<[BenchStep['id'], () => void | Promise<void>]> = [
    ['draw', () => void chartToSvgString(chart, table)],
    ['dom', () => showInPage(markup)],
    ['stats', () => void summarize(values)],
  ];
  const wanted = new Set(benchSteps(size).map((st) => st.id));
  for (const [id, run] of jobs) {
    if (!wanted.has(id)) continue;
    await yieldToPaint();
    if (cancelled()) return;
    const times = await timeRuns(size.repeats[id], run);
    onResult({ id, ...meanSe(times), n: times.length });
  }
}
