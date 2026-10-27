import { layersOf } from '../../model/graph/layers';
import { resolveStyle, dataLayer } from '../../model/graph/style';
import { legendEntries } from '../../model/graph/legendEntries';
import { NO_FIT_SETTINGS } from '../../model/options/fitOptions';
import type { Chart, DataTable } from '../../model/types';
import { chartPx2Pt, n2 } from '../../model/units';
import { autoBinWidth, binEdges, binHeights, countBins, ecdfSteps } from '../../stats/histogram';
import { sortedFinite } from '../../stats/distribution';
import { axisMapper, resolveAxis } from '../shared/axes/axisScale';
import { computeLayout } from '../shared/parts/layout';
import type { XyModel, XyPoint, XySeries } from '../xy/xyModel';
import { displayName } from '../shared/parts/names';
import { attachLazyScene } from '../xy/xyScene';

/**
 * Model of histograms and cumulative distributions of a column table: one series for each data set, the values on a
 * numeric X axis. It has the shape of an XY chart's model (numeric X, numeric Y, series), so the same drawing and the same
 * axis settings serve it; the bars of a histogram are the series' `bars`, the steps of a distribution its line.
 */
export function buildHistogramModel(chart: Chart, table: DataTable): XyModel {
  const [W, H] = [chartPx2Pt(chart.widthPx), chartPx2Pt(chart.heightPx)];
  const layer = dataLayer(chart);
  const opts = chart.histogram;
  const histogram = chart.type === 'histogram';
  const warnings: string[] = [];

  const data = table.groups.map((g, i) => {
    // The symbols of a cumulative distribution are asked for by its own setting as well as by the style of the data set.
    const own = resolveStyle(chart, layer, { id: g.id, paletteIndex: g.paletteIndex ?? i });
    const style = !histogram && opts.ecdfSymbols && !own.showSymbols ? { ...own, showSymbols: true } : own;
    const values = sortedFinite(g.observations.map((o) => o.value));
    return { g, style, values, label: displayName(chart, g.id, g.name) };
  });
  const pooled = data.flatMap((d) => d.values).sort((a, b) => a - b);

  // 1. What each series draws, in data coordinates.
  const width = opts.binning === 'width' && opts.binWidth !== null ? opts.binWidth : autoBinWidth(pooled);
  const edges = histogram ? binEdges(pooled, width, opts.firstEdge) : [];
  const bins = data.map((d) => {
    if (!histogram) return null;
    const { counts, outside } = countBins(d.values, edges);
    return { counts, outside, heights: binHeights(counts, edges, d.values.length, opts.frequency, opts.cumulative) };
  });
  const ecdf = data.map((d) => (histogram ? null : ecdfSteps(d.values, opts.ecdfDirection)));
  const scaleOf = (n: number) => (opts.ecdfUnits === 'percent' ? 100 : opts.ecdfUnits === 'count' ? n : 1);
  // The level before the first value: 0 for "at or below", the whole (1, 100 or n) for "above". It is part of the path.
  const startLevel = (n: number) => (opts.ecdfDirection === 'atOrBelow' ? 0 : scaleOf(n));

  // 2. The axes: the value axis over the edges (or the values), the other from zero to the largest height.
  const allX = histogram ? edges : pooled;
  const allY = histogram ? bins.flatMap((b) => b?.heights ?? []) : ecdf.flatMap((e) => (e && e.steps.length ? [startLevel(e.n), ...e.steps.map((s) => s.f * scaleOf(e.n))] : []));
  const linear = { scale: 'linear' as const, reverse: false };
  const xAxis = resolveAxis(
    { values: allX, includeZero: false, min: chart.xAxis.min ?? (histogram && edges.length > 1 ? edges[0] : null), max: chart.xAxis.max ?? (histogram && edges.length > 1 ? edges[edges.length - 1] : null), majorInterval: chart.xAxis.majorInterval, tickCountHint: Math.max(3, Math.min(10, Math.round(W / 120))) },
    { ...chart.xAxis, ...linear },
  );
  const yAxis = resolveAxis(
    { values: allY.length ? [0, ...allY] : [], includeZero: true, min: chart.yAxis.min, max: chart.yAxis.max, majorInterval: chart.yAxis.majorInterval, tickCountHint: Math.max(3, Math.min(10, Math.round(H / 100))) },
    { ...chart.yAxis, ...linear },
  );
  warnings.push(...xAxis.warnings.map((w) => w.replace(/^Y /, 'X ').replace(/ Y limit/, ' X limit')), ...yAxis.warnings);

  const legendSeries = legendEntries(chart.legend, data.map((d) => d.g.id));
  const layout = computeLayout({
    fontFamily: chart.fontFamily,
    titleOffsetPt: chart.titleOffsetPt,
    widthPt: W,
    heightPt: H,
    title: chart.showTitle ? { text: chart.title, fontSizePt: chart.titleFontSizePt } : null,
    xAxis: chart.xAxis,
    yAxis: chart.yAxis,
    legend: chart.legend,
    legendLabels: legendSeries.map((i) => data[i].label),
    categoryLabels: [],
    yTickLabels: yAxis.ticks.map(yAxis.tickLabel),
  });
  warnings.push(...layout.warnings);
  const { plot } = layout;
  const xScale = axisMapper(xAxis, plot.x, plot.width);
  const yScale = axisMapper(yAxis, plot.y + plot.height, -plot.height);
  const [xLo, xHi] = xAxis.domain;

  // 3. Geometry.
  // Side by side: only the data sets that hold values take a place in each bin.
  const k = Math.max(1, data.filter((d) => d.values.length > 0).length);
  const slotOf = data.map((_, i) => data.slice(0, i).filter((d) => d.values.length > 0).length);
  const series: XySeries[] = data.map((d, si) => {
    const base = { groupId: d.g.id, label: d.label, style: d.style, errorPath: '', errorMeaning: null as string | null, skipped: 0 };
    if (histogram) {
      const b = bins[si]!;
      const gap = opts.gapPct / 100;
      const bars = b.heights.map((height, i) => {
        const [x0, x1] = [edges[i], edges[i + 1]];
        const slot = (x1 - x0) / (opts.arrangement === 'side' ? k : 1);
        const left = x0 + (opts.arrangement === 'side' ? slotOf[si] * slot : 0);
        const a = left + (slot * gap) / 2;
        const z = left + slot - (slot * gap) / 2;
        const top = yScale(height);
        const bottom = yScale(0);
        return { id: `${d.g.id}:bin:${i}`, x: Math.min(xScale(a), xScale(z)), y: Math.min(top, bottom), width: Math.abs(xScale(z) - xScale(a)), height: Math.abs(bottom - top), bin: [x0, x1] as [number, number], count: b.counts[i], value: height };
      });
      return { ...base, points: [] as XyPoint[], linePath: '', bars };
    }
    const e = ecdf[si]!;
    const mult = scaleOf(e.n);
    const points: XyPoint[] = e.steps.map((s, i) => ({ id: `${d.g.id}:step:${i}`, row: i, x: s.x, y: s.f * mult, px: xScale(s.x), py: yScale(s.f * mult), stats: null }));
    // Steps: level until the next value, then a jump. The level before the first value is 0 for "at or below", 1 for "above".
    let path = '';
    if (points.length > 0) {
      const before = startLevel(e.n);
      const after = points[points.length - 1].y;
      const left = opts.ecdfExtend ? xLo : points[0].x;
      const right = opts.ecdfExtend ? xHi : points[points.length - 1].x;
      let y = yScale(before);
      path = `M${n2(xScale(left))},${n2(y)}`;
      for (const p of points) {
        path += `H${n2(p.px)}V${n2(p.py)}`;
        y = p.py;
      }
      path += `H${n2(xScale(right))}`;
      void after;
    }
    return { ...base, points, linePath: path };
  });

  const outside = bins.reduce((n, b) => n + (b?.outside ?? 0), 0);
  if (outside > 0) warnings.push(`${outside} value${outside === 1 ? ' lies' : 's lie'} outside the bins and ${outside === 1 ? 'is' : 'are'} not counted.`);
  if (pooled.length === 0) warnings.push('Enter numbers in a column to see the chart.');
  if (histogram && opts.cumulative !== 'off' && opts.frequency === 'density') warnings.push('A cumulative histogram of a density shows the cumulative fraction.');
  if (histogram && edges.length > 400) warnings.push('There are very many bins; set a larger bin width.');

  const model: XyModel = { widthPt: W, heightPt: H, layout, x: xAxis, y: yAxis, xScale, yScale, series, legendSeries, warnings: [...new Set(warnings)], fit: NO_FIT_SETTINGS, layers: layersOf(chart, table) };
  attachLazyScene(chart, model);
  return model;
}
