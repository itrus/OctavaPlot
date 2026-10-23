import { isSurvivalChartType } from '../model/chartTypes';
import { resolveStyle } from '../model/style';
import { xySeries } from '../model/tableLayout';
import { NO_FIT_SETTINGS } from '../model/fitOptions';
import type { Chart, DataTable, SurvivalBandMethod } from '../model/types';
import { chartPx2Pt, n2 } from '../model/units';
import { normalQuantile } from '../stats/special';
import { computeLayout } from './layout';
import { displayName } from './model';
import { resolveAxis } from './axisScale';
import type { AtRiskTable, XyModel, XyPoint, XySeries } from './xyModel';

interface SurvivalStep {
  /** Time of an event (the estimate drops here). */
  time: number;
  /** Estimate after the events at this time. */
  survival: number;
  /** Subjects still under observation just before this time. */
  atRisk: number;
  events: number;
  /** Table row of the first subject with the event at this time. */
  row: number;
  /** Greenwood sum: the cumulative sum of d / (n (n - d)) over the event times up to this one. Infinite when n = d. */
  greenwood: number;
}

interface CensorMark {
  time: number;
  /** Estimate at the censoring time. */
  survival: number;
  row: number;
}

interface KaplanMeier {
  steps: SurvivalStep[];
  marks: CensorMark[];
  /** Subjects counted (events + censored). */
  n: number;
  events: number;
  /** The time of every subject, sorted: the number at risk at t is how many are at least t. */
  times: number[];
}

/**
 * Product-limit (Kaplan-Meier) estimate. `subjects` are (time, event, row): event true = the event happened, false =
 * censored. At a tied time the events are counted before the censoring, so a subject censored at t is still at risk at
 * t. The estimate is 1 until the first event.
 */
export function kaplanMeier(subjects: ReadonlyArray<{ time: number; event: boolean; row: number }>): KaplanMeier {
  const sorted = [...subjects].sort((a, b) => a.time - b.time || a.row - b.row);
  const steps: SurvivalStep[] = [];
  const marks: CensorMark[] = [];
  let s = 1;
  let atRisk = sorted.length;
  let green = 0;
  let i = 0;
  let events = 0;
  while (i < sorted.length) {
    const t = sorted[i].time;
    let d = 0;
    let c = 0;
    const censoredRows: number[] = [];
    let eventRow = -1;
    let j = i;
    while (j < sorted.length && sorted[j].time === t) {
      if (sorted[j].event) {
        if (d === 0) eventRow = sorted[j].row;
        d++;
      } else {
        c++;
        censoredRows.push(sorted[j].row);
      }
      j++;
    }
    if (d > 0) {
      s *= 1 - d / atRisk;
      green += atRisk > d ? d / (atRisk * (atRisk - d)) : Infinity;
      steps.push({ time: t, survival: s, atRisk, events: d, row: eventRow, greenwood: green });
      events += d;
    }
    for (const row of censoredRows) marks.push({ time: t, survival: s, row });
    atRisk -= d + c;
    i = j;
  }
  return { steps, marks, n: sorted.length, events, times: sorted.map((x) => x.time) };
}

/** Number of subjects still under observation at time t: those whose time is at least t. */
export const numberAtRisk = (km: KaplanMeier, t: number): number => km.times.filter((x) => x >= t).length;

/**
 * Pointwise confidence interval of the estimate at a step (spec 15: Greenwood standard error). Plain: S +/- z SE with
 * SE = S sqrt(Greenwood sum), clipped to 0..1. Log-log: S^exp(+/- z SE_ll) with SE_ll = sqrt(Greenwood sum) / |ln S|,
 * which stays inside 0..1. Where the estimate is 0 or 1, or the variance is not finite, the interval is the estimate.
 */
export function survivalInterval(step: Pick<SurvivalStep, 'survival' | 'greenwood'>, level: number, method: SurvivalBandMethod): [number, number] {
  const s = step.survival;
  const g = step.greenwood;
  if (!(s > 0 && s < 1) || !Number.isFinite(g) || !(level > 0 && level < 1)) return [s, s];
  const z = normalQuantile(1 - (1 - level) / 2);
  if (method === 'plain') {
    const se = s * Math.sqrt(g);
    return [Math.max(0, s - z * se), Math.min(1, s + z * se)];
  }
  const se = Math.sqrt(g) / Math.abs(Math.log(s));
  return [s ** Math.exp(z * se), s ** Math.exp(-z * se)];
}


/** Share of the series colour the confidence band is drawn at (spec 5.2: bands use 0.20). */
export const BAND_OPACITY = 0.2;

