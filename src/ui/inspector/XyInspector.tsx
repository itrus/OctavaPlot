import { useEffect, useMemo, useState } from 'react';
import { displayName } from '../../chart/model';
import { validateAxisInterval, validateAxisMax, validateAxisMin, type AxisEditContext, type YAxisScale } from '../../chart/scales';
import { buildAnyModel } from '../../chart/anyModel';
import { chartFamily, chartTypesFor } from '../../model/chartTypes';
import { layoutOf, summaryFormatInfo, xySeries } from '../../model/tableLayout';
import { isSummaryOverridden, resolveSummary, validateSummaryPatch } from '../../model/summary';
import { intervalCaptionLines, DIRECTION_HINT, describeSummaryControls } from '../../stats/describe';
import { tooltipFmt } from '../../chart/tooltip';
import { IntervalFields, LineAtField } from './SummaryControls';
import { PALETTES, paletteById } from '../../model/palettes';
import { isGroupOverridden, resolveStyle } from '../../model/style';
import type { AxisConfig, Chart, ChartStyle, ChartType, DataTable, Id, SummarySpec } from '../../model/types';
import { useApp } from '../../state/AppContext';
import { applyPalette, composeCommands, patchAxis, patchBothAxes, patchChart, patchStyle, patchSummary, patchSurvival, setChartType } from '../../state/commands';
import { Check, ColorInput, Field, GroupBox, NumField, OptionalNumField, Section, SectionBar, SelectInput, TabBar } from './controls';
import { SECTIONS, TABS, type AppearanceSection, type InspectorTab } from './nav';
import { AnnotationsTab, DimensionsSection, LegendSection, OnThisGraph, TextSections } from './SharedSections';

const shapeOptions = [
  { value: 'circle', label: 'Circle' },
  { value: 'square', label: 'Square' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'diamond', label: 'Diamond' },
  { value: 'plus', label: 'Plus' },
  { value: 'cross', label: 'Cross' },
] as const;

const axisCtx = (axis: AxisConfig, scale: YAxisScale): AxisEditContext => ({ min: axis.min, max: axis.max, majorInterval: axis.majorInterval, domain: scale.domain });
const stepOf = (scale: YAxisScale) => (scale.ticks.length > 1 ? scale.ticks[1] - scale.ticks[0] : 1);

/** Range, limits and ticks of one numeric axis: Auto fits the data, Manual uses the limits. */
function AxisLimits({ chart, which, scale, name }: { chart: Chart; which: 'xAxis' | 'yAxis'; scale: YAxisScale; name: string }) {
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
    </>
  );
}

/**
 * Formatting panel of the charts drawn from a table of series: XY charts (a numeric X axis), survival curves (time on
 * X), grouped bars and lines over categories, and contingency bars. Each series has its own style; which boxes appear
 * follows the chart type and how the table's values are entered.
 */
