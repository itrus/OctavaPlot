import { useEffect, useMemo } from 'react';
import { useScopedEdits } from './common/useScopedEdits';
import { buildAnyModelCached } from '../../chart/anyModel';
import { useFitsVersion } from '../components/hooks';
import { capabilitiesOf } from '../../model/graph/capabilities';
import { chartFamily, supportsHorizontal } from '../../model/graph/chartTypes';
import { layoutOf, summaryFormatInfo, xySeries } from '../../model/table/tableLayout';
import { hasFactors, seriesPaletteIndex, usesFactors } from '../../model/table/factors';
import { resolveSummary } from '../../model/graph/summary';
import { intervalCaptionLines, describeSummaryControls } from './common/summaryUi';
import { tooltipFmt } from '../../chart/tooltip';
import { ColumnLayoutSection, DirectionSection, ErrorBarLookFields, FrameSection, LineLookFields, LineOrderSection, OffsetSection, GridStyleSection, SymbolLookFields } from './sections/LookControls';
import { autoOffsetStep } from '../../model/table/offset';
import { DataSetOrder, DataSetPicker, DataSetReset } from './sections/DataSets';
import { AxisLimits } from './sections/AxisStyleControls';
import { bindingOf, bindingSelectState } from '../../chart/shared/axes/axes';
import { IntervalFields, LineAtField } from './sections/SummaryControls';
import { resolveStyle, dataLayer } from '../../model/graph/style';
import type { AxisBinding, Chart, ChartStyle, DataTable, LineConnect, LineStyle, SummarySpec } from '../../model/types';
import { useCommands, useProject, useSelection } from '../../state/AppContext';
import { MAX_LEGEND_SIZES } from '../../chart/shared/scene/sizeLegend';
import { NumberListField } from './common/NumberListField';
import { patchAxis, patchLook, patchStyle, patchSurvival } from '../../state/commands';
import { LINE_STYLES } from '../../model/graph/look';
import { analysesOf } from '../../model/project/analysis';
import { resolveFit } from '../../model/options/fitOptions';
import { DistributionControls } from './sections/DistributionControls';
import { FitSection } from './sections/FitControls';
import { LayersSection } from './sections/LayersSection';
import { annotationPlacer } from '../../chart/shared/scene/annotationPlace';
import { scopeGroupIds, selectedGroupIds, selectionOfGroups, type StyleScope } from '../../model/selection';
import { Check, ColorInput, Field, GroupBox, NumField, Section, SelectInput, TextInput } from './common/controls';
import { DotPlacementControls } from './sections/DotPlacementControls';
import { VolcanoControls } from './sections/VolcanoControls';
import { InspectorShell } from './common/InspectorShell';
import { ExportPanel } from '../export/ExportPanel';
import { useInspectorNav, inspectorShapeOf } from './common/nav';
import { ChartTypePicker } from './sections/ChartTypePicker';
import { AnnotationsTab, DimensionsSection, LegendSection, OnThisGraph, TextSections, ReferenceLinesSection } from './sections/SharedSections';
import { PaletteField } from './sections/PalettePicker';
import { displayName } from '../../chart/shared/parts/names';
import { SLIDERS } from './common/sliderRanges';

/**
 * Formatting panel of the charts drawn from a table of series: XY charts (a numeric X axis), survival curves (time on
 * X), grouped bars and lines over categories, and contingency bars. Each series has its own style; which boxes appear
 * follows the chart type and how the table's values are entered.
 */
/** The value of the data set selector when several are selected together. */
const SEVERAL = '__several__';



