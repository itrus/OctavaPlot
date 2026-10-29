import { rowTitleAt } from '../../model/table/rows';
import { isGroupedChartType, supportsHorizontal } from '../../model/graph/chartTypes';
import { resolveStyle, dataLayer } from '../../model/graph/style';
import { legendEntries, withoutRepeats } from '../../model/graph/legendEntries';
import { resolveSummary } from '../../model/graph/summary';
import { layoutOf, xySeries } from '../../model/table/tableLayout';
import { hasSubjects } from '../../model/table/subjects';
import { measureText } from '../shared/parts/text';
import { FACTOR_GAP, factorLayout, hasFactors, seriesPaletteIndex, usesFactors } from '../../model/table/factors';
import type { Chart, ChartStyle, DataTable, Id, SymbolShape } from '../../model/types';
import { resolveBarFill } from '../../model/graph/fill';
import { chartPx2Pt, extent, n2 } from '../../model/units';
import { summaryOf, type GroupStats } from '../../stats/summary';
import { boxSummary, densityProfile, normaliseProfiles, quantile6, sortedFinite, type BoxSummary, type DensityProfile } from '../../stats/distribution';
import { buildBox, buildViolin, type DistGeom } from '../shared/parts/distributionGeom';
import { boxNeeds, unplacedMarkNote } from '../shared/parts/distributionNotes';
import { buildErrorBar, clippedEndpointCount, errorEndValues, rangeValuesFor } from '../shared/parts/errorGeometry';
import { computeLayout, type Layout } from '../shared/parts/layout';
import { barLabelText, insideLabelText, placeBarLabel, placeInsideBarLabel, type BarLabelGeom, type InsideLabelGeom } from '../shared/parts/barLabels';
import { axisMapper, inBreak, onAxis, pathOfRuns, placeable, polylinesThroughBreaks, resolveAxis } from '../shared/axes/axisScale';
import type { YAxisScale } from '../shared/axes/scales';
import { layersOf, type LayerKind, type LayerSpec } from '../../model/graph/layers';
import { compileGroupedMarks } from './groupedMarks';
import type { ChromeScene } from '../shared/scene/scene';
import type { SceneElement } from '../shared/scene/sceneElement';
import type { Orientation } from '../shared/parts/orientation';
import { displayName } from '../shared/parts/names';
import { hash01 } from '../shared/parts/jitter';
import { suppliedStats } from '../../model/table/suppliedStats';
import { compileGroupedScene } from './groupedChrome';
import type { BracketGeom } from '../shared/parts/brackets';
import { placeBrackets } from '../shared/axes/bracketPlacement';
import { bracketKindOf } from '../../model/graph/chartTypes';

/** How the bars of a cluster are arranged: side by side, stacked as counts, or stacked as shares of the row total. */
type Arrangement = 'side' | 'stacked' | 'percent';

interface GroupedCategory {
  /** Table row of the category. */
  row: number;
  label: string;
  /** Centre of the category's slot, in chart pt. */
  centerX: number;
}

interface GroupedBar {
  /** Identity of the mark: the series and the table row. */
  id: Id;
  /** The observation of the first column of the series in the row: what names the mark in the drawing, whatever happens to the order of the rows. */
  obsId?: Id;
  row: number;
  categoryIndex: number;
  /** Value drawn: the centre, the count, or the percentage. */
  value: number;
  /** Rectangle in chart pt. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** The summary behind the value (replicates or entered), null for a single value. */
  stats: GroupStats | null;
  /** Counts of a contingency row: the share this bar is of its row. */
  count?: number;
  /** Value or sample size written above the bar, when the chart asks for it (side by side bars only). */
  label?: BarLabelGeom | null;
  /** Value or sample size written inside the bar, when the chart asks for it (side by side bars only). */
  insideLabel?: InsideLabelGeom | null;
  /** Floating bars: the lower and upper value of the bar, and the line across it at the centre. */
  range?: [number, number];
  centerLine?: { x1: number; x2: number; y: number };
  /** Box and violin charts: the body and lines of the cell, in place of the rectangle (which is then the box, or empty). */
  dist?: DistGeom | null;
}

interface GroupedPoint {
  id: Id;
  /** As for a bar: the observation of the first column of the series in the row. */
  obsId?: Id;
  row: number;
  px: number;
  py: number;
  value: number;
  stats: GroupStats | null;
  /** A mark of its own (the mean of a box plot); absent: the series' symbol. */
  shape?: SymbolShape;
}

interface GroupedSeries {
  groupId: Id;
  label: string;
  style: ChartStyle;
  bars: GroupedBar[];
  /** Lines over categories (groupedLine). */
  points: GroupedPoint[];
  /** Individual replicate values drawn over the bars (groupedBar with replicates, when symbols are on). */
  dots: GroupedPoint[];
  linePath: string;
  errorPath: string;
  errorMeaning: string | null;
}

/** The values of one subject joined across the series inside one category (grouped bars with `pairs.bySubject`). */
interface GroupedPairLine {
  id: Id;
  subject: string;
  categoryIndex: number;
  d: string;
}

/** The name of a factor written under its cluster of bars in one category. */
interface GroupedFactorLabel {
  id: Id;
  text: string;
  /** The left and right ends of the cluster on the page, and the top of the row the name is written in. */
  x1: number;
  x2: number;
  y: number;
  /** The size the name is written at: the tick size, smaller (to 60%) when the name is wider than its cluster. */
  fontPt: number;
}

