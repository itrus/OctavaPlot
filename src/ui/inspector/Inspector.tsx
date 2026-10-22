import { useEffect, useMemo, useState } from 'react';
import { FILL_PATTERN_OPTIONS, describeBarFillUi } from '../../model/fill';
import { CHART_PX_MAX, CHART_PX_MIN } from '../../model/defaults';
import { applyAspect, resizeChart } from '../../model/aspect';
import { graphSources, type GraphSource } from '../../model/chartTable';
import { PALETTES, paletteById } from '../../model/palettes';
import { newId } from '../../model/ids';
import { isGroupOverridden, resolveStyle } from '../../model/style';
import { isSummaryOverridden, resolveSummary, validateSummaryPatch } from '../../model/summary';
import type { AxisBinding, Chart, ChartStyle, ChartType, DataTable, Id, SummarySpec } from '../../model/types';
import { AXIS_SHORT, AXIS_TAG, bindingOf, bindingSelectState } from '../../chart/axes';
import { clippedEndpointCount, clippedEndpointMessage } from '../../chart/errorGeometry';
import { buildChartModel, displayName } from '../../chart/model';
import { validateAxisInterval, validateAxisMax, validateAxisMin, type AxisEditContext } from '../../chart/scales';
import { tooltipFmt } from '../../chart/tooltip';
import {
  DIRECTION_HINT,
  centreChangeCompat,
  centreTitles,
  centreNoticeLines,
  describeCounts,
  describeSummaryControls,
  datasetRowText,
  intervalCaptionLines,
  summaryCaption,
} from '../../stats/describe';
import { useApp } from '../../state/AppContext';
import {
  addAnnotation,
  applyPalette,
  composeCommands,
  patchAnnotation,
  patchAxis,
  clearPointStyle,
  patchBothAxes,
  patchChart,
  patchJitter,
  patchLegend,
  patchPointStyle,
  patchStyle,
  patchSummary,
  removeAnnotation,
  setChartType,
  setDisplayName,
  setGroupOnGraph,
  setLegendItemVisible,
} from '../../state/commands';
import { Check, ColorInput, Field, GroupBox, NumField, OptionalNumField, Section, SectionBar, SelectInput, SubHeading, TabBar, TextInput } from './controls';
import {
  backgroundDisplay,
  backgroundNonePatch,
  datasetSwatch,
  followBorderPatch,
  followsBorder,
  fillRowNote,
  opacityNote,
  patternColorDisplay,
  spacingError,
  togglePatternPatch,
  widthError,
  widthLabel,
} from './fillRules';
import type { AppearanceSection, InspectorTab } from './nav';
import { PointLabelControls, SelectedPointBox, type PointEdit } from './PointLabelControls';
import { pointSelectionState } from './pointOverrideUi';
import { CalculationOptions,IntervalFields, LineAtField } from './SummaryControls';

const shapeOptions = [
  { value: 'circle', label: 'Circle' },
  { value: 'square', label: 'Square' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'diamond', label: 'Diamond' },
] as const;


const SECTIONS: Array<{ id: AppearanceSection; label: string }> = [
  { id: 'style', label: 'Style' },
  { id: 'axes', label: 'Axes' },
  { id: 'text', label: 'Text' },
  { id: 'dimensions', label: 'Dimensions' },
  { id: 'legend', label: 'Legend' },
];

const TABS: Array<{ id: InspectorTab; label: string }> = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'datasets', label: 'Data Sets on Graph' },
  { id: 'annotations', label: 'Annotations' },
];

function DatasetSwatchChip({ style }: { style: ChartStyle }) {
  const sw = datasetSwatch(style);
  return (
    <span
      className="swatch"
      title={sw.title ?? undefined}
      style={{ background: sw.background, backgroundImage: sw.backgroundImage ?? undefined, borderColor: sw.borderColor }}
    />
  );
}