export function XyInspector({ chart, table }: { chart: Chart; table: DataTable }) {
  const { project } = useProject();
  const { selection, setSelection } = useSelection();
  const { run } = useCommands();
  const nav = useInspectorNav(chart.id, inspectorShapeOf(chart.type).pages);
  const { shows } = nav;

  const layer = dataLayer(chart);
  const layout = layoutOf(table);
  // The Y series as data sets: a series is one column or a block of sub-columns, keyed by its first column.
  const series = useMemo(() => xySeries(table).map((s) => ({ ...s.columns[0], name: s.name })), [table]);
  const selectedId = selection.kind === 'group' || selection.kind === 'point' ? selection.groupId : null;
  const selected = series.find((g) => g.id === selectedId);
  // Several series selected together are edited together, and where they differ a field says so ("Mixed").
  const seriesIds = useMemo(() => series.map((g) => g.id), [series]);
  const several = selection.kind === 'groups' || selection.kind === 'points' ? scopeGroupIds(selectedGroupIds(selection), seriesIds) : [];
  const scope: StyleScope = several.length > 1 ? several : selected ? selected.id : several.length === 1 ? several[0] : 'all';
  const scopeIds = scopeGroupIds(scope, seriesIds);
  // A series of the selection that is gone (deleted) leaves the selection.
  useEffect(() => {
    if (selection.kind === 'groups' && several.length !== selection.groupIds.length) setSelection(selectionOfGroups(several));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [several.length, selection.kind]);
  const first = selected ?? series.find((g) => g.id === several[0]);
  const sampleIndex = first ? series.indexOf(first) : 0;
  const sample = series[sampleIndex];
  const curve = useMemo(() => resolveFit(chart.fit, analysesOf(project), table.id), [chart.fit, project.analyses, table.id]);
  const fitsVersion = useFitsVersion();
  const any = useMemo(() => buildAnyModelCached(chart, table, curve, { deferFits: true }), [chart, table, curve, fitsVersion]);
  // The numeric-X model (XY, survival) and the category model (grouped, contingency) differ in what an axis is.
  const xyModel = any.family === 'xy' || any.family === 'survival' ? any.model : null;
  const yScale = any.family === 'column' || any.family === 'pie' || any.family === 'heatmap' ? null : any.model.y;
  const seriesView = any.family === 'column' || any.family === 'pie' || any.family === 'heatmap' ? [] : any.model.series.map((x) => ({ groupId: x.groupId, label: x.label, style: x.style, count: 'points' in x ? x.points.length : 0, bars: 'bars' in x && x.bars ? x.bars.length : 0 }));
  const family = chartFamily(chart.type);
  // Two value axes exist only while a series is bound to the right one.
  const y2Scale = xyModel?.y2 ?? null;
  const dual = y2Scale !== null;
  // Survival curves and stacked or percentage bars keep a plain linear axis (see the models).
  const yAxisCanChange = family !== 'survival' && chart.type !== 'groupedStacked' && chart.type !== 'contingencyStacked' && chart.type !== 'contingencyPercent';
  const noun = table.kind === 'survival' ? 'Group' : table.kind === 'contingency' ? 'Outcome' : table.kind === 'grouped' ? 'Group' : 'Series';
  const distChart = chart.type === 'groupedBox' || chart.type === 'groupedViolin';
  const barChart = distChart || chart.type === 'groupedBar' || chart.type === 'groupedStacked' || chart.type === 'groupedFloating' || chart.type === 'contingencyBars' || chart.type === 'contingencyStacked' || chart.type === 'contingencyPercent';
  const hasAnalysis = layout.kind === 'replicates' || layout.kind === 'summary' || distChart || (family === 'xy' && xyModel !== null) || family === 'survival';
  const stacked = chart.type === 'groupedStacked' || chart.type === 'contingencyStacked' || chart.type === 'contingencyPercent';

  // "Global" shows the layer-level values; a series shows its own resolved values.
  const st: ChartStyle = useMemo(() => {
    if (!sample) return chart.defaults;
    const l = scope === 'all' ? { ...layer, groupOverrides: {}, objectOverrides: {} } : layer;
    return resolveStyle(chart, l, { id: sample.id, paletteIndex: seriesPaletteIndex(chart, series, sampleIndex) });
  }, [chart, layer, sample, sampleIndex, scope]);
  /** The symbols are on when the centres or, in a table of replicates, the individual values have them. */
  const symbolsOn = st.showSymbols || (family === 'xy' && layout.kind === 'replicates' && st.showRawPoints);
  const bindingUi = bindingSelectState(chart.type, st);
  const inScopeBindings = (xyModel?.series ?? []).filter((x) => scopeIds.includes(x.groupId)).map((x) => bindingOf(x.style));
  const mixedBinding = inScopeBindings.some((b) => b !== inScopeBindings[0]);
  // The series the edits reach (hidden ones are not drawn, so they do not count as differing).
  const inScope = series.map((g, i) => ({ id: g.id, paletteIndex: seriesPaletteIndex(chart, series, i) })).filter((g) => scopeIds.includes(g.id) && !chart.hiddenGroupIds.includes(g.id));
  const { ov, ovSum, setStyle, setSummary } = useScopedEdits(chart, layer, scope, scopeIds, inScope);
  // Summary of replicate values: the layer's for Global, the resolved one for a series.
  const spec: SummarySpec = !sample || scope === 'all' ? layer.summary : resolveSummary(layer, sample.id);
  // Bars that can be switched off (grouped bars, bars at numeric X): their fields are greyed out while they are.
  const barsOff = (chart.type === 'groupedBar' || chart.type === 'xyBars') && !st.showBars;
  const errorOff = describeSummaryControls({ showErrorBars: st.showErrorBars, centre: spec.centre, spread: spec.spread }).errorOff;
  const stepSeries = (dir: 1 | -1) => {
    const i = selected ? series.indexOf(selected) : -1;
    const j = i + dir;
    if (j < 0 || j >= series.length) setSelection({ kind: 'chart' });
    else setSelection({ kind: 'group', groupId: series[j].id });
  };

  return (
    <InspectorShell nav={nav}>
          {(shows('style') || shows('analysis')) && (
            <div className="tab-body">
              <div className="dataset-row">
                <span className="dataset-label">{noun}:</span>
                <select className="dataset-select" aria-label="Data set" value={Array.isArray(scope) ? SEVERAL : scope} onChange={(e) => e.target.value !== SEVERAL && setSelection(e.target.value === 'all' ? { kind: 'chart' } : { kind: 'group', groupId: e.target.value })}>
                  <option value="all">Global (all {noun.toLowerCase() === 'series' ? 'series' : `${noun.toLowerCase()}s`})</option>
                  {Array.isArray(scope) && <option value={SEVERAL}>{scope.length} {noun.toLowerCase() === 'series' ? 'series' : `${noun.toLowerCase()}s`} together</option>}
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
                <DataSetReset chart={chart} table={table} scope={scope} run={run} />
              </div>
              <DataSetPicker sets={series.map((g) => ({ id: g.id, label: displayName(chart, g.id, g.name) }))} selection={selection} setSelection={setSelection} noun={noun.toLowerCase() === 'series' ? 'series' : `${noun.toLowerCase()}s`} />

              {shows('style') && (
              <GroupBox title="Style">
                <PaletteField chart={chart} hint="Gives the series coordinated colours in order. Per-series colours below still apply on top." />
                {family === 'xy' && bindingUi.offered && (
                  <Field label="Plot data on" hint="Which Y axis this series is drawn against" overridden={ov('axisBinding')} note={mixedBinding ? 'The series use different axes. Choose Left or Right to set all of them.' : null}>
                    <select value={mixedBinding ? 'mixed' : bindingUi.value} disabled={series.length === 0} aria-label="Plot data on" onChange={(e) => run(e.target.value === 'secondary' ? 'Plot data on right Y axis' : 'Plot data on left Y axis', patchStyle(chart.id, scope, { axisBinding: e.target.value as AxisBinding }))}>
                      {mixedBinding && <option value="mixed" disabled>Mixed</option>}
                      {bindingUi.options.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </Field>
                )}
              </GroupBox>
              )}

              {shows('analysis') && layout.kind === 'replicates' && (
                <GroupBox title={`Replicates (${layout.n} per value)`}>
                  <LineAtField centre={spec.centre} overridden={ovSum('centre')} onChange={(centre) => setSummary({ centre }, 'Change line at')} />
                  <div className="muted small">Each value is drawn at the centre of its replicate values.</div>
                </GroupBox>
              )}
              {shows('analysis') && layout.kind === 'summary' && (
                <GroupBox title="Values entered">
                  <div className="muted small">The table holds values already calculated ({summaryFormatInfo(layout.format).label}). They are drawn as entered; nothing is recalculated.</div>
                </GroupBox>
              )}

              {shows('analysis') && distChart && <DistributionControls chart={chart} lineColor={st.lineColor} lineWidthPt={st.lineWidthPt} lineOpacity={st.lineOpacity} onLine={(patch) => setStyle(patch)} />}
              {shows('style') && (
              <>
              {(barChart || chart.type === 'xyBars') && (
                <GroupBox title={distChart ? (chart.type === 'groupedBox' ? 'Box' : 'Violin') : 'Bars'} {...(chart.type === 'groupedBar' || chart.type === 'xyBars' ? { checked: st.showBars, onCheckedChange: (v: boolean) => setStyle({ showBars: v }), overridden: ov('showBars') } : {})}>
                  <Field label="Fill" overridden={ov('barFill')}>
                    <ColorInput value={st.barFill} disabled={barsOff} onChange={(v) => setStyle({ barFill: v })} />
                  </Field>
                  <NumField {...SLIDERS.fraction} label="Opacity" value={st.barOpacity} min={0} max={1} disabled={barsOff} overridden={ov('barOpacity')} onCommit={(v) => setStyle({ barOpacity: v })} hint="0 = transparent, 1 = opaque" />
                  <NumField {...SLIDERS.line} label="Border" unit="pt" value={st.barBorderWidthPt} min={0} max={20} disabled={barsOff} overridden={ov('barBorderWidthPt')} onCommit={(v) => setStyle({ barBorderWidthPt: v })} />
                  <NumField {...SLIDERS.fraction} label="Border opacity" value={st.barBorderOpacity} min={0} max={1} disabled={barsOff} overridden={ov('barBorderOpacity')} onCommit={(v) => setStyle({ barBorderOpacity: v })} hint="0 = transparent, 1 = opaque" />
                  <Field label="Border colour" overridden={ov('barBorderColor')}>
                    <ColorInput value={st.barBorderColor} disabled={barsOff} onChange={(v) => setStyle({ barBorderColor: v })} />
                  </Field>
                </GroupBox>
              )}

              {(chart.type === 'groupedFloating' || chart.type === 'groupedBar') && (
                <GroupBox title={chart.type === 'groupedBar' ? 'Mean line' : 'Centre line'} checked={st.showMeanLine} onCheckedChange={(v) => setStyle({ showMeanLine: v })} overridden={ov('showMeanLine')}>
                  <LineLookFields st={st} ov={ov} setStyle={setStyle} disabled={!st.showMeanLine} />
                  <div className="muted small">{chart.type === 'groupedBar' ? 'A line across each bar at the value it shows.' : 'The bar runs from the smallest to the largest value; the line marks the mean of the replicates.'}</div>
                </GroupBox>
              )}

              {usesFactors(chart.type) && (
                <Field label="Group the columns by" hint="Category: the series stand side by side inside each category (the usual layout). Series: each series has its own group of columns, one column for each category, and its name is written under the group.">
                  <SelectInput<'category' | 'series'> value={chart.groupedBy} options={[{ value: 'category', label: 'Category' }, { value: 'series', label: 'Series (separated)' }]} onChange={(v) => run('Group the columns by', patchLook(chart.id, { groupedBy: v }))} />
                </Field>
              )}
              {usesFactors(chart.type) && chart.groupedBy === 'category' && (
                <div className="muted small">
                  {hasFactors(series.map((g) => ({ columns: [g] })))
                    ? 'The series that share a factor are drawn together; each series keeps the colour of its place in the cluster. Change factors with Factor… in the data table.'
                    : 'Two grouping levels: name the factor of each series with Factor… in the data table, and the series that share one are drawn together inside each category.'}
                </div>
              )}

              {chart.type === 'groupedLine' && (
                <GroupBox title="Summary rows">
                  <div className="muted small">A summary row (a pooled effect, say) is drawn as a diamond from its lower to its upper limit, with no bar. Tick the rows that are summaries; the limits are the ones in the table.</div>
                  {table.rows.map((row, i) => {
                    const name = row.title !== '' ? row.title : `Row ${i + 1}`;
                    const ids = chart.summaryRows ?? [];
                    return (
                      <Field key={row.id} label={name}>
                        <Check checked={ids.includes(row.id)} ariaLabel={`Summary row: ${name}`} onChange={(v) => run('Summary row', patchLook(chart.id, { summaryRows: v ? [...ids, row.id] : ids.filter((id) => id !== row.id) }))} />
                      </Field>
                    );
                  })}
                </GroupBox>
              )}

              {chart.type === 'xyVolcano' && <VolcanoControls chart={chart} counts={xyModel?.volcanoCounts} />}
              {(!barChart || ((chart.type === 'groupedBar' || chart.type === 'groupedFloating' || distChart) && layout.kind === 'replicates')) && (
              <GroupBox title={family === 'survival' ? 'Censor marks' : distChart ? 'Points' : barChart ? 'Individual values' : 'Symbols'} checked={symbolsOn} onCheckedChange={(v) => setStyle(v ? { showSymbols: true } : { showSymbols: false, showRawPoints: false })} overridden={ov('showSymbols')}>
                {family === 'survival' && (
                  <Field label="Also at every event" hint="A symbol where the curve drops, as well as at the censored subjects">
                    <Check checked={chart.survival.eventSymbols} disabled={!symbolsOn} onChange={(v) => run('Symbols at events', patchSurvival(chart.id, { eventSymbols: v }))} />
                  </Field>
                )}
                <SymbolLookFields
                  st={st}
                  ov={ov}
                  setStyle={setStyle}
                  disabled={!symbolsOn}
                  colourLocked={chart.type === 'xyVolcano'}
                  colourNote={chart.type === 'xyVolcano' ? 'A volcano plot is coloured by up, down and not significant (see above).' : null}
                  {...(chart.type === 'xyBubble' ? { sizeLabel: 'Largest bubble', sizeHint: 'The diameter of the largest bubble of the chart; the area of the others follows their size.' } : {})}
                  afterSize={chart.type === 'xyBubble' && layout.kind === 'sized' && (
                  <>
                    <Field label="Size legend" hint="Circles of chosen sizes under the plot, on the scale of the bubbles, so a reader can tell what a size means.">
                      <Check checked={chart.sizeLegend !== undefined} ariaLabel="Size legend" onChange={(v) => run('Size legend', patchLook(chart.id, { sizeLegend: v ? { values: [] } : undefined }))} />
                    </Field>
                    {chart.sizeLegend && (
                      <NumberListField label="Sizes shown" hint="Sizes in the units of the size column, for example 10, 50, 100 (at most 6). Empty: three round values below the largest size." value={chart.sizeLegend.values} max={MAX_LEGEND_SIZES} placeholder="Automatic" normalise={(v) => [...new Set(v.filter((x) => x > 0))].sort((x, y) => x - y)} onCommit={(v) => run('Sizes shown', patchLook(chart.id, { sizeLegend: { values: v } }))} />
                    )}
                  </>
                  )}
                />
                {family === 'xy' && layout.kind === 'replicates' && (
                  <Field label="Symbols show" overridden={ov('showRawPoints')} hint="The mean (or median) of each row, or every replicate as a small symbol; never both. The individual values are part of the axis range while shown">
                    <SelectInput<'centre' | 'values'> value={st.showRawPoints ? 'values' : 'centre'} options={[{ value: 'centre', label: 'Mean' }, { value: 'values', label: 'Individual values' }]} onChange={(v) => setStyle({ showRawPoints: v === 'values', showSymbols: true })} />
                  </Field>
                )}
                {(chart.type === 'groupedBar' || chart.type === 'groupedFloating' || distChart) && layout.kind === 'replicates' && <DotPlacementControls chart={chart} disabled={!symbolsOn} />}
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
                  <ErrorBarLookFields st={st} ov={ov} setStyle={setStyle} disabled={layout.kind === 'replicates' ? errorOff : !st.showErrorBars} />
                </GroupBox>
              )}

              {!barChart && (
              <GroupBox title={family === 'survival' ? 'Curve' : 'Line'} checked={st.showLines} onCheckedChange={(v) => setStyle({ showLines: v })} overridden={ov('showLines')}>
                <LineLookFields st={st} ov={ov} setStyle={setStyle} disabled={!st.showLines} />
                <Field label="Pattern" overridden={ov('lineStyle')}>
                  <SelectInput<LineStyle> value={st.lineStyle} disabled={!st.showLines} options={LINE_STYLES.map((l) => ({ value: l.value, label: l.label }))} onChange={(v) => setStyle({ lineStyle: v })} />
                </Field>
                {family === 'xy' && capabilitiesOf(chart.type).lineConnect && (
                  <Field label="Connect points in" hint="Table order joins the points as the rows run. Ascending X joins them from the lowest X to the highest. The table, the symbols and the fit do not change.">
                    <SelectInput<LineConnect> value={chart.lineConnect} options={[{ value: 'table', label: 'Table order' }, { value: 'x', label: 'Ascending X' }]} onChange={(v) => run('Connect points in', patchLook(chart.id, { lineConnect: v }))} />
                  </Field>
                )}
                <div className="muted small">{family === 'survival' ? 'The Kaplan-Meier estimate, a step at each event time.' : family === 'grouped' ? 'The means of each series are joined across the categories.' : 'Points are joined in the order of the table rows; a missing Y value breaks the line.'}</div>
              </GroupBox>
              )}
              </>
              )}
              {shows('analysis') && family === 'xy' && xyModel && <FitSection chart={chart} table={table} model={xyModel} />}
              {shows('style') && (family === 'xy' || family === 'survival' || family === 'grouped') && <LayersSection chart={chart} table={table} />}
              {family === 'survival' && (
                <>
                  {shows('style') && (
                  <GroupBox title="Error bars (standard error)" checked={chart.survival.errorBars} onCheckedChange={(v) => run('Survival error bars', patchSurvival(chart.id, { errorBars: v }))}>
                    <Field label="Colour" overridden={ov('errorColor')}>
                      <ColorInput value={st.errorColor} disabled={!chart.survival.errorBars} onChange={(v) => setStyle({ errorColor: v })} />
                    </Field>
                    <NumField {...SLIDERS.line} label="Thickness" unit="pt" value={st.errorLineWidthPt} min={0.2} max={20} disabled={!chart.survival.errorBars} overridden={ov('errorLineWidthPt')} onCommit={(v) => setStyle({ errorLineWidthPt: v })} />
                    <NumField {...SLIDERS.fraction} label="Opacity" value={st.errorOpacity} min={0} max={1} disabled={!chart.survival.errorBars} overridden={ov('errorOpacity')} onCommit={(v) => setStyle({ errorOpacity: v })} hint="0 = transparent, 1 = opaque" />
                    <div className="muted small">One standard error (Greenwood) either side of the estimate at each event time, kept within 0 to 1.</div>
                  </GroupBox>
                  )}
                  {shows('analysis') && (
                  <GroupBox title="Confidence band" checked={chart.survival.band} onCheckedChange={(v) => run('Confidence band', patchSurvival(chart.id, { band: v }))}>
                    <NumField {...SLIDERS.percent}
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
                  )}
                  {shows('style') && (
                  <GroupBox title="At-risk table" checked={chart.survival.atRisk} onCheckedChange={(v) => run('At-risk table', patchSurvival(chart.id, { atRisk: v }))}>
                    <div className="muted small">The number of subjects still under observation at each tick of the time axis, one row per group, under the plot.</div>
                  </GroupBox>
                  )}
                </>
              )}
              {shows('style') && family !== 'survival' && <LineOrderSection chart={chart} />}
              {shows('style') && family === 'xy' && <div className="muted small">Missing is not zero: rows with an empty X or Y cell are left out, not plotted at 0.</div>}
              {shows('analysis') && !hasAnalysis && <div className="muted small">This graph has no calculation settings.</div>}
            </div>
          )}

          {shows('axes') && (
            <div>
              <Section title={xyModel ? (family === 'survival' ? 'Time axis' : 'X axis (numbers)') : 'Category axis'}>
                <Field label="Show X axis">
                  <Check checked={chart.xAxis.visible} onChange={(v) => run('Show X axis', patchAxis(chart.id, 'xAxis', { visible: v }))} />
                </Field>
                {xyModel ? <AxisLimits chart={chart} which="xAxis" scale={xyModel.x} name={family === 'survival' ? 'Time' : 'X'} canScale={family !== 'survival'} canReverse={family !== 'survival'} time={family === 'xy' ? table.groups[0]?.time : undefined} /> : <div className="muted small">The categories are the rows of the table, so there are no numeric limits to set.</div>}
              </Section>
              <Section title={dual ? 'Left Y axis' : 'Y axis'}>
                <Field label={dual ? 'Show left Y axis' : 'Show Y axis'}>
                  <Check checked={chart.yAxis.visible} onChange={(v) => run('Show Y axis', patchAxis(chart.id, 'yAxis', { visible: v }))} />
                </Field>
                {yScale && <AxisLimits chart={chart} which="yAxis" scale={yScale} name={dual ? 'Left Y' : 'Y'} canScale={yAxisCanChange} canReverse={yAxisCanChange} />}
              </Section>
              {y2Scale && (
                <Section title="Right Y axis">
                  <Field label="Right Y axis title">
                    <TextInput value={chart.y2Axis.title} onChange={(v) => run('Right Y axis title', patchAxis(chart.id, 'y2Axis', { title: v }), 'axis:y2t')} />
                  </Field>
                  <Field label="Show right Y axis">
                    <Check checked={chart.y2Axis.visible} onChange={(v) => run('Show right Y axis', patchAxis(chart.id, 'y2Axis', { visible: v }))} />
                  </Field>
                  <AxisLimits chart={chart} which="y2Axis" scale={y2Scale} name="Right Y" />
                  <div className="muted small">Reference lines, shaded regions, extra ticks and annotations placed at values are on the left Y axis.</div>
                </Section>
              )}
              <GridStyleSection chart={chart} />
              <ReferenceLinesSection chart={chart} />
            </div>
          )}

          {shows('type') && <ChartTypePicker chart={chart} table={table} />}
          {shows('text') && <TextSections chart={chart} groups={series} yName={dual ? 'Left Y' : 'Y'} dual={dual} />}
          {shows('frame') && <FrameSection chart={chart} dual={dual} origin={family === 'grouped' ? 'y' : 'xy'} />}
          {shows('layout') && (
            <div>
              <DimensionsSection chart={chart} />
              {supportsHorizontal(chart.type) && <DirectionSection chart={chart} />}
              {(chart.type === 'groupedBar' || chart.type === 'groupedFloating' || chart.type === 'contingencyBars') && <ColumnLayoutSection chart={chart} spacing={false} baseline />}
              {chart.type === 'xyBars' && <ColumnLayoutSection chart={chart} spacing baseline numericX />}
              {chart.type === 'xyOffset' && <OffsetSection chart={chart} autoStep={autoOffsetStep(table)} />}
            </div>
          )}
          {shows('legend') && <LegendSection chart={chart} groups={series} />}
      {shows('datasets') && (
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
                    nav.setPage('plot');
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

      {shows('annotations') && <AnnotationsTab chart={chart} placer={annotationPlacer(any, any.model.widthPt, any.model.heightPt)} />}
      {shows('export') && <ExportPanel chart={chart} table={table} />}
    </InspectorShell>
  );
}