export interface GroupedModel {
  widthPt: number;
  heightPt: number;
  layout: Layout;
  /** Horizontal bars are built as vertical ones in a virtual region and turned into place (see Orientation in shared/parts/orientation.ts). */
  orient: Orientation;
  arrangement: Arrangement;
  asLines: boolean;
  categories: GroupedCategory[];
  y: YAxisScale;
  yScale: (v: number) => number;
  series: GroupedSeries[];
  /** One line for each subject inside each category, when the chart joins them. */
  pairLines: GroupedPairLine[];
  /** The names of the factors under their clusters (see model/table/factors.ts); none when no series names a factor. */
  factorLabels: GroupedFactorLabel[];
  /** Grouped by series: where each column stands along the axis (one for each series and category) and its category name; absent when grouped by category. */
  axisColumns?: Array<{ key: string; centerX: number; label: string }>;
  /** Comparison brackets between two series of a category, or two categories, in the vertical drawing (see model/types.ts Bracket). */
  brackets: BracketGeom[];
  /** Index into `series` of each legend entry. */
  legendSeries: number[];
  warnings: string[];
  /** The layers the chart is drawn from, lowest first (see model/graph/layers.ts). */
  layers: LayerSpec[];
  /** The chrome of the chart (clip, backgrounds, grids, axes, titles, legend) as scene elements. */
  scene?: ChromeScene;
}

/** Share of a category's slot taken by its cluster of bars. */
const CLUSTER_FRACTION = 0.8;

const arrangementOf = (type: Chart['type']): Arrangement => (type === 'contingencyStacked' || type === 'groupedStacked' ? 'stacked' : type === 'contingencyPercent' ? 'percent' : 'side');

/**
 * Model of grouped and contingency charts. The categories are the rows of the table that hold something; the series
 * are its blocks of columns. A grouped table gives each (series, category) a value from one cell, from replicates, or
 * from entered statistics; a contingency table gives a count, shown as it is, stacked, or as a share of the row.
 */