/**
 * Model of survival and cumulative-event curves, as an XyModel so the XY drawing is reused: the curve is the series'
 * line, the censor marks are its points, and the optional confidence band is its band. The time axis starts at 0; the
 * fraction axis is 0 to 1 unless set by hand. An at-risk table can be reserved under the plot.
 */
export function buildSurvivalModel(chart: Chart, table: DataTable): XyModel {
  if (!isSurvivalChartType(chart.type) || table.groups.length === 0) throw new Error('buildSurvivalModel needs a survival chart on a survival table');
  const cumulative = chart.type === 'cumulativeEvent';
  const [W, H] = [chartPx2Pt(chart.widthPx), chartPx2Pt(chart.heightPx)];
  const layer = chart.layers[0];
  const opts = chart.survival;
  const warnings: string[] = [];
  const times = table.groups[0].observations.map((o) => o.value);
  const level = (v: number) => (cumulative ? 1 - v : v);

  // 1. One Kaplan-Meier estimate per group column.
  let invalidStatus = 0;
  let noTime = 0;
  const raw = xySeries(table).map((s, i) => {
    const style = resolveStyle(chart, layer, { id: s.id, paletteIndex: s.columns[0].seriesSlot ?? i });
    const subjects: Array<{ time: number; event: boolean; row: number }> = [];
    s.columns[0].observations.forEach((o, row) => {
      if (o.value === null) return;
      const t = times[row];
      if (o.value !== 0 && o.value !== 1) {
        invalidStatus++;
        return;
      }
      if (t === null || !Number.isFinite(t) || t < 0) {
        noTime++;
        return;
      }
      subjects.push({ time: t, event: o.value === 1, row });
    });
    return { s, style, km: kaplanMeier(subjects), label: displayName(chart, s.id, s.name) };
  });
  if (invalidStatus > 0) warnings.push(`${invalidStatus} entr${invalidStatus === 1 ? 'y is' : 'ies are'} neither 1 (event) nor 0 (censored) and ignored.`);
  if (noTime > 0) warnings.push(`${noTime} subject${noTime === 1 ? ' has' : 's have'} no valid time (it must be a number, 0 or more) and ${noTime === 1 ? 'is' : 'are'} ignored.`);

  // 2. Scales: time from 0, fraction 0 to 1.
  const allT = raw.flatMap((r) => [...r.km.steps.map((x) => x.time), ...r.km.marks.map((m) => m.time)]);
  const linear = { scale: 'linear' as const, reverse: false };
  const xAxis = resolveAxis({ values: allT.length ? [0, ...allT] : [], includeZero: true, min: chart.xAxis.min, max: chart.xAxis.max, majorInterval: chart.xAxis.majorInterval, tickCountHint: Math.max(3, Math.min(10, Math.round(W / 60))) }, { ...chart.xAxis, ...linear });
  const yAxis = resolveAxis({ values: [0, 1], includeZero: true, min: chart.yAxis.min ?? 0, max: chart.yAxis.max ?? 1, majorInterval: chart.yAxis.majorInterval, tickCountHint: Math.max(3, Math.min(10, Math.round(H / 50))) }, { ...chart.yAxis, ...linear });
  warnings.push(...xAxis.warnings.map((w) => w.replace(/^Y /, 'X ').replace(/ Y limit/, ' X limit')), ...yAxis.warnings);

  // The at-risk table sits under the plot: one row per group and a heading, at the ticks of the time axis.
  const legendSeries = raw.map((_, i) => i).filter((i) => !chart.legend.hiddenGroupIds.includes(raw[i].s.id));
  const atRiskTimes = xAxis.ticks.filter((t) => t >= xAxis.domain[0] && t <= xAxis.domain[1]);
  const atRiskFont = chart.legend.fontSizePt;
  const rowHeight = atRiskFont * 1.3;
  const showAtRisk = opts.atRisk && raw.length > 0 && atRiskTimes.length > 0;
  const layout = computeLayout({
    fontFamily: chart.fontFamily,
    titleOffsetPt: chart.titleOffsetPt,
    widthPt: W,
    heightPt: H,
    title: chart.showTitle ? { text: chart.title, fontSizePt: chart.titleFontSizePt } : null,
    xAxis: chart.xAxis,
    yAxis: chart.yAxis,
    legend: chart.legend,
    legendLabels: legendSeries.map((i) => raw[i].label),
    categoryLabels: [],
    yTickLabels: yAxis.ticks.map(yAxis.tickLabel),
    extraBottomPt: showAtRisk ? (raw.length + 1) * rowHeight + 4 : 0,
  });
  warnings.push(...layout.warnings);
  const { plot } = layout;
  const [x0, x1] = xAxis.domain;
  const [y0, y1] = yAxis.domain;
  const xScale = (v: number) => plot.x + ((v - x0) / (x1 - x0)) * plot.width;
  const yScale = (v: number) => plot.y + plot.height - ((v - y0) / (y1 - y0)) * plot.height;

  // 3. Geometry: a step path (horizontal to each event time, then the drop), the censor marks and the band.
  const series: XySeries[] = raw.map((r) => {
    let d = `M${n2(xScale(Math.max(0, x0)))},${n2(yScale(level(1)))}`;
    for (const st of r.km.steps) d += `H${n2(xScale(st.time))}V${n2(yScale(level(st.survival)))}`;
    // Hold the last estimate to the last observed time (an event or a censoring), not across the whole axis.
    const lastTime = Math.max(0, ...r.km.steps.map((x) => x.time), ...r.km.marks.map((m) => m.time));
    d += `H${n2(xScale(lastTime))}`;
    const col = r.s.columns[0];
    const points: XyPoint[] = r.km.marks.map((m) => ({ id: col.observations[m.row].id, row: m.row, x: m.time, y: level(m.survival), px: xScale(m.time), py: yScale(level(m.survival)), stats: null }));
    // Symbols at the events too, when asked: the estimate just after each drop, tied to the first subject with the event.
    if (opts.eventSymbols) for (const st of r.km.steps) points.push({ id: `${col.observations[st.row].id}:event`, row: st.row, x: st.time, y: level(st.survival), px: xScale(st.time), py: yScale(level(st.survival)), stats: null });

    // Error bars of one standard error at each event time: S +/- S sqrt(Greenwood sum), kept within 0..1; none where it is not finite.
    let errorPath = '';
    if (opts.errorBars) {
      const half = r.style.errorCap === 'bar' ? r.style.errorCapWidthPt / 2 : 0;
      for (const st of r.km.steps) {
        const se = st.survival * Math.sqrt(st.greenwood);
        if (!Number.isFinite(se)) continue;
        const x = xScale(st.time);
        const hi = yScale(level(Math.min(1, st.survival + se)));
        const lo = yScale(level(Math.max(0, st.survival - se)));
        errorPath += `M${n2(x)},${n2(hi)}V${n2(lo)}`;
        if (half > 0) errorPath += `M${n2(x - half)},${n2(hi)}H${n2(x + half)}M${n2(x - half)},${n2(lo)}H${n2(x + half)}`;
      }
    }

    // The band: the upper step function forward, the lower one back, closed. For the cumulative curve the
    // survival limits are flipped, which the same polygon handles.
    let bandPath = '';
    if (opts.band && r.km.steps.length > 0) {
      const upper: Array<[number, number]> = [[Math.max(0, x0), 1]];
      const lower: Array<[number, number]> = [[Math.max(0, x0), 1]];
      let prev: [number, number] = [1, 1];
      for (const st of r.km.steps) {
        const [lo, hi] = survivalInterval(st, opts.level, opts.method);
        upper.push([st.time, prev[1]], [st.time, hi]);
        lower.push([st.time, prev[0]], [st.time, lo]);
        prev = [lo, hi];
      }
      upper.push([lastTime, prev[1]]);
      lower.push([lastTime, prev[0]]);
      const pt = ([t, v]: [number, number]) => `${n2(xScale(t))},${n2(yScale(level(v)))}`;
      bandPath = `M${upper.map(pt).join('L')}L${[...lower].reverse().map(pt).join('L')}Z`;
    }
    return { groupId: r.s.id, label: r.label, style: r.style, points, linePath: r.km.n === 0 ? '' : d, errorPath, errorMeaning: errorPath === '' ? null : 'SE (Greenwood)', bandPath, skipped: 0 };
  });
  if (allT.length === 0) warnings.push('Enter the times in the first column and a 1 (event) or 0 (censored) in the column of each subject\'s group.');

  // 4. The at-risk table: the subjects still under observation at each tick, per group.
  let atRisk: AtRiskTable | null = null;
  if (showAtRisk && layout.extraBottom) {
    atRisk = {
      xs: atRiskTimes.map(xScale),
      times: atRiskTimes,
      rows: raw.map((r) => ({ label: r.label, color: r.style.lineColor, counts: atRiskTimes.map((t) => numberAtRisk(r.km, t)) })),
      y0: layout.extraBottom.y,
      rowHeight,
      fontSizePt: atRiskFont,
    };
  }

  return { widthPt: W, heightPt: H, layout, x: xAxis, y: yAxis, xScale, yScale, series, legendSeries, atRisk, warnings: [...new Set(warnings)], fit: NO_FIT_SETTINGS };
}