export function Inspector({ chart, table }: { chart: Chart; table: DataTable }) {
  const { selection, setSelection, run, setStatus, project, inspectorNav } = useApp();
  // Every data set the graph could plot, grouped by table, for the on/off switches.
  const tablesWithSources = useMemo(() => {
    const byTable = new Map<string, [string, string, GraphSource[]]>();
    for (const s of graphSources(project, chart)) {
      if (!byTable.has(s.tableId)) byTable.set(s.tableId, [s.tableId, s.tableName, []]);
      byTable.get(s.tableId)![2].push(s);
    }
    return [...byTable.values()];
  }, [project, chart]);
  const setManyOnGraph = (sources: GraphSource[], on: boolean) =>
    run(on ? 'Show all data sets' : 'Hide all data sets', composeCommands(...sources.map((s) => setGroupOnGraph(chart.id, s.tableId, s.group.id, on))));
  const [tab, setTab] = useState<InspectorTab>('appearance');
  const [section, setSection] = useState<AppearanceSection>('style');
  // A click on a chart element sends the inspector to that element's settings.
  useEffect(() => {
    const t = inspectorNav.target;
    if (inspectorNav.n === 0 || !t) return;
    setTab(t.tab);
    if (t.section) setSection(t.section);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectorNav.n]);
  const layer = chart.layers[0];

  // Selection scope: a selected data set or point edits that data set; anything else edits all groups.
  const sel = pointSelectionState(table, selection, chart.type);
  const selectedGroup = sel.groupId ? table.groups.find((g) => g.id === sel.groupId) : undefined;
  const scope: 'all' | Id = selectedGroup ? selectedGroup.id : 'all';
  // A selected point that no longer exists (deleted data set or row, or a chart type without points) steps back.
  const fallbackKey = sel.fallback ? JSON.stringify(sel.fallback) : null;
  useEffect(() => {
    if (sel.fallback) setSelection(sel.fallback);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fallbackKey]);
  const sample = selectedGroup ?? table.groups[0];

  const st: ChartStyle = useMemo(() => {
    if (!sample) return chart.defaults;
    // "All groups" shows layer-level values; a group shows its own resolved values.
    const l = scope === 'all' ? { ...layer, groupOverrides: {}, objectOverrides: {} } : layer;
    return resolveStyle(chart, l, sample);
  }, [chart, layer, sample, scope]);

  // Summary settings: the layer value for Global, the resolved value for a data set.
  const spec: SummarySpec = !sample || scope === 'all' ? layer.summary : resolveSummary(layer, scope);
  const ovSum = (key: keyof SummarySpec) => scope !== 'all' && isSummaryOverridden(layer, scope, key);
  const setSummary = (patch: Partial<SummarySpec>, label = 'Change summary') => {
    if (!validateSummaryPatch(patch)) return;
    run(label, patchSummary(chart.id, scope, patch), `summary:${scope}:${Object.keys(patch).join(',')}`);
  };
  const setCentre = (centre: SummarySpec['centre']) => {
    setSummary({ centre }, 'Change line at');
    // The stored spread is never rewritten; say so when it becomes inactive.
    const compat = centreChangeCompat(centre, spec.spread);
    if (compat.note) setStatus(compat.note);
  };

  const model = useMemo(() => buildChartModel(chart, table), [chart, table]);
  const scopeGroup = scope === 'all' ? null : model.groups.find((g) => g.groupId === scope) ?? null;
  const clippedBars = (scopeGroup ? [scopeGroup] : model.groups).flatMap((g) => (g.errorBar ? [g.errorBar] : []));
  const clippedEnds = clippedEndpointCount(clippedBars);

  const setStyle = (patch: Partial<ChartStyle>) => {
    const key = Object.keys(patch).join(',');
    // Colouring by hand leaves the chart-wide palette behind.
    const recolours = 'barFill' in patch || 'symbolColor' in patch;
    const command = recolours && chart.paletteId !== null ? composeCommands(patchStyle(chart.id, scope, patch), patchChart(chart.id, { paletteId: null })) : patchStyle(chart.id, scope, patch);
    run('Change style', command, `style:${scope}:${key}`);
  };
  const editPoint = (pointId: Id) => (label: string, edit: PointEdit, coalesceKey?: string) =>
    run(
      label,
      composeCommands(
        ...(edit.clear ? [clearPointStyle(chart.id, pointId, edit.clear)] : []),
        ...(edit.set ? [patchPointStyle(chart.id, pointId, edit.set)] : []),
      ),
      coalesceKey,
    );
  const ov = (key: keyof ChartStyle) => scope !== 'all' && isGroupOverridden(layer, scope, key);
  const setChart = (label: string, patch: Partial<Chart>, key?: string) => run(label, patchChart(chart.id, patch), key);

  // "<" / ">" step through the data sets; stepping off either end returns to Global.
  const stepGroup = (dir: 1 | -1) => {
    const n = table.groups.length;
    if (n === 0) return;
    const i = selectedGroup ? table.groups.findIndex((g) => g.id === selectedGroup.id) : -1;
    const j = i + dir;
    if (j < 0 || j >= n) setSelection({ kind: 'chart' });
    else setSelection({ kind: 'group', groupId: table.groups[j].id });
  };

  // Two value axes exist only while a data set is bound to the right one.
  const dual = model.y2 !== null;
  const bindingUi = bindingSelectState(chart.type, st);
  const groupBindings = model.groups.map((g) => bindingOf(g.style));
  const mixedBinding = scope === 'all' && groupBindings.some((b) => b !== groupBindings[0]);
  const setBinding = (axisBinding: AxisBinding) =>
    run(axisBinding === 'secondary' ? 'Plot data on right Y axis' : 'Plot data on left Y axis', patchStyle(chart.id, scope, { axisBinding }));
  const axisCtx = (axis: Chart['yAxis'], scale: { domain: [number, number] }): AxisEditContext => ({
    min: axis.min,
    max: axis.max,
    majorInterval: axis.majorInterval,
    domain: scale.domain,
  });
  const yCtx = axisCtx(chart.yAxis, model.y);
  const yAuto = (scale: { ticks: number[] }) => (scale.ticks.length > 1 ? scale.ticks[1] - scale.ticks[0] : 1);
  const leftName = dual ? 'Left Y' : 'Y';
  const errorOff = describeSummaryControls({ showErrorBars: st.showErrorBars, centre: spec.centre, spread: spec.spread }).errorOff;
  const titles = centreTitles(spec.centre, chart.type);
  const fillUi = describeBarFillUi(st);
  const isPattern = fillUi.mode === 'pattern';
  const widthName = widthLabel(st.barPattern);

  return (
    <aside className="inspector" aria-label="Graph formatting">
      <TabBar tabs={TABS} value={tab} onChange={setTab} />

      {/* ------------------------------------------------ Appearance */}
      {tab === 'appearance' && (
        <div>
          <SectionBar sections={SECTIONS} value={section} onChange={setSection} />
          {section === 'style' && (
        <div className="tab-body">
          <div className="dataset-row">
            <span className="dataset-label">Data set:</span>
            <select
              className="dataset-select"
              value={scope}
              onChange={(e) => setSelection(e.target.value === 'all' ? { kind: 'chart' } : { kind: 'group', groupId: e.target.value })}
            >
              <option value="all">Global (all data sets)</option>
              {table.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {table.name}:{displayName(chart, g.id, g.name)}
                  {dual ? AXIS_TAG[bindingOf(resolveStyle(chart, layer, g))] : ''}
                </option>
              ))}
            </select>
            <button title="Previous data set" aria-label="Previous data set" onClick={() => stepGroup(-1)} disabled={table.groups.length === 0}>
              &lt;
            </button>
            <button title="Next data set" aria-label="Next data set" onClick={() => stepGroup(1)} disabled={table.groups.length === 0}>
              &gt;
            </button>
          </div>

          <GroupBox title="Style">
            <Field label="Appearance">
              <SelectInput<ChartType>
                value={chart.type}
                options={[
                  { value: 'bar', label: 'Bar chart' },
                  { value: 'scatter', label: 'Scatter dot plot' },
                  { value: 'mean', label: 'Mean with error bars' },
                ]}
                onChange={(t) => run('Change graph type', setChartType(chart.id, t))}
              />
            </Field>
            <Field label="Color palette" hint="Gives the data sets coordinated colours in order. Per-data-set and all-bar colours below still apply on top.">
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

          <GroupBox title="Summary">
            <LineAtField centre={spec.centre} overridden={ovSum('centre')} onChange={setCentre} />
            <div className="muted small">{summaryCaption(spec, st.showErrorBars)}</div>
            {scopeGroup && centreNoticeLines(scopeGroup.stats).map((line) => (
              <div key={line} className="muted small">{line}</div>
            ))}
          </GroupBox>

          <GroupBox title="Bars" checked={st.showBars} onCheckedChange={(v) => setStyle({ showBars: v })} overridden={ov('showBars')}>
            {isPattern ? (
              <Field label="Background" overridden={ov('barPatternBackground')} note={fillRowNote(st)}>
                <ColorInput
                  value={backgroundDisplay(st)}
                  disabled={!fillUi.patternControlsEnabled || st.barPatternBackground === null}
                  ariaLabel="Pattern background color"
                  onChange={(v) => setStyle({ barPatternBackground: v })}
                />
                <label className="auto-check">
                  <Check
                    checked={st.barPatternBackground === null}
                    disabled={!fillUi.patternControlsEnabled}
                    ariaLabel="No pattern background"
                    onChange={(v) => setStyle(backgroundNonePatch(v))}
                  />
                  None
                </label>
              </Field>
            ) : (
              <Field label="Fill" overridden={ov('barFill')} note={fillRowNote(st)}>
                <ColorInput value={st.barFill} disabled={!fillUi.solidColorEnabled} ariaLabel="Bar fill color" onChange={(v) => setStyle({ barFill: v })} />
              </Field>
            )}
            <Field label="Fill pattern" overridden={ov('barFillMode')}>
              <Check
                checked={isPattern}
                disabled={!st.showBars}
                ariaLabel="Fill bars with a pattern"
                onChange={(v) => setStyle(togglePatternPatch(v))}
              />
              <SelectInput
                value={st.barPattern}
                disabled={!fillUi.patternControlsEnabled}
                options={[...FILL_PATTERN_OPTIONS]}
                onChange={(v) => setStyle({ barPattern: v })}
              />
            </Field>
            <Field label="Pattern color" overridden={ov('barPatternColor')}>
              <ColorInput
                value={patternColorDisplay(st)}
                disabled={!fillUi.patternControlsEnabled || followsBorder(st)}
                ariaLabel="Pattern color"
                onChange={(v) => setStyle({ barPatternColor: v })}
              />
              <label className="auto-check">
                <Check
                  checked={followsBorder(st)}
                  disabled={!fillUi.patternControlsEnabled}
                  ariaLabel="Pattern color follows the border color"
                  onChange={(v) => setStyle(followBorderPatch(v, st.barBorderColor))}
                />
                = border
              </label>
            </Field>
            <NumField
              label="Spacing"
              unit="pt"
              value={st.barPatternSpacingPt}
              disabled={!fillUi.patternControlsEnabled}
              overridden={ov('barPatternSpacingPt')}
              hint="Distance between marks (P limit 1 to 50 pt)"
              note={fillUi.spacingError}
              validate={(v) => spacingError(v, st.barPatternWidthPt)}
              onCommit={(v) => setStyle({ barPatternSpacingPt: v })}
            />
            <NumField
              label={widthName}
              unit="pt"
              value={st.barPatternWidthPt}
              disabled={!fillUi.patternControlsEnabled}
              overridden={ov('barPatternWidthPt')}
              hint={`${widthName} (P limit 0.1 to 5 pt)`}
              note={fillUi.widthError}
              validate={(v) => widthError(v, st.barPatternSpacingPt, st.barPattern)}
              onCommit={(v) => setStyle({ barPatternWidthPt: v })}
            />
            <NumField label="Opacity" value={st.barOpacity} min={0} max={1} disabled={!st.showBars} overridden={ov('barOpacity')} onCommit={(v) => setStyle({ barOpacity: v })} hint="0 = transparent, 1 = opaque" note={opacityNote(st)} />
            <NumField label="Border" unit="pt" value={st.barBorderWidthPt} min={0} max={20} disabled={!st.showBars} overridden={ov('barBorderWidthPt')} onCommit={(v) => setStyle({ barBorderWidthPt: v })} />
            <Field label="Border color" overridden={ov('barBorderColor')}>
              <ColorInput value={st.barBorderColor} disabled={!st.showBars} onChange={(v) => setStyle({ barBorderColor: v })} />
            </Field>
          </GroupBox>

          <GroupBox
            title={titles.symbols}
            checked={st.showSymbols}
            onCheckedChange={(v) => setStyle({ showSymbols: v })}
            overridden={ov('showSymbols')}
          >
            <Field label="Color" overridden={ov('symbolColor')}>
              <ColorInput value={st.symbolColor} disabled={!st.showSymbols} onChange={(v) => setStyle({ symbolColor: v })} />
            </Field>
            <Field label="Shape" overridden={ov('symbolShape')}>
              <SelectInput value={st.symbolShape} disabled={!st.showSymbols} options={[...shapeOptions]} onChange={(v) => setStyle({ symbolShape: v })} />
            </Field>
            <NumField label="Size" unit="pt" value={st.symbolSizePt} min={1} max={40} disabled={!st.showSymbols} overridden={ov('symbolSizePt')} onCommit={(v) => setStyle({ symbolSizePt: v })} />
            <Field label="Border color" overridden={ov('symbolBorderColor')}>
              <ColorInput value={st.symbolBorderColor} disabled={!st.showSymbols} onChange={(v) => setStyle({ symbolBorderColor: v })} />
            </Field>
            <NumField label="Border thickness" unit="pt" value={st.symbolBorderWidthPt} min={0} max={10} disabled={!st.showSymbols} overridden={ov('symbolBorderWidthPt')} onCommit={(v) => setStyle({ symbolBorderWidthPt: v })} />
            {chart.type !== 'mean' && (
              <>
                <Field label="Horizontal jitter" note={st.showSymbols ? null : 'Jitter moves symbols. Turn on symbols to use it.'}>
                  <Check checked={chart.jitter.enabled} disabled={!st.showSymbols} onChange={(v) => run('Jitter', patchJitter(chart.id, { enabled: v }))} />
                </Field>
                <NumField label="Jitter width" value={chart.jitter.widthFraction} min={0} max={1} disabled={!st.showSymbols || !chart.jitter.enabled} hint="Fraction of the group slot; deterministic, never moves values vertically" onCommit={(v) => run('Jitter width', patchJitter(chart.id, { widthFraction: v }), 'jitter:w')} />
              </>
            )}
          </GroupBox>

          <GroupBox title="Error bars" checked={st.showErrorBars} onCheckedChange={(v) => setStyle({ showErrorBars: v })} overridden={ov('showErrorBars')}>
            <IntervalFields
              centre={spec.centre}
              spread={spec.spread}
              confidenceLevel={spec.confidenceLevel}
              showErrorBars={st.showErrorBars}
              spreadOverridden={ovSum('spread')}
              levelOverridden={ovSum('confidenceLevel')}
              captionLines={intervalCaptionLines({
                spec,
                stats: scopeGroup ? scopeGroup.stats : null,
                showErrorBars: st.showErrorBars,
                fmt: tooltipFmt,
                clippedMessage: clippedEndpointMessage(clippedEnds),
              })}
              onSpread={(spread) => setSummary({ spread }, 'Change error bar shows')}
              onLevel={(confidenceLevel) => setSummary({ confidenceLevel }, 'Change confidence level')}
            />
            <Field label="Color" overridden={ov('errorColor')}>
              <ColorInput value={st.errorColor} disabled={errorOff} onChange={(v) => setStyle({ errorColor: v })} />
            </Field>
            <Field label="Cap style" overridden={ov('errorCap')}>
              <SelectInput
                value={st.errorCap}
                disabled={errorOff}
                options={[
                  { value: 'bar', label: 'Bar' },
                  { value: 'none', label: 'None' },
                ]}
                onChange={(v) => setStyle({ errorCap: v })}
              />
            </Field>
            <NumField label="Cap width" unit="pt" value={st.errorCapWidthPt} min={0} max={60} disabled={errorOff || st.errorCap === 'none'} overridden={ov('errorCapWidthPt')} onCommit={(v) => setStyle({ errorCapWidthPt: v })} />
            <Field label="Dir." overridden={ov('errorDirection')} hint={DIRECTION_HINT}>
              <SelectInput
                value={st.errorDirection}
                disabled={errorOff}
                options={[
                  { value: 'both', label: 'Both' },
                  { value: 'positive', label: 'Above' },
                  { value: 'negative', label: 'Below' },
                ]}
                onChange={(v) => setStyle({ errorDirection: v })}
              />
            </Field>
            <NumField label="Thickness" unit="pt" value={st.errorLineWidthPt} min={0.1} max={20} disabled={errorOff} overridden={ov('errorLineWidthPt')} onCommit={(v) => setStyle({ errorLineWidthPt: v })} />
          </GroupBox>

          <CalculationOptions
            smallSamplePolicy={spec.smallSamplePolicy}
            invalidPolicy={spec.invalidPolicy}
            smallOverridden={ovSum('smallSamplePolicy')}
            invalidOverridden={ovSum('invalidPolicy')}
            onChange={(patch) => setSummary(patch, 'Change calculation option')}
          />

          {chart.type === 'mean' && (
            <GroupBox title="Lines" checked={st.showLines} onCheckedChange={(v) => setStyle({ showLines: v })} overridden={ov('showLines')}>
              <Field label="Color" overridden={ov('lineColor')}>
                <ColorInput value={st.lineColor} disabled={!st.showLines} onChange={(v) => setStyle({ lineColor: v })} />
              </Field>
              <NumField label="Thickness" unit="pt" value={st.lineWidthPt} min={0.1} max={20} disabled={!st.showLines} overridden={ov('lineWidthPt')} onCommit={(v) => setStyle({ lineWidthPt: v })} />
            </GroupBox>
          )}
          {chart.type === 'scatter' && (
            <GroupBox title={titles.lines} checked={st.showMeanLine} onCheckedChange={(v) => setStyle({ showMeanLine: v })} overridden={ov('showMeanLine')}>
              <Field label="Color" overridden={ov('lineColor')}>
                <ColorInput value={st.lineColor} disabled={!st.showMeanLine} onChange={(v) => setStyle({ lineColor: v })} />
              </Field>
              <NumField label="Thickness" unit="pt" value={st.lineWidthPt} min={0.1} max={20} disabled={!st.showMeanLine} overridden={ov('lineWidthPt')} onCommit={(v) => setStyle({ lineWidthPt: v })} />
            </GroupBox>
          )}

          <GroupBox title="Additional options">
            {bindingUi.offered && (
              <Field
                label="Plot data on"
                hint="Which Y axis this data set is drawn against"
                overridden={ov('axisBinding')}
                note={mixedBinding ? 'Data sets use different axes. Choose Left or Right to set all of them.' : null}
              >
                <select
                  value={mixedBinding ? 'mixed' : bindingUi.value}
                  disabled={table.groups.length === 0}
                  aria-label="Plot data on"
                  onChange={(e) => setBinding(e.target.value as AxisBinding)}
                >
                  {mixedBinding && <option value="mixed" disabled>Mixed</option>}
                  {bindingUi.options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Show legend">
              <Check checked={chart.legend.visible} onChange={(v) => run('Show legend', patchLegend(chart.id, { visible: v }))} />
            </Field>
            <PointLabelControls type={chart.type} style={st} labels={model.labels} overridden={ov} onChange={setStyle} />
          </GroupBox>

          {selectedGroup && sel.pointId && (
            <SelectedPointBox
              type={chart.type}
              style={resolveStyle(chart, layer, selectedGroup, sel.pointId)}
              overrides={layer.objectOverrides[sel.pointId] ?? {}}
              rowTitle={sel.rowTitle}
              pointId={sel.pointId}
              labels={model.labels}
              seed={{
                point: scopeGroup?.points.find((p) => p.id === sel.pointId) ?? null,
                box: model.labels.items.find((it) => it.id === sel.pointId)?.box ?? null,
              }}
              onEdit={editPoint(sel.pointId)}
              onReset={() => run('Reset point label', clearPointStyle(chart.id, sel.pointId as Id))}
            />
          )}
        </div>
          )}

          {section === 'axes' && (
            <div>
              <Section title="X axis">
                <Field label="Show X axis">
                  <Check checked={chart.xAxis.visible} onChange={(v) => run('Show X axis', patchAxis(chart.id, 'xAxis', { visible: v }))} />
                </Field>
                <div className="muted small">The X axis lists the data sets, so it has no numeric limits to set.</div>
              </Section>
              <Section title={dual ? 'Left Y axis' : 'Y axis'}>
                <Field label={`Show ${leftName} axis`}>
                  <Check checked={chart.yAxis.visible} onChange={(v) => run('Show Y axis', patchAxis(chart.id, 'yAxis', { visible: v }))} />
                </Field>
              <Field label="Range" hint="Auto fits the axis to the data; Manual uses the limits below">
                <SelectInput<'auto' | 'manual'>
                  value={chart.yAxis.min === null && chart.yAxis.max === null ? 'auto' : 'manual'}
                  options={[
                    { value: 'auto', label: 'Auto' },
                    { value: 'manual', label: 'Manual' },
                  ]}
                  onChange={(v) =>
                    run('Y range', patchAxis(chart.id, 'yAxis', v === 'auto' ? { min: null, max: null } : { min: chart.yAxis.min ?? model.y.domain[0], max: chart.yAxis.max ?? model.y.domain[1] }))
                  }
                />
              </Field>
                <OptionalNumField
                  label={`${leftName} minimum`}
                  value={chart.yAxis.min}
                  autoValue={model.y.domain[0]}
                  validate={(v) => validateAxisMin(v, yCtx)}
                  onCommit={(v) => run('Y minimum', patchAxis(chart.id, 'yAxis', { min: v }), 'axis:ymin')}
                />
                <OptionalNumField
                  label={`${leftName} maximum`}
                  value={chart.yAxis.max}
                  autoValue={model.y.domain[1]}
                  validate={(v) => validateAxisMax(v, yCtx)}
                  onCommit={(v) => run('Y maximum', patchAxis(chart.id, 'yAxis', { max: v }), 'axis:ymax')}
                />
                <OptionalNumField
                  label={dual ? 'Left major tick interval' : 'Major tick interval'}
                  value={chart.yAxis.majorInterval}
                  autoValue={yAuto(model.y)}
                  validate={(v) => validateAxisInterval(v, yCtx)}
                  onCommit={(v) => run('Major tick interval', patchAxis(chart.id, 'yAxis', { majorInterval: v }), 'axis:yint')}
                />
                <Field label={dual ? 'Left major gridlines' : 'Major gridlines'}>
                  <Check checked={chart.yAxis.showGrid} onChange={(v) => run('Gridlines', patchAxis(chart.id, 'yAxis', { showGrid: v }))} />
                </Field>
              </Section>
              <Section title="Axis lines">
                <NumField label="Axis line thickness" unit="pt" value={chart.yAxis.lineWidthPt} min={0} max={10} onCommit={(v) => run('Axis line thickness', patchBothAxes(chart.id, { lineWidthPt: v }), 'axis:lw')} />
                {dual && <div className="muted small">Line thickness applies to both Y axes.</div>}
              </Section>
          {dual && model.y2 && (
            <Section title="Right Y axis">
              <Field label="Range" hint="Auto fits the axis to the data; Manual uses the limits below">
                <SelectInput<'auto' | 'manual'>
                  value={chart.y2Axis.min === null && chart.y2Axis.max === null ? 'auto' : 'manual'}
                  options={[
                    { value: 'auto', label: 'Auto' },
                    { value: 'manual', label: 'Manual' },
                  ]}
                  onChange={(v) =>
                    run('Right Y range', patchAxis(chart.id, 'y2Axis', v === 'auto' ? { min: null, max: null } : { min: chart.y2Axis.min ?? model.y2!.domain[0], max: chart.y2Axis.max ?? model.y2!.domain[1] }))
                  }
                />
              </Field>
              <Field label="Right Y axis title">
                <TextInput value={chart.y2Axis.title} onChange={(v) => run('Right Y axis title', patchAxis(chart.id, 'y2Axis', { title: v }), 'axis:y2t')} />
              </Field>
              <OptionalNumField
                label="Right Y minimum"
                value={chart.y2Axis.min}
                autoValue={model.y2.domain[0]}
                validate={(v) => validateAxisMin(v, axisCtx(chart.y2Axis, model.y2!))}
                onCommit={(v) => run('Right Y minimum', patchAxis(chart.id, 'y2Axis', { min: v }), 'axis:y2min')}
              />
              <OptionalNumField
                label="Right Y maximum"
                value={chart.y2Axis.max}
                autoValue={model.y2.domain[1]}
                validate={(v) => validateAxisMax(v, axisCtx(chart.y2Axis, model.y2!))}
                onCommit={(v) => run('Right Y maximum', patchAxis(chart.id, 'y2Axis', { max: v }), 'axis:y2max')}
              />
              <OptionalNumField
                label="Right major tick interval"
                value={chart.y2Axis.majorInterval}
                autoValue={yAuto(model.y2)}
                validate={(v) => validateAxisInterval(v, axisCtx(chart.y2Axis, model.y2!))}
                onCommit={(v) => run('Right major tick interval', patchAxis(chart.id, 'y2Axis', { majorInterval: v }), 'axis:y2int')}
              />
              <Field label="Show Right Y axis">
                <Check checked={chart.y2Axis.visible} onChange={(v) => run('Show right Y axis', patchAxis(chart.id, 'y2Axis', { visible: v }))} />
              </Field>
              <Field
                label="Right major gridlines"
                note={chart.yAxis.showGrid ? 'Drawn dashed to tell them apart from the left gridlines.' : null}
              >
                <Check checked={chart.y2Axis.showGrid} onChange={(v) => run('Right gridlines', patchAxis(chart.id, 'y2Axis', { showGrid: v }))} />
              </Field>
            </Section>
          )}

            </div>
          )}

          {section === 'text' && (
            <div>
              <Section title="Titles">
                <Field label="Show chart title">
                  <Check checked={chart.showTitle} onChange={(v) => setChart('Show chart title', { showTitle: v })} />
                </Field>
                <Field label="Chart title">
                  <TextInput value={chart.title} disabled={!chart.showTitle} onChange={(v) => setChart('Chart title', { title: v }, 'chart:title')} />
                </Field>
                <NumField label="Title size" unit="pt" value={chart.titleFontSizePt} min={4} max={72} disabled={!chart.showTitle} onCommit={(v) => setChart('Title size', { titleFontSizePt: v }, 'chart:titlesize')} />
                <Field label="X axis title">
                  <TextInput value={chart.xAxis.title} onChange={(v) => run('X axis title', patchAxis(chart.id, 'xAxis', { title: v }), 'axis:xt')} />
                </Field>
                <Field label={`${leftName} axis title`}>
                  <TextInput value={chart.yAxis.title} onChange={(v) => run('Y axis title', patchAxis(chart.id, 'yAxis', { title: v }), 'axis:yt')} />
                </Field>
              </Section>
              <Section title="Font sizes">
                <NumField label="Tick label size" unit="pt" value={chart.yAxis.tickFontSizePt} min={4} max={48} onCommit={(v) => run('Tick label size', patchBothAxes(chart.id, { tickFontSizePt: v }), 'axis:tfs')} />
                <NumField label="Axis title size" unit="pt" value={chart.yAxis.titleFontSizePt} min={4} max={48} onCommit={(v) => run('Axis title size', patchBothAxes(chart.id, { titleFontSizePt: v }), 'axis:afs')} />
                {dual && <div className="muted small">Font sizes apply to both Y axes.</div>}
              </Section>
              <Section title="Display names">
            {table.groups.map((g) => (
              <Field key={g.id} label={g.name}>
                <TextInput
                  value={chart.displayNames[g.id] ?? ''}
                  placeholder={g.name}
                  onChange={(v) => run('Display name', setDisplayName(chart.id, g.id, v), `dn:${g.id}`)}
                />
              </Field>
            ))}
            <div className="muted small">Display names are used by the legend and category labels. Empty = data name.</div>
              </Section>
            </div>
          )}

          {section === 'dimensions' && (
            <div className="tab-body">
              <Field label="Shape" hint="Free keeps width and height independent; 4:3 and Square move one when you change the other">
                <span className="switch-group" role="group" aria-label="Chart shape">
                  {(
                    [
                      ['free', 'Free'],
                      ['4:3', '4:3'],
                      ['1:1', 'Square'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      className={`switch${chart.aspect === value ? ' on' : ''}`}
                      aria-pressed={chart.aspect === value}
                      onClick={() => setChart(`Chart shape ${label}`, { aspect: value, ...applyAspect(chart, value) })}
                    >
                      {label}
                    </button>
                  ))}
                </span>
              </Field>
              <NumField label="Chart width" unit="px" value={chart.widthPx} min={CHART_PX_MIN} max={CHART_PX_MAX} onCommit={(v) => setChart('Chart width', resizeChart(chart, chart.aspect, 'width', v), 'chart:w')} />
              <NumField label="Chart height" unit="px" value={chart.heightPx} min={CHART_PX_MIN} max={CHART_PX_MAX} onCommit={(v) => setChart('Chart height', resizeChart(chart, chart.aspect, 'height', v), 'chart:h')} />
              <div className="muted small">Sizes are in pixels. The default for new charts is set in Settings.</div>
            </div>
          )}

          {section === 'legend' && (
            <div>
              <Section title="Legend">
            <Field label="Show legend">
              <Check checked={chart.legend.visible} onChange={(v) => run('Show legend', patchLegend(chart.id, { visible: v }))} />
            </Field>
            <Field label="Position">
              <SelectInput
                value={chart.legend.position}
                disabled={!chart.legend.visible}
                options={[
                  { value: 'right', label: 'Right' },
                  { value: 'bottom', label: 'Bottom' },
                  { value: 'top', label: 'Top' },
                ]}
                onChange={(v) => run('Legend position', patchLegend(chart.id, { position: v }))}
              />
            </Field>
            <SubHeading>Data sets in legend</SubHeading>
            {table.groups.map((g) => (
              <Field key={g.id} label={displayName(chart, g.id, g.name)}>
                <Check
                  checked={!chart.legend.hiddenGroupIds.includes(g.id)}
                  disabled={!chart.legend.visible}
                  ariaLabel={`Show ${displayName(chart, g.id, g.name)} in legend`}
                  onChange={(v) => run('Legend item', setLegendItemVisible(chart.id, g.id, v))}
                />
              </Field>
            ))}
              </Section>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------ Data sets */}
      {tab === 'datasets' && (
        <div className="tab-body">
          <SubHeading>On this graph</SubHeading>
          {tablesWithSources.map(([tableId, tableName, sources]) => (
            <div key={tableId} className="source-table">
              <div className="source-table-head">
                <strong>{tableName}</strong>
                {tableId === chart.dataTableId && <span className="muted small"> (graph's table)</span>}
                <span className="source-actions">
                  <button className="small-btn" onClick={() => setManyOnGraph(sources, true)}>All on</button>
                  <button className="small-btn" onClick={() => setManyOnGraph(sources, false)}>All off</button>
                </span>
              </div>
              {sources.map((s) => (
                <label key={s.group.id} className="source-row">
                  <input
                    type="checkbox"
                    checked={s.onGraph}
                    onChange={(e) => run(e.target.checked ? 'Show data set on graph' : 'Hide data set from graph', setGroupOnGraph(chart.id, s.tableId, s.group.id, e.target.checked))}
                  />
                  {s.group.name}
                </label>
              ))}
            </div>
          ))}
          {tablesWithSources.length < 2 && <div className="muted small">Add another data table to plot its data sets on this graph too.</div>}
          <SubHeading>Edit a data set</SubHeading>
          <div className="muted small">Select a group to edit its style, or click a bar, symbol or error bar in the chart.</div>
          <ul className="dataset-list">
            {model.groups.map((g) => (
              <li key={g.groupId}>
                <button
                  className={`list-item${selectedGroup?.id === g.groupId ? ' selected' : ''}`}
                  onClick={() => {
                    setSelection({ kind: 'group', groupId: g.groupId });
                    setTab('appearance');
                  }}
                >
                  <DatasetSwatchChip style={g.style} />
                  <span className="ds-name">{g.label}</span>
                  {dual && <span className="axis-chip" title="Plotted on this Y axis">{AXIS_SHORT[bindingOf(g.style)]}</span>}
                  <span className="muted small" title={describeCounts(g.stats, clippedEndpointCount(g.errorBar ? [g.errorBar] : []))}>
                    {datasetRowText(g.stats)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ------------------------------------------------ Annotations */}
      {tab === 'annotations' && (
        <div className="tab-body">
          <div className="button-row">
            <button
              onClick={() => {
                const id = newId('ann');
                run('Add annotation', addAnnotation(chart.id, { id, text: 'Text', xFrac: 0.4, yFrac: 0.08, fontSizePt: 14, color: '#000000' }));
                setSelection({ kind: 'annotation', annotationId: id });
              }}
            >
              + Add text annotation
            </button>
          </div>
          {chart.annotations.length === 0 && <div className="muted small">No annotations. Added text can be dragged within the chart.</div>}
          {chart.annotations.map((a) => {
            const isSel = selection.kind === 'annotation' && selection.annotationId === a.id;
            return (
              <div key={a.id} className={`annotation-card${isSel ? ' selected' : ''}`}>
                <button className="list-item" onClick={() => setSelection({ kind: 'annotation', annotationId: a.id })}>
                  {a.text.split('\n')[0] || '(empty)'}
                </button>
                {isSel && (
                  <>
                    <Field label="Text">
                      <textarea
                        rows={2}
                        value={a.text}
                        onChange={(e) => run('Edit annotation text', patchAnnotation(chart.id, a.id, { text: e.target.value }), `ann:${a.id}:text`)}
                      />
                    </Field>
                    <NumField label="Size" unit="pt" value={a.fontSizePt} min={4} max={96} onCommit={(v) => run('Annotation size', patchAnnotation(chart.id, a.id, { fontSizePt: v }), `ann:${a.id}:size`)} />
                    <Field label="Colour">
                      <ColorInput value={a.color} onChange={(v) => run('Annotation colour', patchAnnotation(chart.id, a.id, { color: v }), `ann:${a.id}:color`)} />
                    </Field>
                    <div className="button-row">
                      <button
                        onClick={() => {
                          run('Delete annotation', removeAnnotation(chart.id, a.id));
                          setSelection({ kind: 'chart' });
                        }}
                      >
                        Delete annotation
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