export function buildGroupedModel(chart: Chart, table: DataTable): GroupedModel {
  if (!isGroupedChartType(chart.type)) throw new Error('buildGroupedModel needs a grouped or contingency chart');
  const [W, H] = [chartPx2Pt(chart.widthPx), chartPx2Pt(chart.heightPx)];
  const layer = dataLayer(chart);
  const layout = layoutOf(table);
  const arrangement = arrangementOf(chart.type);
  const asLines = chart.type === 'groupedLine';
  const floating = chart.type === 'groupedFloating';
  const isDist = chart.type === 'groupedBox' || chart.type === 'groupedViolin';
  const opts = chart.distribution;
  const contingency = table.kind === 'contingency';
  const warnings: string[] = [];
  const seriesDefs = xySeries(table);
  // Series that name the same factor are drawn together: the clusters (null when none does, or the chart has no side-by-side bars).
  // Separated: the columns of a series stand together, one for each category, and the series follow each other (instead of the series standing side by side inside each category).
  const separated = usesFactors(chart.type) && !contingency && chart.groupedBy === 'series';
  const clusters = usesFactors(chart.type) && !contingency && !separated ? factorLayout(seriesDefs) : null;
  const labelOfRow = (r: number) => rowTitleAt(table, r).trim() || `row ${r + 1}`;

  // 1. Categories: rows with a title or any value.
  const categoryRows: number[] = [];
  for (let r = 0; r < table.rowCount; r++) {
    const hasValue = seriesDefs.some((s) => s.columns.some((c) => c.observations[r]?.value !== null && c.observations[r]?.value !== undefined));
    if (rowTitleAt(table, r).trim() !== '' || hasValue) categoryRows.push(r);
  }

  // 2. Per series and category: value and summary.
  const rowTotals = categoryRows.map((r) => seriesDefs.reduce((sum, s) => sum + Math.max(0, s.columns[0].observations[r]?.value ?? 0), 0));
  let negative = 0;
  const noError: string[] = [];
  const raw = seriesDefs.map((s, si) => {
    const style = resolveStyle(chart, layer, { id: s.id, paletteIndex: seriesPaletteIndex(chart, seriesDefs.map((d) => d.columns[0]), si) });
    const spec = resolveSummary(layer, s.id);
    let meaning: string | null = null;
    const cells = categoryRows.map((r, ci) => {
      const values = s.columns.map((c) => c.observations[r]?.value ?? null);
      let value: number | null = null;
      let stats: GroupStats | null = null;
      if (contingency) {
        const v = values[0];
        if (v !== null && v < 0) negative++;
        value = v === null || v < 0 ? null : v;
        if (value !== null && arrangement === 'percent') value = rowTotals[ci] > 0 ? (value / rowTotals[ci]) * 100 : null;
      } else if (layout.kind === 'single' || layout.kind === 'sized' || layout.kind === 'vector' || layout.kind === 'xerror') value = values[0];
      else if (layout.kind === 'replicates') {
        stats = summaryOf(values, spec);
        value = stats.centre;
        if (value !== null && stats.effectiveSpread !== 'none' && stats.interval.status === 'unavailable') noError.push(`${s.name}, ${labelOfRow(r)}`);
      } else {
        const supplied = suppliedStats(layout.format, values);
        if (supplied) {
          stats = supplied.stats;
          value = stats.centre;
          meaning = supplied.meaning;
          if (stats.interval.status !== 'ok') noError.push(`${s.name}, ${labelOfRow(r)}`);
        }
      }
      // The replicate values themselves, with the observation each came from, for the dots over the bars.
      const reps = layout.kind === 'replicates' && !contingency ? s.columns.flatMap((c) => (c.observations[r]?.value === null || c.observations[r] === undefined ? [] : [{ id: c.observations[r].id, value: c.observations[r].value as number, subject: c.observations[r].subject ?? '' }])) : [];
      // A floating bar spans the replicate values, or the interval of values entered as limits.
      let span: [number, number] | null = null;
      if (floating) {
        if (reps.length > 0) span = extent(reps.map((x) => x.value));
        else if (stats?.interval.status === 'ok' && stats.interval.lower !== null && stats.interval.upper !== null) span = [stats.interval.lower, stats.interval.upper];
      }
      // Box plots and violins work on all the replicate values, whatever the axis: the axis only decides what of them can be drawn.
      let dist: { values: number[]; summary: BoxSummary | null; profile: DensityProfile | null; sorted: number[] } | null = null;
      if (isDist && reps.length > 0) {
        const values = reps.map((x) => x.value);
        dist = { values, summary: chart.type === 'groupedBox' ? boxSummary(values, opts.whisker, opts.tukeyK) : null, profile: chart.type === 'groupedViolin' ? densityProfile(values, { smoothing: opts.smoothing, bandwidth: opts.bandwidth, trim: opts.trim }) : null, sorted: sortedFinite(values) };
        value = dist.sorted.length > 0 ? quantile6(dist.sorted, 0.5) : null;
      }
      return { row: r, ci, value, stats, count: contingency ? (values[0] ?? undefined) : undefined, reps, span, dist };
    });
    return { s, style, cells, meaning, label: displayName(chart, s.id, s.name) };
  });
  if (noError.length > 0) warnings.push(`No error bar for ${noError.length} value${noError.length === 1 ? '' : 's'} (${noError.slice(0, 3).join('; ')}${noError.length > 3 ? '; ...' : ''}): the error is missing or negative, or there are too few replicates.`);
  if (negative > 0) warnings.push(`${negative} count${negative === 1 ? ' is' : 's are'} negative and not drawn: counts cannot be below zero.`);

  // 3. The value axis: bars start at zero; stacked values are summed; percent is 0 to 100 unless set by hand.
  // Positive parts pile up above the baseline and negative ones below it (spec 8.4); the axis shows both piles.
  const stackedTotals = categoryRows.flatMap((_, ci) => [raw.reduce((sum, r) => sum + Math.max(0, r.cells[ci].value ?? 0), 0), raw.reduce((sum, r) => sum + Math.min(0, r.cells[ci].value ?? 0), 0)]);
  // Individual values are shown over bars of replicates, not over lines or counts.
  if (isDist && layout.kind !== 'replicates') warnings.push('Box plots and violins need the replicate values: enter the data as replicates.');
  // Grouped bars of replicates can join the values of each subject across the series, inside each category.
  const subjectLines = chart.type === 'groupedBar' && chart.pairs.bySubject && layout.kind === 'replicates';
  const showDots = (style: ChartStyle) => (chart.type === 'groupedBar' || floating) && layout.kind === 'replicates' && style.showSymbols;
  // A part kept out of the range (see rangeContribution in model/graph/layers.ts) adds nothing to it; the centre of a bar is the data and always counts.
  const layerList = layersOf(chart, table);
  const inRange = (kind: LayerKind, seriesId: Id): boolean => layerList.find((l) => l.id === `${seriesId}:${kind}`)?.rangeContribution ?? true;
  /** What a cell of a box plot or violin occupies on the value axis: the body, then the dots on it (a layer of their own). */
  const distShow = (c: (typeof raw)[number]['cells'][number], style: ChartStyle, seriesId: Id): number[] => {
    const d = c.dist;
    if (!d) return [];
    const body: number[] = [];
    const dots: number[] = [];
    if (d.summary) {
      body.push(d.summary.whiskerLow, d.summary.whiskerHigh, d.summary.q1, d.summary.q3);
      dots.push(...(style.showSymbols ? (opts.points === 'all' ? [d.summary.min, d.summary.max] : opts.points === 'outside' ? d.summary.outliers : []) : []));
    }
    if (chart.type === 'groupedViolin') {
      if (d.profile) body.push(d.profile.v[0], d.profile.v[d.profile.v.length - 1]);
      else body.push(...d.sorted);
      if (opts.points === 'all' && style.showSymbols && d.sorted.length) dots.push(d.sorted[0], d.sorted[d.sorted.length - 1]);
    }
    return [...(inRange('bars', seriesId) ? body : []), ...(inRange('rawPoints', seriesId) ? dots : [])];
  };
  /** What a cell of side by side bars asks the axis to show. */
  const cellShows = (r: (typeof raw)[number], c: (typeof raw)[number]['cells'][number]): number[] =>
    isDist
      ? distShow(c, r.style, r.s.id)
      : c.value === null ? [] : floating ? (c.span && inRange('bars', r.s.id) ? [...c.span, c.value] : []) : [...(c.stats ? rangeValuesFor(c.stats, r.style.showErrorBars && inRange('errorBars', r.s.id), r.style.errorDirection) : [c.value]), ...(showDots(r.style) && inRange('rawPoints', r.s.id) ? c.reps.map((x) => x.value) : [])];
  const allY = isDist || arrangement === 'side' ? raw.flatMap((r) => r.cells.flatMap((c) => cellShows(r, c))) : stackedTotals;
  const horizontal = chart.orientation === 'horizontal' && supportsHorizontal(chart.type);
  const tickCountHint = Math.max(3, Math.min(10, Math.round(horizontal ? W / 120 : H / 100)));
  // Log scales suit values side by side or on lines, not stacked parts or percentages, so those stay linear.
  const axisCfg = arrangement === 'side' ? chart.yAxis : { ...chart.yAxis, scale: 'linear' as const, reverse: false };
  // Comparison brackets: each end is a series in a category, and the bracket stands above everything the places between its ends draw (and above the
  // brackets it overlaps); the axis grows to show it and its label. A bracket that is hidden still takes its room. Places are in the order they stand across the chart.
  const bracketing = bracketKindOf(chart.type) === 'grouped' && arrangement === 'side' && chart.brackets.length > 0;
  const slots = bracketing
    ? raw
        .flatMap((r, si) => r.cells.map((c) => {
          const shown = cellShows(r, c);
          return { id: `${r.s.id}:${c.row}`, at: separated ? si * categoryRows.length + c.ci : c.ci * 1000 + (clusters ? clusters.slot[si] : si), top: shown.length > 0 ? Math.max(...shown) : NaN };
        }))
        .sort((a, b) => a.at - b.at)
    : [];
  const firstRow = categoryRows[0] ?? 0;
  const endsOf = (b: Chart['brackets'][number]): [Id, Id] => [`${b.from}:${b.row ?? firstRow}`, `${b.to}:${b.toRow ?? b.row ?? firstRow}`];
  const placement = placeBrackets({
    brackets: bracketing ? chart.brackets : [],
    order: slots.map((sl) => sl.id),
    tops: slots.map((sl) => (Number.isFinite(sl.top) ? sl.top : null)),
    primary: slots.map(() => true),
    log: axisCfg.scale !== 'linear',
    values: allY,
    includeZero: axisCfg.scale === 'linear' && !isDist,
    // The value axis is the length of the chart (its width for a horizontal chart) less the margins, the title and the labels: about 60%.
    plotLengthPt: (horizontal ? W : H) * 0.6,
    ends: endsOf,
    strictEnds: true,
  });
  for (const sk of placement.skipped) warnings.push(`Bracket "${sk.bracket.label.trim() || 'no label'}" is not drawn: ${sk.reason}.`);
  // A bracket kept out of the range (see rangeContribution) is still placed, but the axis does not grow to show it: the plot clips it.
  const bracketTops = placement.placed.filter((p) => inRange('bracket', p.bracket.id)).map((p) => p.top);
  const yAxis = resolveAxis({
    values: arrangement === 'percent' ? [0, 100] : [...allY, ...bracketTops],
    includeZero: axisCfg.scale === 'linear' && !isDist && (!asLines || allY.every((v) => v >= 0)),
    min: chart.yAxis.min ?? (arrangement === 'percent' ? 0 : null),
    max: chart.yAxis.max ?? (arrangement === 'percent' ? 100 : null),
    majorInterval: chart.yAxis.majorInterval,
    tickCountHint,
  }, axisCfg);
  warnings.push(...yAxis.warnings);

  // 4. Layout with the category labels along the X axis.
  // Factor clusters repeat their series: a series in the same place of two clusters has the same colour, and is listed once when it has the same name too.
  const legendAll = legendEntries(chart.legend, raw.map((r) => r.s.id));
  const legendSeries = clusters ? withoutRepeats(legendAll, (i) => `${clusters.position[i]}|${raw[i].label}`) : legendAll;
  const labels = categoryRows.map((r) => rowTitleAt(table, r).trim() || `Row ${r + 1}`);
  // Separated: the labels along the axis are those of every column, so the layout can tell when they have to turn.
  const axisLabels = separated ? raw.flatMap(() => labels) : labels;
  const lay = computeLayout({
    fontFamily: chart.fontFamily,
    titleOffsetPt: chart.titleOffsetPt,
    widthPt: W,
    heightPt: H,
    title: chart.showTitle ? { text: chart.title, fontSizePt: chart.titleFontSizePt } : null,
    // Horizontal: the numbers run along the bottom (the value axis settings) and the category names down the left.
    xAxis: horizontal ? chart.yAxis : chart.xAxis,
    yAxis: horizontal ? chart.xAxis : chart.yAxis,
    legend: chart.legend,
    legendLabels: legendSeries.map((i) => raw[i].label),
    categoryLabels: horizontal ? [] : axisLabels,
    yTickLabels: horizontal ? labels : yAxis.ticks.map(yAxis.tickLabel),
    categoryRowPt: (clusters || separated) && !horizontal ? chart.xAxis.tickFontSizePt * 1.6 : 0,
  });
  warnings.push(...lay.warnings);
  // The geometry below is made in the virtual region (the real one when vertical).
  const real = lay.plot;
  const plot = horizontal ? { x: real.x, y: real.y, width: real.height, height: real.width } : real;
  const orient: Orientation = horizontal
    ? { horizontal, real, virtual: plot, toScreen: (x, y) => ({ x: real.x + (plot.y + plot.height - y), y: real.y + (x - plot.x) }), matrix: `matrix(0 1 -1 0 ${n2(real.x + plot.y + plot.height)} ${n2(real.y - plot.x)})` }
    : { horizontal, real, virtual: real, toScreen: (x, y) => ({ x, y }), matrix: null };
  const [y0, y1] = yAxis.domain;
  const yScale = axisMapper(yAxis, plot.y + plot.height, -plot.height);
  const slot = plot.width / Math.max(1, categoryRows.length);
  const categories: GroupedCategory[] = categoryRows.map((row, i) => ({ row, label: labels[i], centerX: plot.x + slot * (i + 0.5) }));
  if (categoryRows.length === 0) warnings.push('Enter a category name or values in the table to see the chart.');

  // 5. Geometry.
  const nSeries = Math.max(1, raw.length);
  const cluster = slot * CLUSTER_FRACTION;
  // Separated: one column for each series and category, in groups with the same gap as factor clusters; a column takes the share of a slot a bar of a cluster does.
  const sepUnits = nSeries * Math.max(1, categoryRows.length) + FACTOR_GAP * (nSeries - 1);
  const sepUnit = plot.width / sepUnits;
  const sepCentre = (si: number, ci: number): number => plot.x + sepUnit * (si * categoryRows.length + FACTOR_GAP * si + ci + 0.5);
  const baseline = Math.min(Math.max(yAxis.log ? 0 : (chart.bars.baseline ?? 0), y0), y1);
  const violinWidths = chart.type === 'groupedViolin' ? normaliseProfiles(raw.flatMap((r) => r.cells.map((c) => c.dist?.profile ?? null)), opts.normalisation) : [];
  let cellIndex = -1;
  const stackUp = new Array<number>(categoryRows.length).fill(0);
  const stackDown = new Array<number>(categoryRows.length).fill(0);
  let clipped = 0;
  let offAxis = 0;
  let inGap = 0;
  let gapErrorBars = 0;
  let noSpan = 0;
  // Marks of a box or violin are made from whole-sample statistics; a value with no place gives no coordinate, so the mark is not drawn.
  const toYDraw = (v: number) => (placeable(yAxis, v) ? yScale(v) : NaN);
  // An end inside an omitted range would be drawn at the edge of the gap as if that were its value: the bar is not drawn then.
  const errorEndInGap = (stats: GroupStats, style: ChartStyle): boolean => {
    const bad = errorEndValues(stats, style.showErrorBars, style.errorDirection).some((v) => inBreak(yAxis, v));
    if (bad) gapErrorBars++;
    return bad;
  };
  const series: GroupedSeries[] = raw.map((r, si) => {
    const bars: GroupedBar[] = [];
    const points: GroupedPoint[] = [];
    const dots: GroupedPoint[] = [];
    // Lines over categories, in data units: a missing category (null) ends a line.
    const lineSeq: Array<{ x: number; y: number } | null> = [];
    let errorPath = '';
    let errorMeaning: string | null = null;
    let prevCi = -2;
    for (const cell of r.cells) {
      cellIndex++;
      if (cell.value === null) continue;
      // A value with no position on a log axis (0 or less) is left out and counted. A box or a violin is made from the
      // whole sample, so only what it needs of the axis decides whether it is drawn.
      if (!isDist && !onAxis(yAxis, cell.value)) {
        offAxis++;
        continue;
      }
      const valueInGap = !isDist && !floating && arrangement === 'side' && inBreak(yAxis, cell.value);
      const cat = categories[cell.ci];
      const id = `${r.s.id}:${cell.row}`;
      if (asLines) {
        const px = cat.centerX;
        if (cell.ci !== prevCi + 1) lineSeq.push(null);
        lineSeq.push({ x: px, y: cell.value });
        prevCi = cell.ci;
        // A value inside an omitted range has no point, but the line still runs to the edge of the gap.
        if (valueInGap) {
          inGap++;
          continue;
        }
        points.push({ id, obsId: r.s.columns[0].observations[cell.row]?.id, row: cell.row, px, py: yScale(cell.value), value: cell.value, stats: cell.stats });
        if (cell.stats && !errorEndInGap(cell.stats, r.style)) {
          const bar = buildErrorBar({ groupId: r.s.id, centerX: px, stats: cell.stats, style: r.style, yScale, domain: yAxis.domain, log: !!yAxis.log });
          if (bar) {
            errorPath += bar.d;
            errorMeaning = r.meaning ?? bar.meaning;
            clipped += clippedEndpointCount([bar]);
          }
        }
        continue;
      }
      const stacked = arrangement !== 'side';
      const bw = stacked ? cluster * 0.75 : separated ? sepUnit * CLUSTER_FRACTION : cluster / (clusters?.units ?? nSeries);
      const x = stacked ? cat.centerX - bw / 2 : separated ? sepCentre(si, cell.ci) - bw / 2 : cat.centerX - cluster / 2 + (clusters ? clusters.slot[si] : si) * bw;
      // Box plots and violins of a cell with no replicate values have nothing to draw.
      if (isDist && !cell.dist) continue;
      // A bar whose value is inside an omitted range would be drawn as if it ended at the edge of the gap.
      if (valueInGap) {
        inGap++;
        continue;
      }
      if (isDist && cell.dist) {
        const centerX = x + bw / 2;
        const common = { groupId: id, centerX, toY: toYDraw, opts, lineColor: r.style.lineColor, lineWidthPt: r.style.lineWidthPt, lineOpacity: r.style.lineOpacity };
        const dist = chart.type === 'groupedBox' ? buildBox({ ...common, width: bw * opts.boxWidth, summary: cell.dist.summary }) : buildViolin({ ...common, halfWidth: (bw * opts.violinWidth) / 2, profile: cell.dist.profile, widths: violinWidths[cellIndex] ?? null, values: cell.dist.values });
        const rect = dist?.rect ?? { x: centerX, y: toYDraw(cell.value), width: 0, height: 0 };
        const summary = cell.dist.summary;
        const owner = `${r.label}, ${categories[cell.ci].label}`;
        const n = cell.dist.sorted.length;
        if (!dist && summary) {
          const note = unplacedMarkNote(yAxis, 'Box', owner, boxNeeds(summary), n);
          if (note) warnings.push(note);
        } else if (chart.type === 'groupedViolin') {
          const v = cell.dist.profile?.v ?? cell.dist.sorted;
          const all = `The statistics include all ${n} value${n === 1 ? '' : 's'}.`;
          if (!dist) warnings.push(`Violin of ${owner} is not drawn: too little of it lies where the axis can show it. ${all}`);
          else if (cell.dist.profile && (!placeable(yAxis, v[0]) || !placeable(yAxis, v[v.length - 1]))) warnings.push(`Violin of ${owner} is drawn only where the axis can show it. ${all}`);
        }
        if (Number.isFinite(rect.y)) bars.push({ id, obsId: r.s.columns[0].observations[cell.row]?.id, row: cell.row, categoryIndex: cell.ci, value: cell.value, ...rect, stats: null, dist });
        const wantDot = (v: number): boolean => {
          if (!r.style.showSymbols) return false;
          if (opts.points === 'all') return true;
          return opts.points === 'outside' && chart.type === 'groupedBox' && !!summary && (v < summary.whiskerLow || v > summary.whiskerHigh);
        };
        // With no density the values themselves are the picture of a violin.
        const showAll = chart.type === 'groupedViolin' && dist?.shape === 'points';
        const dotWidth = dist?.kind === 'box' ? bw * opts.boxWidth : bw * opts.violinWidth;
        for (const rep of cell.reps) {
          if (!onAxis(yAxis, rep.value) || (!showAll && !wantDot(rep.value))) continue;
          if (inBreak(yAxis, rep.value)) {
            inGap++;
            continue;
          }
          dots.push({ id: rep.id, row: cell.row, px: centerX + (chart.jitter.enabled ? (hash01(rep.id) - 0.5) * chart.jitter.widthFraction * dotWidth : 0), py: yScale(rep.value), value: rep.value, stats: null });
        }
        if (opts.showMean && summary && Number.isFinite(toYDraw(summary.mean))) dots.push({ id: `${id}:mean`, row: cell.row, px: centerX, py: toYDraw(summary.mean), value: summary.mean, stats: null, shape: 'plus' });
        if (dist?.note) warnings.push(`${r.label}, ${categories[cell.ci].label}: ${dist.note}.`);
        continue;
      }
      let from = baseline;
      let to = cell.value;
      if (floating) {
        // A floating bar needs a lower and an upper value; a single value has none.
        if (!cell.span) {
          noSpan++;
          continue;
        }
        [from, to] = cell.span;
        if (!onAxis(yAxis, from) || !onAxis(yAxis, to)) {
          offAxis++;
          continue;
        }
        if (inBreak(yAxis, from) || inBreak(yAxis, to)) {
          inGap++;
          continue;
        }
      }
      if (stacked) {
        // A part is as high as its own value; positive values pile up from the baseline, negative ones down from it.
        const pile = cell.value < 0 ? stackDown : stackUp;
        from = pile[cell.ci];
        to = from + cell.value;
        pile[cell.ci] = to;
        // A part with an end inside an omitted range would be drawn as if it ended at the edge of the gap; the pile still grows by it.
        if (inBreak(yAxis, from) || inBreak(yAxis, to)) {
          inGap++;
          continue;
        }
      }
      const pa = yScale(from);
      const pb = yScale(to);
      const yTop = Math.min(pa, pb);
      const yBottom = Math.max(pa, pb);
      const gbar: GroupedBar = { id, obsId: r.s.columns[0].observations[cell.row]?.id, row: cell.row, categoryIndex: cell.ci, value: cell.value, x, y: yTop, width: bw, height: Math.max(0, yBottom - yTop), stats: cell.stats, count: cell.count };
      if (floating) {
        gbar.range = [from, to];
        if (placeable(yAxis, cell.value)) gbar.centerLine = { x1: x, x2: x + bw, y: yScale(cell.value) };
      } else if (chart.type === 'groupedBar' && r.style.showMeanLine) {
        gbar.centerLine = { x1: x, x2: x + bw, y: yScale(cell.value) };
      }
      bars.push(gbar);
      if (showDots(r.style)) {
        // Spread across the bar's width by a fixed hash of the observation, so the picture is the same every time.
        // The dots of a chart that joins the subjects stay on the line of their series, or a subject's line would not meet them.
        const spread = chart.jitter.enabled && !subjectLines ? bw * chart.jitter.widthFraction : 0;
        for (const rep of cell.reps) if (placeable(yAxis, rep.value)) dots.push({ id: rep.id, row: cell.row, px: x + bw / 2 + (hash01(rep.id) - 0.5) * spread, py: yScale(rep.value), value: rep.value, stats: null });
      }
      let errTop: number | null = null;
      let errBottom: number | null = null;
      if (cell.stats && !stacked && !floating && !errorEndInGap(cell.stats, r.style)) {
        const bar = buildErrorBar({ groupId: r.s.id, centerX: x + bw / 2, stats: cell.stats, style: r.style, yScale, domain: yAxis.domain, log: !!yAxis.log });
        if (bar) {
          errorPath += bar.d;
          errorMeaning = r.meaning ?? bar.meaning;
          clipped += clippedEndpointCount([bar]);
          errTop = bar.top;
          errBottom = bar.bottom;
        }
      }
      if (arrangement === 'side' && !floating) {
        const text = barLabelText(chart.barLabels, cell.value, cell.count ?? cell.stats?.n ?? null);
        const yBase = yScale(baseline);
        if (text !== null && Number.isFinite(pb) && Number.isFinite(yBase)) {
          const far = pb <= yBase ? (errTop ?? pb) : (errBottom ?? pb);
          gbar.label = { id: `${id}:label`, ...placeBarLabel(chart.barLabels, x + bw / 2, pb, far, yBase), text };
        }
        const insideText = insideLabelText(chart.barLabels, cell.value, cell.count ?? cell.stats?.n ?? null);
        if (insideText !== null && chart.barLabels.inside && r.style.showBars && Number.isFinite(pb) && Number.isFinite(yBase)) {
          const visible = (y: number) => Math.min(plot.y + plot.height, Math.max(plot.y, y));
          const placed = placeInsideBarLabel({ id, owner: `${r.label}, ${categories[cell.ci].label}`, cfg: chart.barLabels, inside: chart.barLabels.inside, text: insideText, fontFamily: chart.fontFamily, x: x + bw / 2, width: bw, yEnd: visible(pb), yBase: visible(yBase), horizontal, fill: { ...resolveBarFill(r.style), mode: r.style.barFillMode === 'none' ? 'none' : 'solid' }, page: chart.pageColor ?? '#ffffff' });
          gbar.insideLabel = placed.label;
          if (placed.warning) warnings.push(placed.warning);
        }
      }
    }
    const linePath = pathOfRuns(polylinesThroughBreaks(lineSeq, { log: null, reverse: false }, yAxis), yScale, n2);
    return { groupId: r.s.id, label: r.label, style: r.style, bars, points, dots, linePath, errorPath, errorMeaning };
  });
  if (offAxis > 0) warnings.push(`${offAxis} value${offAxis === 1 ? ' is' : 's are'} 0 or less on a log axis and ${offAxis === 1 ? 'is' : 'are'} not drawn; the statistics include ${offAxis === 1 ? 'it' : 'them'}.`);
  if (inGap > 0) warnings.push(`${inGap} value${inGap === 1 ? ' lies' : 's lie'} inside an omitted range of the axis and ${inGap === 1 ? 'is' : 'are'} not drawn.`);
  if (gapErrorBars > 0) warnings.push(`${gapErrorBars} error bar${gapErrorBars === 1 ? ' has' : 's have'} an end inside an omitted range of the axis and ${gapErrorBars === 1 ? 'is' : 'are'} not drawn.`);
  if (noSpan > 0) warnings.push(`${noSpan} value${noSpan === 1 ? ' has' : 's have'} no range to draw a floating bar from: enter replicates, or limits as the values already calculated.`);
  if (clipped > 0) warnings.push(clipped === 1 ? '1 error bar end lies outside the axis range and is clipped.' : `${clipped} error bar ends lie outside the axis range and are clipped.`);

  // Subject lines: inside each category, the mean of a subject's replicates in each series, joined from the first series to the last. A series
  // without a value for the subject breaks the line unless the chart bridges it (the values either side are joined; none is made up). A line needs two values.
  const pairLines: GroupedPairLine[] = [];
  if (chart.type === 'groupedBar' && chart.pairs.bySubject && separated) warnings.push('Lines joining the subjects are drawn inside each category; with the columns grouped by series there is none.');
  if (chart.type === 'groupedBar' && chart.pairs.bySubject && !separated) {
    if (layout.kind !== 'replicates') warnings.push('Lines joining the subjects need the replicate values: enter the data as replicates.');
    else if (!hasSubjects(table)) warnings.push('Lines are drawn for each subject, but no value has a subject: name the subjects in the data table (Subject…).');
    else {
      let loose = 0;
      categories.forEach((cat, ci) => {
        const subjects: string[] = [];
        for (const r of raw) {
          for (const rep of r.cells[ci]?.reps ?? []) {
            if (rep.subject === '') loose++;
            else if (!subjects.includes(rep.subject)) subjects.push(rep.subject);
          }
        }
        for (const subject of subjects) {
          const seq: Array<{ x: number; y: number } | null> = [];
          let have = 0;
          raw.forEach((r, si) => {
            const values = (r.cells[ci]?.reps ?? []).filter((x) => x.subject === subject && onAxis(yAxis, x.value)).map((x) => x.value);
            if (values.length === 0) {
              if (!chart.pairs.bridge) seq.push(null);
              return;
            }
            const bw = cluster / (clusters?.units ?? nSeries);
            seq.push({ x: cat.centerX - cluster / 2 + (clusters ? clusters.slot[si] : si) * bw + bw / 2, y: values.reduce((a, b) => a + b, 0) / values.length });
            have++;
          });
          if (have < 2) continue;
          const d = pathOfRuns(polylinesThroughBreaks(seq, { log: null, reverse: false }, yAxis), yScale, n2);
          if (d !== '') pairLines.push({ id: `pair:${ci}:${subject}`, subject, categoryIndex: ci, d });
        }
      });
      if (loose > 0) warnings.push(`${loose} value${loose === 1 ? ' has' : 's have'} no subject and ${loose === 1 ? 'is' : 'are'} not joined by a line.`);
    }
  }

  // The names of the factors, one row under the category labels. A horizontal chart has no such row.
  const factorLabels: GroupedFactorLabel[] = [];
  // A name is written at the tick size, or smaller (down to 60%) so that it fits the width of its cluster with a little room either side.
  const fitName = (text: string, width: number): number => {
    const size = chart.xAxis.tickFontSizePt;
    const wide = measureText(text, size, chart.xAxis.tickBold, false, chart.fontFamily);
    return wide > 0 ? Math.max(size * 0.6, Math.min(size, (size * Math.max(0, width - 6)) / wide)) : size;
  };
  if (separated && hasFactors(seriesDefs)) warnings.push('The factors of the series are not used while the columns are grouped by series.');
  if (separated) {
    // The name of each series under its group of columns.
    if (horizontal) warnings.push('The names of the series are not written under their groups on a horizontal chart.');
    else if (lay.categoryRow) {
      raw.forEach((r, si) => factorLabels.push({ id: `series:${r.s.id}`, text: r.label, x1: sepCentre(si, 0) - sepUnit / 2, x2: sepCentre(si, Math.max(0, categoryRows.length - 1)) + sepUnit / 2, fontPt: fitName(r.label, sepCentre(si, Math.max(0, categoryRows.length - 1)) - sepCentre(si, 0) + sepUnit), y: lay.categoryRow!.y }));
    }
  } else if (clusters) {
    if (horizontal) warnings.push('The names of the factors are not written on a horizontal chart.');
    else if (lay.categoryRow) {
      const unit = cluster / clusters.units;
      for (const cat of categories) {
        for (const c of clusters.clusters) {
          if (c.factor === '') continue;
          const x1 = cat.centerX - cluster / 2 + c.start * unit;
          factorLabels.push({ id: `factor:${cat.row}:${c.factor}`, text: c.factor, x1, x2: x1 + c.series.length * unit, fontPt: fitName(c.factor, c.series.length * unit), y: lay.categoryRow.y });
        }
      }
    }
  }

  // The brackets as geometry: the places of the two ends across (the middle of the bar of a series in a category), and the height of the bar of the bracket.
  const barWidth = separated ? sepUnit * CLUSTER_FRACTION : cluster / (clusters?.units ?? nSeries);
  const centreOf = (id: Id): number => {
    const si = raw.findIndex((r) => id.startsWith(`${r.s.id}:`));
    const ci = categoryRows.indexOf(Number(id.slice(raw[si].s.id.length + 1)));
    return separated ? sepCentre(si, ci) : categories[ci].centerX - cluster / 2 + (clusters ? clusters.slot[si] : si) * barWidth + barWidth / 2;
  };
  const brackets: BracketGeom[] = placement.placed.flatMap((p) => {
    const [a, b] = endsOf(p.bracket);
    const at = yScale(p.value);
    if (!Number.isFinite(at) || inBreak(yAxis, p.value)) return [];
    return [{ id: p.bracket.id, label: p.bracket.label, x1: centreOf(a), x2: centreOf(b), y: at, tick: Math.max(6, p.bracket.fontSizePt * 0.6), color: p.bracket.color, widthPt: p.bracket.widthPt, fontSizePt: p.bracket.fontSizePt }];
  });
  const model: GroupedModel = { widthPt: W, heightPt: H, layout: lay, orient, arrangement, asLines, categories, y: yAxis, yScale, series, pairLines, factorLabels, brackets, ...(separated ? { axisColumns: raw.flatMap((r, si) => categories.map((cat, ci) => ({ key: `${r.s.id}:${cat.row}`, centerX: sepCentre(si, ci), label: cat.label }))) } : {}), legendSeries, warnings: [...new Set(warnings)], layers: layersOf(chart, table) };
  model.scene = compileGroupedScene(chart, model);
  // The marks are compiled when a drawing, an export or a hit test first asks for them.
  let marks: SceneElement[] | undefined;
  Object.defineProperty(model.scene, 'marks', { enumerable: false, configurable: true, get: () => (marks ??= compileGroupedMarks(chart, model)) });
  return model;
}