export function XyInspector({ chart, table }: { chart: Chart; table: DataTable }) {
  const { selection, setSelection, run, inspectorNav } = useApp();
  const [tab, setTab] = useState<InspectorTab>('appearance');
  const [section, setSection] = useState<AppearanceSection>('style');
  useEffect(() => {
    const t = inspectorNav.target;
    if (inspectorNav.n === 0 || !t) return;
    setTab(t.tab);
    if (t.section) setSection(t.section);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectorNav.n]);

  const layer = chart.layers[0];
  const layout = layoutOf(table);
  // The Y series as data sets: a series is one column or a block of sub-columns, keyed by its first column.
  const series = useMemo(() => xySeries(table).map((s) => ({ ...s.columns[0], name: s.name })), [table]);
  const selectedId = selection.kind === 'group' || selection.kind === 'point' ? selection.groupId : null;
  const selected = series.find((g) => g.id === selectedId);
  const scope: 'all' | Id = selected ? selected.id : 'all';
  const sampleIndex = selected ? series.indexOf(selected) : 0;
  const sample = series[sampleIndex];
  const any = useMemo(() => buildAnyModel(chart, table), [chart, table]);
  // The numeric-X model (XY, survival) and the category model (grouped, contingency) differ in what an axis is.
  const xyModel = any.family === 'xy' || any.family === 'survival' ? any.model : null;
  const yScale = any.family === 'category' ? null : any.model.y;
  const seriesView = any.family === 'category' ? [] : any.model.series.map((x) => ({ groupId: x.groupId, label: x.label, style: x.style, count: 'points' in x ? x.points.length : 0, bars: 'bars' in x ? x.bars.length : 0 }));
  const family = chartFamily(chart.type);
  const noun = table.kind === 'survival' ? 'Group' : table.kind === 'contingency' ? 'Outcome' : table.kind === 'grouped' ? 'Group' : 'Series';
  const barChart = chart.type === 'groupedBar' || chart.type === 'contingencyBars' || chart.type === 'contingencyStacked' || chart.type === 'contingencyPercent';
  const stacked = chart.type === 'contingencyStacked' || chart.type === 'contingencyPercent';

  // "Global" shows the layer-level values; a series shows its own resolved values.
  const st: ChartStyle = useMemo(() => {
    if (!sample) return chart.defaults;
    const l = scope === 'all' ? { ...layer, groupOverrides: {}, objectOverrides: {} } : layer;
    return resolveStyle(chart, l, { id: sample.id, paletteIndex: sampleIndex });
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
                <Field label="Color palette" hint="Gives the series coordinated colours in order. Per-series colours below still apply on top.">
                  <select
                    value={chart.paletteId ?? 'custom'}
                    aria-label="Color palette"
                    onChange={(e) => {
                      const palette = paletteById(e.target.value);
                      if (palette) run(`Apply ${palette.name} palette`, applyPalette(chart.id, palette));
                    }}
                  >
                    {chart.paletteId === null && <option value="custom" disabled>Custom colours</option>}
                    {PALETTES.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  {paletteById(chart.paletteId) && (
                    <span className="palette-swatches" aria-hidden="true">
                      {paletteById(chart.paletteId)!.colors.slice(0, 5).map((c) => (
                        <i key={c} style={{ background: c }} />
                      ))}
                    </span>
                  )}
                </Field>
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

              {barChart && (
                <GroupBox title="Bars">
                  <Field label="Fill" overridden={ov('barFill')}>
                    <ColorInput value={st.barFill} onChange={(v) => setStyle({ barFill: v })} />
                  </Field>
                  <NumField label="Opacity" value={st.barOpacity} min={0} max={1} overridden={ov('barOpacity')} onCommit={(v) => setStyle({ barOpacity: v })} hint="0 = transparent, 1 = opaque" />
                  <NumField label="Border" unit="pt" value={st.barBorderWidthPt} min={0} max={20} overridden={ov('barBorderWidthPt')} onCommit={(v) => setStyle({ barBorderWidthPt: v })} />
                  <Field label="Border color" overridden={ov('barBorderColor')}>
                    <ColorInput value={st.barBorderColor} onChange={(v) => setStyle({ barBorderColor: v })} />
                  </Field>
                </GroupBox>
              )}

              {(!barChart || (chart.type === 'groupedBar' && layout.kind === 'replicates')) && (
              <GroupBox title={family === 'survival' ? 'Censor marks' : barChart ? 'Individual values' : 'Symbols'} checked={st.showSymbols} onCheckedChange={(v) => setStyle({ showSymbols: v })} overridden={ov('showSymbols')}>
                <Field label="Color" overridden={ov('symbolColor')}>
                  <ColorInput value={st.symbolColor} disabled={!st.showSymbols} onChange={(v) => setStyle({ symbolColor: v, symbolBorderColor: v })} />
                </Field>
                <Field label="Shape" overridden={ov('symbolShape')}>
                  <SelectInput value={st.symbolShape} disabled={!st.showSymbols} options={[...shapeOptions]} onChange={(v) => setStyle({ symbolShape: v })} />
                </Field>
                <NumField label="Size" unit="pt" value={st.symbolSizePt} min={1} max={40} disabled={!st.showSymbols} overridden={ov('symbolSizePt')} onCommit={(v) => setStyle({ symbolSizePt: v })} />
                <Field label="Border color" overridden={ov('symbolBorderColor')}>
                  <ColorInput value={st.symbolBorderColor} disabled={!st.showSymbols} onChange={(v) => setStyle({ symbolBorderColor: v })} />
                </Field>
                <NumField label="Border thickness" unit="pt" value={st.symbolBorderWidthPt} min={0} max={10} disabled={!st.showSymbols} overridden={ov('symbolBorderWidthPt')} onCommit={(v) => setStyle({ symbolBorderWidthPt: v })} />
              </GroupBox>

              )}

              {layout.kind !== 'single' && !stacked && table.kind !== 'contingency' && (
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
                  <NumField label="Cap width" unit="pt" value={st.errorCapWidthPt} min={0} max={60} disabled={st.errorCap === 'none'} overridden={ov('errorCapWidthPt')} onCommit={(v) => setStyle({ errorCapWidthPt: v })} />
                  <Field label="Dir." overridden={ov('errorDirection')} hint={DIRECTION_HINT}>
                    <SelectInput value={st.errorDirection} options={[{ value: 'both', label: 'Both' }, { value: 'positive', label: 'Above' }, { value: 'negative', label: 'Below' }]} onChange={(v) => setStyle({ errorDirection: v })} />
                  </Field>
                  <NumField label="Thickness" unit="pt" value={st.errorLineWidthPt} min={0.1} max={20} overridden={ov('errorLineWidthPt')} onCommit={(v) => setStyle({ errorLineWidthPt: v })} />
                </GroupBox>
              )}

              {!barChart && (
              <GroupBox title={family === 'survival' ? 'Curve' : 'Line'} checked={st.showLines} onCheckedChange={(v) => setStyle({ showLines: v })} overridden={ov('showLines')}>
                <Field label="Color" overridden={ov('lineColor')}>
                  <ColorInput value={st.lineColor} disabled={!st.showLines} onChange={(v) => setStyle({ lineColor: v })} />
                </Field>
                <NumField label="Thickness" unit="pt" value={st.lineWidthPt} min={0.1} max={20} disabled={!st.showLines} overridden={ov('lineWidthPt')} onCommit={(v) => setStyle({ lineWidthPt: v })} />
                <div className="muted small">{family === 'survival' ? 'The Kaplan-Meier estimate, a step at each event time.' : family === 'grouped' ? 'The means of each series are joined across the categories.' : 'Points are joined in the order of the table rows; a missing Y value breaks the line.'}</div>
              </GroupBox>
              )}
              {family === 'survival' && (
                <>
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
              {family === 'xy' && <div className="muted small">Missing is not zero: rows with an empty X or Y cell are left out, not plotted at 0.</div>}
            </div>
          )}

          {section === 'axes' && (
            <div>
              <Section title={xyModel ? (family === 'survival' ? 'Time axis' : 'X axis (numbers)') : 'Category axis'}>
                <Field label="Show X axis">
                  <Check checked={chart.xAxis.visible} onChange={(v) => run('Show X axis', patchAxis(chart.id, 'xAxis', { visible: v }))} />
                </Field>
                {xyModel ? <AxisLimits chart={chart} which="xAxis" scale={xyModel.x} name={family === 'survival' ? 'Time' : 'X'} /> : <div className="muted small">The categories are the rows of the table, so there are no numeric limits to set.</div>}
              </Section>
              <Section title="Y axis">
                <Field label="Show Y axis">
                  <Check checked={chart.yAxis.visible} onChange={(v) => run('Show Y axis', patchAxis(chart.id, 'yAxis', { visible: v }))} />
                </Field>
                {yScale && <AxisLimits chart={chart} which="yAxis" scale={yScale} name="Y" />}
              </Section>
              <Section title="Axis lines">
                <NumField label="Axis line thickness" unit="pt" value={chart.yAxis.lineWidthPt} min={0} max={10} onCommit={(v) => run('Axis line thickness', patchBothAxes(chart.id, { lineWidthPt: v }), 'axis:lw')} />
              </Section>
            </div>
          )}

          {section === 'text' && <TextSections chart={chart} groups={series} yName="Y" dual={false} />}
          {section === 'dimensions' && <DimensionsSection chart={chart} />}
          {section === 'legend' && <LegendSection chart={chart} groups={series} />}
        </div>
      )}

      {tab === 'datasets' && (
        <div className="tab-body">
          <OnThisGraph chart={chart} />
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
