import { useEffect, useMemo, useState } from 'react';
import { SYMBOL_SHAPE_OPTIONS } from '../../chart/shared/parts/symbols';
import { majorStepOf, validateAxisInterval, validateAxisMax, validateAxisMin, type AxisEditContext, type YAxisScale } from '../../chart/shared/axes/scales';
import { buildAnyModelCached } from '../../chart/anyModel';
import { chartFamily, chartTypesFor, supportsHorizontal } from '../../model/graph/chartTypes';
import { layoutOf, summaryFormatInfo, xySeries } from '../../model/table/tableLayout';
import { isSummaryOverridden, resolveSummary, validateSummaryPatch } from '../../model/graph/summary';
import { intervalCaptionLines, DIRECTION_HINT, describeSummaryControls } from '../../stats/describe';
import { tooltipFmt } from '../../chart/tooltip';
import { ColumnLayoutSection, DirectionSection, FrameSection, LineOrderSection } from './sections/LookControls';
import { DataSetOrder } from './sections/DataSetOrder';
import { AxisStyleControls } from './sections/AxisStyleControls';
import { IntervalFields, LineAtField } from './sections/SummaryControls';
import { isGroupOverridden, resolveStyle, dataLayer } from '../../model/graph/style';
import type { AxisConfig, Chart, ChartStyle, ChartType, DataTable, Id, LineStyle, SummarySpec } from '../../model/types';
import { useApp } from '../../state/AppContext';
import { composeCommands, patchAxis, patchChart, patchStyle, patchSummary, patchSurvival, setChartType } from '../../state/commands';
import { LINE_STYLES } from '../../model/graph/look';
import { analysesOf } from '../../model/project/analysis';
import { resolveFit } from '../../model/options/fitOptions';
import { DistributionControls } from './sections/DistributionControls';
import { FitSection } from './sections/FitControls';
import { LayersSection } from './sections/LayersSection';
import { Check, ColorInput, Field, GroupBox, NumField, OptionalNumField, Section, SectionBar, SelectInput, TabBar } from './common/controls';
import { SECTIONS, TABS } from './common/nav';
import { PaletteField, AnnotationsTab, DimensionsSection, LegendSection, OnThisGraph, TextSections } from './sections/SharedSections';
import { displayName } from '../../chart/shared/parts/names';
import type { AppearanceSection, InspectorTab } from '../../state/inspectorNav';

const axisCtx = (axis: AxisConfig, scale: YAxisScale): AxisEditContext => ({ min: axis.min, max: axis.max, majorInterval: axis.majorInterval, domain: scale.domain, log: scale.log });
const stepOf = majorStepOf;

/** Range, limits and ticks of one numeric axis: Auto fits the data, Manual uses the limits. */
export function AxisLimits({ chart, which, scale, name, canScale = true, canReverse = true }: { chart: Chart; which: 'xAxis' | 'yAxis'; scale: YAxisScale; name: string; canScale?: boolean; canReverse?: boolean }) {
  const { run } = useApp();
  const axis = chart[which];
  const ctx = axisCtx(axis, scale);
  const tag = which === 'xAxis' ? 'x' : 'y';
  return (
    <>
      <Field label="Range" hint="Auto fits the axis to the data; Manual uses the limits below">
        <SelectInput<'auto' | 'manual'>
          value={axis.min === null && axis.max === null ? 'auto' : 'manual'}
          options={[
            { value: 'auto', label: 'Auto' },
            { value: 'manual', label: 'Manual' },
          ]}
          onChange={(v) => run(`${name} range`, patchAxis(chart.id, which, v === 'auto' ? { min: null, max: null } : { min: axis.min ?? scale.domain[0], max: axis.max ?? scale.domain[1] }))}
        />
      </Field>
      <OptionalNumField label={`${name} minimum`} value={axis.min} autoValue={scale.domain[0]} validate={(v) => validateAxisMin(v, ctx)} onCommit={(v) => run(`${name} minimum`, patchAxis(chart.id, which, { min: v }), `axis:${tag}min`)} />
      <OptionalNumField label={`${name} maximum`} value={axis.max} autoValue={scale.domain[1]} validate={(v) => validateAxisMax(v, ctx)} onCommit={(v) => run(`${name} maximum`, patchAxis(chart.id, which, { max: v }), `axis:${tag}max`)} />
      <OptionalNumField label="Major tick interval" value={axis.majorInterval} autoValue={stepOf(scale)} validate={(v) => validateAxisInterval(v, ctx)} onCommit={(v) => run(`${name} tick interval`, patchAxis(chart.id, which, { majorInterval: v }), `axis:${tag}int`)} />
      <Field label="Major gridlines">
        <Check checked={axis.showGrid} onChange={(v) => run(`${name} gridlines`, patchAxis(chart.id, which, { showGrid: v }))} />
      </Field>
      <AxisStyleControls chart={chart} which={which} scale={scale} name={name} canScale={canScale} canReverse={canReverse} />
    </>
  );
}

/**
 * Formatting panel of the charts drawn from a table of series: XY charts (a numeric X axis), survival curves (time on
 * X), grouped bars and lines over categories, and contingency bars. Each series has its own style; which boxes appear
 * follows the chart type and how the table's values are entered.
 */
export function XyInspector({ chart, table }: { chart: Chart; table: DataTable }) {
  const { project, selection, setSelection, run, inspectorNav } = useApp();
  const [tab, setTab] = useState<InspectorTab>('appearance');
  const [section, setSection] = useState<AppearanceSection>('style');
  useEffect(() => {
    const t = inspectorNav.target;
    if (inspectorNav.n === 0 || !t) return;
    setTab(t.tab);
    if (t.section) setSection(t.section);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectorNav.n]);

  const layer = dataLayer(chart);
  const layout = layoutOf(table);
  // The Y series as data sets: a series is one column or a block of sub-columns, keyed by its first column.
  const series = useMemo(() => xySeries(table).map((s) => ({ ...s.columns[0], name: s.name })), [table]);
  const selectedId = selection.kind === 'group' || selection.kind === 'point' ? selection.groupId : null;
  const selected = series.find((g) => g.id === selectedId);
  const scope: 'all' | Id = selected ? selected.id : 'all';
  const sampleIndex = selected ? series.indexOf(selected) : 0;
  const sample = series[sampleIndex];
  const curve = useMemo(() => resolveFit(chart.fit, analysesOf(project), table.id), [chart.fit, project.analyses, table.id]);
  const any = useMemo(() => buildAnyModelCached(chart, table, curve), [chart, table, curve]);
  // The numeric-X model (XY, survival) and the category model (grouped, contingency) differ in what an axis is.
  const xyModel = any.family === 'xy' || any.family === 'survival' ? any.model : null;
  const yScale = any.family === 'column' || any.family === 'pie' || any.family === 'heatmap' ? null : any.model.y;
  const seriesView = any.family === 'column' || any.family === 'pie' || any.family === 'heatmap' ? [] : any.model.series.map((x) => ({ groupId: x.groupId, label: x.label, style: x.style, count: 'points' in x ? x.points.length : 0, bars: 'bars' in x && x.bars ? x.bars.length : 0 }));
  const family = chartFamily(chart.type);
  // Survival curves and stacked or percentage bars keep a plain linear axis (see the models).
  const yAxisCanChange = family !== 'survival' && chart.type !== 'groupedStacked' && chart.type !== 'contingencyStacked' && chart.type !== 'contingencyPercent';
  const noun = table.kind === 'survival' ? 'Group' : table.kind === 'contingency' ? 'Outcome' : table.kind === 'grouped' ? 'Group' : 'Series';
  const distChart = chart.type === 'groupedBox' || chart.type === 'groupedViolin';
  const barChart = distChart || chart.type === 'groupedBar' || chart.type === 'groupedStacked' || chart.type === 'groupedFloating' || chart.type === 'contingencyBars' || chart.type === 'contingencyStacked' || chart.type === 'contingencyPercent';
  const stacked = chart.type === 'groupedStacked' || chart.type === 'contingencyStacked' || chart.type === 'contingencyPercent';

  // "Global" shows the layer-level values; a series shows its own resolved values.
  const st: ChartStyle = useMemo(() => {
    if (!sample) return chart.defaults;
    const l = scope === 'all' ? { ...layer, groupOverrides: {}, objectOverrides: {} } : layer;
    return resolveStyle(chart, l, { id: sample.id, paletteIndex: sample.seriesSlot ?? sampleIndex });
  }, [chart, layer, sample, sampleIndex, scope]);
  const ov = (key: keyof ChartStyle) => scope !== 'all' && isGroupOverridden(layer, scope, key);
  const setStyle = (patch: Partial<ChartStyle>) => {
    const recolours = 'symbolColor' in patch || 'lineColor' in patch || 'barFill' in patch;
    const command = recolours && chart.paletteId !== null ? composeCommands(patchStyle(chart.id, scope, patch), patchChart(chart.id, { paletteId: null })) : patchStyle(chart.id, scope, patch);
    run('Change style', command, `style:${scope}:${Object.keys(patch).join(',')}`);
  };
  // Summary of replicate values: the layer's for Global, the resolved one for a series.
  const spec: SummarySpec = !sample || scope === 'all' ? layer.summary : resolveSummary(layer, scope);
  const ovSum = (key: keyof SummarySpec) => scope !== 'all' && isSummaryOverridden(layer, scope, key);
  const setSummary = (patch: Partial<SummarySpec>, label = 'Change summary') => {
    if (!validateSummaryPatch(patch)) return;
    run(label, patchSummary(chart.id, scope, patch), `summary:${scope}:${Object.keys(patch).join(',')}`);
  };
  const errorOff = describeSummaryControls({ showErrorBars: st.showErrorBars, centre: spec.centre, spread: spec.spread }).errorOff;
  const stepSeries = (dir: 1 | -1) => {
    const i = selected ? series.indexOf(selected) : -1;
    const j = i + dir;
    if (j < 0 || j >= series.length) setSelection({ kind: 'chart' });
    else setSelection({ kind: 'group', groupId: series[j].id });
  };

  return (
    <aside className="inspector" aria-label="Graph formatting">
      <TabBar tabs={TABS} value={tab} onChange={setTab} />

      {tab === 'appearance' && (
        <div>
          <SectionBar sections={SECTIONS} value={section} onChange={setSection} />

          {section === 'style' && (
            <div className="tab-body">
              <div className="dataset-row">
                <span className="dataset-label">{noun}:</span>
                <select className="dataset-select" value={scope} onChange={(e) => setSelection(e.target.value === 'all' ? { kind: 'chart' } : { kind: 'group', groupId: e.target.value })}>
                  <option value="all">Global (all {noun.toLowerCase()}s)</option>
                  {series.map((g) => (
                    <option key={g.id} value={g.id}>
                      {displayName(chart, g.id, g.name)}
                    </option>
                  ))}
                </select>
                <button title={`Previous ${noun.toLowerCase()}`} aria-label={`Previous ${noun.toLowerCase()}`} onClick={() => stepSeries(-1)} disabled={series.length === 0}>
                  &lt;
                </button>
                <button title={`Next ${noun.toLowerCase()}`} aria-label={`Next ${noun.toLowerCase()}`} onClick={() => stepSeries(1)} disabled={series.length === 0}>
                  &gt;
                </button>
              </div>

              <GroupBox title="Style">
                <Field label="Graph type">
                  <SelectInput<ChartType> value={chart.type} options={chartTypesFor(table.kind).map((c) => ({ value: c.type, label: c.label }))} onChange={(t) => run('Change graph type', setChartType(chart.id, t))} />
                </Field>
                <PaletteField chart={chart} hint="Gives the series coordinated colours in order. Per-series colours below still apply on top." />
              </GroupBox>

              {layout.kind === 'replicates' && (
                <GroupBox title={`Replicates (${layout.n} per value)`}>
                  <LineAtField centre={spec.centre} overridden={ovSum('centre')} onChange={(centre) => setSummary({ centre }, 'Change line at')} />
                  <div className="muted small">Each value is drawn at the centre of its replicate values.</div>
                </GroupBox>
              )}
              {layout.kind === 'summary' && (
                <GroupBox title="Values entered">
                  <div className="muted small">The table holds values already calculated ({summaryFormatInfo(layout.format).label}). They are drawn as entered; nothing is recalculated.</div>
                </GroupBox>
              )}

              {barChart && supportsHorizontal(chart.type) && <DirectionSection chart={chart} />}
              {distChart && <DistributionControls chart={chart} lineColor={st.lineColor} lineWidthPt={st.lineWidthPt} lineOpacity={st.lineOpacity} onLine={(patch) => setStyle(patch)} />}
              {barChart && (
                <GroupBox title={distChart ? (chart.type === 'groupedBox' ? 'Box' : 'Violin') : 'Bars'} {...(chart.type === 'groupedBar' ? { checked: st.showBars, onCheckedChange: (v: boolean) => setStyle({ showBars: v }), overridden: ov('showBars') } : {})}>
                  <Field label="Fill" overridden={ov('barFill')}>
                    <ColorInput value={st.barFill} onChange={(v) => setStyle({ barFill: v })} />
                  </Field>
                  <NumField label="Opacity" value={st.barOpacity} min={0} max={1} overridden={ov('barOpacity')} onCommit={(v) => setStyle({ barOpacity: v })} hint="0 = transparent, 1 = opaque" />
                  <NumField label="Border" unit="pt" value={st.barBorderWidthPt} min={0} max={40} overridden={ov('barBorderWidthPt')} onCommit={(v) => setStyle({ barBorderWidthPt: v })} />
                  <NumField label="Border opacity" value={st.barBorderOpacity} min={0} max={1} overridden={ov('barBorderOpacity')} onCommit={(v) => setStyle({ barBorderOpacity: v })} hint="0 = transparent, 1 = opaque" />
                  <Field label="Border color" overridden={ov('barBorderColor')}>
                    <ColorInput value={st.barBorderColor} onChange={(v) => setStyle({ barBorderColor: v })} />
                  </Field>
                </GroupBox>
              )}

              {(chart.type === 'groupedFloating' || chart.type === 'groupedBar') && (
                <GroupBox title={chart.type === 'groupedBar' ? 'Mean line' : 'Centre line'} checked={st.showMeanLine} onCheckedChange={(v) => setStyle({ showMeanLine: v })} overridden={ov('showMeanLine')}>
                  <Field label="Color" overridden={ov('lineColor')}>
                    <ColorInput value={st.lineColor} disabled={!st.showMeanLine} onChange={(v) => setStyle({ lineColor: v })} />
                  </Field>
                  <NumField label="Thickness" unit="pt" value={st.lineWidthPt} min={0.2} max={40} disabled={!st.showMeanLine} overridden={ov('lineWidthPt')} onCommit={(v) => setStyle({ lineWidthPt: v })} />
                  <NumField label="Opacity" value={st.lineOpacity} min={0} max={1} disabled={!st.showMeanLine} overridden={ov('lineOpacity')} onCommit={(v) => setStyle({ lineOpacity: v })} hint="0 = transparent, 1 = opaque" />
                  <div className="muted small">{chart.type === 'groupedBar' ? 'A line across each bar at the value it shows.' : 'The bar runs from the smallest to the largest value; the line marks the mean of the replicates.'}</div>
                </GroupBox>
              )}

              {(!barChart || ((chart.type === 'groupedBar' || chart.type === 'groupedFloating' || distChart) && layout.kind === 'replicates')) && (
              <GroupBox title={family === 'survival' ? 'Censor marks' : distChart ? 'Points' : barChart ? 'Individual values' : 'Symbols'} checked={st.showSymbols} onCheckedChange={(v) => setStyle({ showSymbols: v })} overridden={ov('showSymbols')}>
                {family === 'survival' && (
                  <Field label="Also at every event" hint="A symbol where the curve drops, as well as at the censored subjects">
                    <Check checked={chart.survival.eventSymbols} disabled={!st.showSymbols} onChange={(v) => run('Symbols at events', patchSurvival(chart.id, { eventSymbols: v }))} />
                  </Field>
                )}
                <Field label="Color" overridden={ov('symbolColor')}>
                  <ColorInput value={st.symbolColor} disabled={!st.showSymbols} onChange={(v) => setStyle({ symbolColor: v, symbolBorderColor: v })} />
                </Field>
                <Field label="Shape" overridden={ov('symbolShape')}>
                  <SelectInput value={st.symbolShape} disabled={!st.showSymbols} options={[...SYMBOL_SHAPE_OPTIONS]} onChange={(v) => setStyle({ symbolShape: v })} />
                </Field>
                <NumField label="Size" unit="pt" value={st.symbolSizePt} min={2} max={80} disabled={!st.showSymbols} overridden={ov('symbolSizePt')} onCommit={(v) => setStyle({ symbolSizePt: v })} />
                <NumField label="Fill opacity" value={st.symbolFillOpacity} min={0} max={1} disabled={!st.showSymbols} overridden={ov('symbolFillOpacity')} onCommit={(v) => setStyle({ symbolFillOpacity: v })} hint="1 = solid, 0 = hollow: only the border shows" />
                <Field label="Border color" overridden={ov('symbolBorderColor')}>
                  <ColorInput value={st.symbolBorderColor} disabled={!st.showSymbols} onChange={(v) => setStyle({ symbolBorderColor: v })} />
                </Field>
                <NumField label="Border thickness" unit="pt" value={st.symbolBorderWidthPt} min={0} max={20} disabled={!st.showSymbols} overridden={ov('symbolBorderWidthPt')} onCommit={(v) => setStyle({ symbolBorderWidthPt: v })} />
                <NumField label="Border opacity" value={st.symbolBorderOpacity} min={0} max={1} disabled={!st.showSymbols} overridden={ov('symbolBorderOpacity')} onCommit={(v) => setStyle({ symbolBorderOpacity: v })} hint="0 = transparent, 1 = opaque" />
                {family === 'xy' && layout.kind === 'replicates' && (
                  <Field label="Individual values" overridden={ov('showRawPoints')} hint="Every replicate as a small symbol behind the mean or median; they are part of the axis range while shown">
                    <Check checked={st.showRawPoints} onChange={(v) => setStyle({ showRawPoints: v })} />
                  </Field>
                )}
              </GroupBox>

              )}

              {layout.kind !== 'single' && !stacked && chart.type !== 'groupedFloating' && !distChart && table.kind !== 'contingency' && (
                <GroupBox title="Error bars" checked={st.showErrorBars} onCheckedChange={(v) => setStyle({ showErrorBars: v })} overridden={ov('showErrorBars')}>
                  {layout.kind === 'replicates' && (
                    <IntervalFields
                      centre={spec.centre}
                      spread={spec.spread}
                      confidenceLevel={spec.confidenceLevel}
                      showErrorBars={st.showErrorBars}
                      spreadOverridden={ovSum('spread')}
                      levelOverridden={ovSum('confidenceLevel')}
                      captionLines={intervalCaptionLines({ spec, stats: null, showErrorBars: st.showErrorBars, fmt: tooltipFmt })}
                      onSpread={(spread) => setSummary({ spread }, 'Change error bar shows')}
                      onLevel={(confidenceLevel) => setSummary({ confidenceLevel }, 'Change confidence level')}
                    />
                  )}
                  <Field label="Color" overridden={ov('errorColor')}>
                    <ColorInput value={st.errorColor} disabled={layout.kind === 'replicates' && errorOff} onChange={(v) => setStyle({ errorColor: v })} />
                  </Field>
                  <Field label="Cap style" overridden={ov('errorCap')}>
                    <SelectInput value={st.errorCap} options={[{ value: 'bar', label: 'Bar' }, { value: 'none', label: 'None' }]} onChange={(v) => setStyle({ errorCap: v })} />
                  </Field>
                  <NumField label="Cap width" unit="pt" value={st.errorCapWidthPt} min={0} max={120} disabled={st.errorCap === 'none'} overridden={ov('errorCapWidthPt')} onCommit={(v) => setStyle({ errorCapWidthPt: v })} />
                  <Field label="Dir." overridden={ov('errorDirection')} hint={DIRECTION_HINT}>
                    <SelectInput value={st.errorDirection} options={[{ value: 'both', label: 'Both' }, { value: 'positive', label: 'Above' }, { value: 'negative', label: 'Below' }]} onChange={(v) => setStyle({ errorDirection: v })} />
                  </Field>
                  <NumField label="Thickness" unit="pt" value={st.errorLineWidthPt} min={0.2} max={40} overridden={ov('errorLineWidthPt')} onCommit={(v) => setStyle({ errorLineWidthPt: v })} />
                  <NumField label="Opacity" value={st.errorOpacity} min={0} max={1} overridden={ov('errorOpacity')} onCommit={(v) => setStyle({ errorOpacity: v })} hint="0 = transparent, 1 = opaque" />
                </GroupBox>
              )}

              {!barChart && (
              <GroupBox title={family === 'survival' ? 'Curve' : 'Line'} checked={st.showLines} onCheckedChange={(v) => setStyle({ showLines: v })} overridden={ov('showLines')}>
                <Field label="Color" overridden={ov('lineColor')}>
                  <ColorInput value={st.lineColor} disabled={!st.showLines} onChange={(v) => setStyle({ lineColor: v })} />
                </Field>
                <NumField label="Thickness" unit="pt" value={st.lineWidthPt} min={0.2} max={40} disabled={!st.showLines} overridden={ov('lineWidthPt')} onCommit={(v) => setStyle({ lineWidthPt: v })} />
                <NumField label="Opacity" value={st.lineOpacity} min={0} max={1} disabled={!st.showLines} overridden={ov('lineOpacity')} onCommit={(v) => setStyle({ lineOpacity: v })} hint="0 = transparent, 1 = opaque" />
                <Field label="Pattern" overridden={ov('lineStyle')}>
                  <SelectInput<LineStyle> value={st.lineStyle} disabled={!st.showLines} options={LINE_STYLES.map((l) => ({ value: l.value, label: l.label }))} onChange={(v) => setStyle({ lineStyle: v })} />
                </Field>
                <div className="muted small">{family === 'survival' ? 'The Kaplan-Meier estimate, a step at each event time.' : family === 'grouped' ? 'The means of each series are joined across the categories.' : 'Points are joined in the order of the table rows; a missing Y value breaks the line.'}</div>
              </GroupBox>
              )}
              {family === 'xy' && xyModel && <FitSection chart={chart} table={table} model={xyModel} />}
              {(family === 'xy' || family === 'survival' || family === 'grouped') && <LayersSection chart={chart} table={table} />}
              {family === 'survival' && (
                <>
                  <GroupBox title="Error bars (standard error)" checked={chart.survival.errorBars} onCheckedChange={(v) => run('Survival error bars', patchSurvival(chart.id, { errorBars: v }))}>
                    <Field label="Color" overridden={ov('errorColor')}>
                      <ColorInput value={st.errorColor} disabled={!chart.survival.errorBars} onChange={(v) => setStyle({ errorColor: v })} />
                    </Field>
                    <NumField label="Thickness" unit="pt" value={st.errorLineWidthPt} min={0.2} max={20} disabled={!chart.survival.errorBars} overridden={ov('errorLineWidthPt')} onCommit={(v) => setStyle({ errorLineWidthPt: v })} />
                    <NumField label="Opacity" value={st.errorOpacity} min={0} max={1} disabled={!chart.survival.errorBars} overridden={ov('errorOpacity')} onCommit={(v) => setStyle({ errorOpacity: v })} hint="0 = transparent, 1 = opaque" />
                    <div className="muted small">One standard error (Greenwood) either side of the estimate at each event time, kept within 0 to 1.</div>
                  </GroupBox>
                  <GroupBox title="Confidence band" checked={chart.survival.band} onCheckedChange={(v) => run('Confidence band', patchSurvival(chart.id, { band: v }))}>
                    <NumField
                      label="Confidence level"
                      unit="%"
                      value={Number((chart.survival.level * 100).toPrecision(6))}
                      min={50}
                      max={99.9}
                      disabled={!chart.survival.band}
                      onCommit={(v) => run('Confidence level', patchSurvival(chart.id, { level: v / 100 }), 'survival:level')}
                    />
                    <Field label="Method" hint="Log-log keeps the band inside 0 to 1; plain is the estimate +/- z times the Greenwood standard error">
                      <SelectInput
                        value={chart.survival.method}
                        disabled={!chart.survival.band}
                        options={[
                          { value: 'loglog', label: 'Log-log (Greenwood)' },
                          { value: 'plain', label: 'Plain (Greenwood)' },
                        ]}
                        onChange={(method) => run('Band method', patchSurvival(chart.id, { method }))}
                      />
                    </Field>
                    <div className="muted small">A pointwise interval around each curve, in the colour of its group. It is not a simultaneous band.</div>
                  </GroupBox>
                  <GroupBox title="At-risk table" checked={chart.survival.atRisk} onCheckedChange={(v) => run('At-risk table', patchSurvival(chart.id, { atRisk: v }))}>
                    <div className="muted small">The number of subjects still under observation at each tick of the time axis, one row per group, under the plot.</div>
                  </GroupBox>
                </>
              )}
              {family !== 'survival' && <LineOrderSection chart={chart} />}
              {family === 'xy' && <div className="muted small">Missing is not zero: rows with an empty X or Y cell are left out, not plotted at 0.</div>}
            </div>
          )}

          {section === 'axes' && (
            <div>
              <Section title={xyModel ? (family === 'survival' ? 'Time axis' : 'X axis (numbers)') : 'Category axis'}>
                <Field label="Show X axis">
                  <Check checked={chart.xAxis.visible} onChange={(v) => run('Show X axis', patchAxis(chart.id, 'xAxis', { visible: v }))} />
                </Field>
                {xyModel ? <AxisLimits chart={chart} which="xAxis" scale={xyModel.x} name={family === 'survival' ? 'Time' : 'X'} canScale={family !== 'survival'} canReverse={family !== 'survival'} /> : <div className="muted small">The categories are the rows of the table, so there are no numeric limits to set.</div>}
              </Section>
              <Section title="Y axis">
                <Field label="Show Y axis">
                  <Check checked={chart.yAxis.visible} onChange={(v) => run('Show Y axis', patchAxis(chart.id, 'yAxis', { visible: v }))} />
                </Field>
                {yScale && <AxisLimits chart={chart} which="yAxis" scale={yScale} name="Y" canScale={yAxisCanChange} canReverse={yAxisCanChange} />}
              </Section>
            </div>
          )}

          {section === 'text' && <TextSections chart={chart} groups={series} yName="Y" dual={false} />}
          {section === 'frame' && <FrameSection chart={chart} dual={false} origin={family === 'grouped' ? 'y' : 'xy'} />}
          {section === 'layout' && (
            <div>
              <DimensionsSection chart={chart} />
              {(chart.type === 'groupedBar' || chart.type === 'groupedFloating' || chart.type === 'contingencyBars') && <ColumnLayoutSection chart={chart} spacing={false} baseline />}
            </div>
          )}
          {section === 'legend' && <LegendSection chart={chart} groups={series} />}
        </div>
      )}

      {tab === 'datasets' && (
        <div className="tab-body">
          <OnThisGraph chart={chart} />
          <DataSetOrder chart={chart} groups={series.map((g) => ({ id: g.id, label: g.name }))} heading={barChart ? 'Order within each category, left to right' : 'Plot order (the last is drawn on top)'} />
          <div className="muted small">Select a {noun.toLowerCase()} to edit its style, or click it in the chart.</div>
          <ul className="dataset-list">
            {seriesView.map((s) => (
              <li key={s.groupId}>
                <button
                  className={`list-item${selected?.id === s.groupId ? ' selected' : ''}`}
                  onClick={() => {
                    setSelection({ kind: 'group', groupId: s.groupId });
                    setTab('appearance');
                    setSection('style');
                  }}
                >
                  <span className="swatch" style={{ background: s.bars > 0 || barChart ? s.style.barFill : s.style.showSymbols ? s.style.symbolColor : s.style.lineColor, borderColor: barChart ? s.style.barBorderColor : s.style.symbolBorderColor }} />
                  <span className="ds-name">{s.label}</span>
                  <span className="muted small">{s.bars > 0 ? `${s.bars} bars` : `${s.count} ${family === 'survival' ? 'censored' : 'points'}`}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'annotations' && <AnnotationsTab chart={chart} />}
    </aside>
  );
}
