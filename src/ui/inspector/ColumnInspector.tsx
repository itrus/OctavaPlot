import { useEffect, useMemo } from 'react';
import { useScopedEdits } from './common/useScopedEdits';
import { supportsHorizontal } from '../../model/graph/chartTypes';
import { FILL_PATTERN_OPTIONS, describeBarFillUi } from '../../model/graph/fill';
import { resolveStyle, dataLayer } from '../../model/graph/style';
import { pairLinesBySubject } from '../../model/graph/layers';
import { resolveSummary } from '../../model/graph/summary';
import type { AxisBinding, Chart, ChartStyle, DataTable, Id, SummarySpec } from '../../model/types';
import { AXIS_SHORT, AXIS_TAG, bindingOf, bindingSelectState } from '../../chart/shared/axes/axes';
import { clippedEndpointCount, clippedEndpointMessage } from '../../chart/shared/parts/errorGeometry';
import { buildColumnModel } from '../../chart/column/columnModel';
import { tooltipFmt } from '../../chart/tooltip';
import { centreChangeCompat, centreTitles, centreNoticeLines, describeCounts, describeSummaryControls, datasetRowText, intervalCaptionLines } from './common/summaryUi';
import { useCommands, useSelection } from '../../state/AppContext';
import {
  composeCommands,
  patchAxis,
  clearPointStyle,
  patchDistribution,
  patchLegend,
  patchPointStyle,
  patchStyle,
  patchLook,
} from '../../state/commands';
import { DistributionControls } from './sections/DistributionControls';
import { LayersSection } from './sections/LayersSection';
import { ColumnLayoutSection, DirectionSection, ErrorBarLookFields, FrameSection, LineLookFields, LineOrderSection, GridStyleSection, SymbolLookFields } from './sections/LookControls';
import { AxisLimits, TickFields } from './sections/AxisStyleControls';
import { DataSetOrder, DataSetPicker, DataSetReset } from './sections/DataSets';
import { AnnotationsTab, DimensionsSection, LegendSection, OnThisGraph, TextSections, ReferenceLinesSection } from './sections/SharedSections';
import { PaletteField } from './sections/PalettePicker';
import { annotationPlacer } from '../../chart/shared/scene/annotationPlace';
import { scopeGroupIds, selectedGroupIds, selectionOfGroups, type StyleScope, mixedPointStyleKeys } from '../../model/selection';
import { Check, ColorInput, Field, GroupBox, NumField, Section, SelectInput, SubHeading, TextInput } from './common/controls';
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
} from './common/fillRules';
import { InspectorShell } from './common/InspectorShell';
import { ExportPanel } from '../export/ExportPanel';
import { useInspectorNav, inspectorShapeOf } from './common/nav';
import { ChartTypePicker } from './sections/ChartTypePicker';
import { PointLabelControls, SelectedPointBox, SelectedPointsBox, type PointEdit } from './sections/PointLabelControls';
import { multiPointState, POINT_LABEL_KEYS, pointSelectionState } from './common/pointOverrideUi';
import { CalculationOptions,IntervalFields, LineAtField } from './sections/SummaryControls';
import { displayName } from '../../chart/shared/parts/names';
import { SLIDERS } from './common/sliderRanges';
import { DotPlacementControls } from './sections/DotPlacementControls';

/** The formatting panel of the charts over the columns of a table (bar, dots, mean, box, floating, paired, violin). */
function DatasetSwatchChip({ style }: { style: ChartStyle }) {
  const sw = datasetSwatch(style);
  return (
    <span
      className="swatch"
      title={sw.title ?? undefined}
      style={{ backgroundColor: sw.background, backgroundImage: sw.backgroundImage ?? undefined, borderColor: sw.borderColor }}
    />
  );
}

/** The value of the data set selector when several data sets are selected together. */
const SEVERAL = '__several__';


/** The centre the bars and dots are drawn at, and its calculation options, are on the Plot page; Analysis stays for the charts that have a distribution to set. */

export function ColumnInspector({ chart, table }: { chart: Chart; table: DataTable }) {
  const { selection, setSelection } = useSelection();
  const { run, setStatus } = useCommands();
  const nav = useInspectorNav(chart.id, inspectorShapeOf(chart.type).pages);
  const { shows } = nav;
  const layer = dataLayer(chart);

  // Selection scope: a selected data set or point edits that data set; anything else edits all groups.
  const sel = pointSelectionState(table, selection, chart.type);
  const selectedGroup = sel.groupId ? table.groups.find((g) => g.id === sel.groupId) : undefined;
  const allIds = useMemo(() => table.groups.map((g) => g.id), [table.groups]);
  // Several data sets selected together are edited together, and where they differ a field says so ("Mixed").
  // Several points are edited together too; their data sets are the scope of the style settings.
  const several = selection.kind === 'groups' || selection.kind === 'points' ? scopeGroupIds(selectedGroupIds(selection), allIds) : [];
  const scope: StyleScope = several.length > 1 ? several : selectedGroup ? selectedGroup.id : several.length === 1 ? several[0] : 'all';
  const scopeIds = scopeGroupIds(scope, allIds);
  // A data set of the selection that is gone (deleted) leaves the selection.
  useEffect(() => {
    if (selection.kind === 'groups' && several.length !== selection.groupIds.length) setSelection(selectionOfGroups(several));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [several.length, selection.kind]);
  // A selected point that no longer exists (deleted data set or row, or a chart type without points) steps back.
  const multi = multiPointState(table, selection, chart.type);
  const fallback = sel.fallback ?? multi.fallback;
  const fallbackKey = fallback ? JSON.stringify(fallback) : null;
  useEffect(() => {
    if (fallback) setSelection(fallback);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fallbackKey]);
  const sample = selectedGroup ?? table.groups.find((g) => g.id === several[0]) ?? table.groups[0];

  const st: ChartStyle = useMemo(() => {
    if (!sample) return chart.defaults;
    // "All groups" shows layer-level values; a group shows its own resolved values.
    const l = scope === 'all' ? { ...layer, groupOverrides: {}, objectOverrides: {} } : layer;
    return resolveStyle(chart, l, sample);
  }, [chart, layer, sample, scope]);

  // Summary settings: the layer value for Global, the resolved value for a data set.
  const spec: SummarySpec = !sample || scope === 'all' ? layer.summary : resolveSummary(layer, sample.id);
  // The data sets the edits reach (hidden ones are not drawn, so they do not count as differing).
  const inScope = table.groups.filter((g) => scopeIds.includes(g.id) && !chart.hiddenGroupIds.includes(g.id));
  const { ov, ovSum, setStyle, setSummary } = useScopedEdits(chart, layer, scope, scopeIds, inScope);
  const setCentre = (centre: SummarySpec['centre']) => {
    setSummary({ centre }, 'Change line at');
    // The stored spread is never rewritten; say so when it becomes inactive.
    const compat = centreChangeCompat(centre, spec.spread);
    if (compat.note) setStatus(compat.note);
  };

  const model = useMemo(() => buildColumnModel(chart, table), [chart, table]);
  const scopeGroup = typeof scope === 'string' && scope !== 'all' ? model.groups.find((g) => g.groupId === scope) ?? null : null;
  const clippedBars = (scope === 'all' ? model.groups : model.groups.filter((g) => scopeIds.includes(g.groupId))).flatMap((g) => (g.errorBar ? [g.errorBar] : []));
  const clippedEnds = clippedEndpointCount(clippedBars);

  const editPoint = (pointId: Id) => (label: string, edit: PointEdit, coalesceKey?: string) =>
    run(
      label,
      composeCommands(
        ...(edit.clear ? [clearPointStyle(chart.id, pointId, edit.clear)] : []),
        ...(edit.set ? [patchPointStyle(chart.id, pointId, edit.set)] : []),
      ),
      coalesceKey,
    );
  // Several points selected together: where their labels differ a field says "Mixed", and an edit reaches them all (one undo step).
  const multiStyles = multi.points.map((p) => resolveStyle(chart, layer, p.group, p.pointId));
  const multiMixed = mixedPointStyleKeys(chart, layer, multi.points);
  const multiOwn = new Set(POINT_LABEL_KEYS.filter((k) => multi.points.some((p) => layer.objectOverrides[p.pointId]?.[k] !== undefined)));
  const multiMode = (p: { pointId: Id }) => (layer.objectOverrides[p.pointId]?.showPointLabels === true ? 'show' : layer.objectOverrides[p.pointId]?.showPointLabels === false ? 'hide' : 'inherit');
  const editPoints = (label: string, edit: PointEdit, coalesceKey?: string) =>
    run(
      label,
      composeCommands(...multi.points.flatMap((p) => [...(edit.clear ? [clearPointStyle(chart.id, p.pointId, edit.clear)] : []), ...(edit.set ? [patchPointStyle(chart.id, p.pointId, edit.set)] : [])])),
      coalesceKey,
    );
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
  const inScopeBindings = model.groups.filter((g) => scopeIds.includes(g.groupId)).map((g) => bindingOf(g.style));
  const mixedBinding = inScopeBindings.some((b) => b !== inScopeBindings[0]);
  const setBinding = (axisBinding: AxisBinding) =>
    run(axisBinding === 'secondary' ? 'Plot data on right Y axis' : 'Plot data on left Y axis', patchStyle(chart.id, scope, { axisBinding }));
  const leftName = dual ? 'Left Y' : 'Y';
  const errorOff = describeSummaryControls({ showErrorBars: st.showErrorBars, centre: spec.centre, spread: spec.spread }).errorOff;
  const titles = centreTitles(spec.centre, chart.type);
  const isDist = chart.type === 'box' || chart.type === 'violin' || chart.type === 'floating';
  // The body of a column: a bar, a box or a violin.
  const bodyTitle = chart.type === 'box' ? 'Box' : chart.type === 'violin' ? 'Violin' : chart.type === 'floating' ? 'Floating bars' : 'Bars';
  const fillUi = describeBarFillUi(st);
  const isPattern = fillUi.mode === 'pattern';
  const widthName = widthLabel(st.barPattern);

  return (
    <InspectorShell nav={nav}>
          {(shows('style') || shows('analysis')) && (
        <div className="tab-body">
          <div className="dataset-row">
            <span className="dataset-label">Data set:</span>
            <select
              className="dataset-select"
              aria-label="Data set"
              value={Array.isArray(scope) ? SEVERAL : scope}
              onChange={(e) => e.target.value !== SEVERAL && setSelection(e.target.value === 'all' ? { kind: 'chart' } : { kind: 'group', groupId: e.target.value })}
            >
              <option value="all">Global (all data sets)</option>
              {Array.isArray(scope) && <option value={SEVERAL}>{scope.length} data sets together</option>}
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
            <DataSetReset chart={chart} table={table} scope={scope} run={run} />
          </div>
          <DataSetPicker sets={table.groups.map((g) => ({ id: g.id, label: displayName(chart, g.id, g.name) }))} selection={selection} setSelection={setSelection} />

          {shows('style') && (
            <>
          <GroupBox title="Style">
            <PaletteField chart={chart} hint="Gives the data sets coordinated colours in order. Per-data-set and all-bar colours below still apply on top." />
          </GroupBox>
          <LayersSection chart={chart} table={table} />
          <GroupBox title="Summary">
            <LineAtField centre={spec.centre} overridden={ovSum('centre')} onChange={setCentre} />
            {scopeGroup && centreNoticeLines(scopeGroup.stats).map((line) => (
              <div key={line} className="muted small">{line}</div>
            ))}
            {!isDist && (
              <CalculationOptions
                smallSamplePolicy={spec.smallSamplePolicy}
                invalidPolicy={spec.invalidPolicy}
                smallOverridden={ovSum('smallSamplePolicy')}
                invalidOverridden={ovSum('invalidPolicy')}
                onChange={(patch) => setSummary(patch, 'Change calculation option')}
              />
            )}
          </GroupBox>
            </>
          )}

          {shows('analysis') && isDist && <DistributionControls chart={chart} lineColor={st.lineColor} lineWidthPt={st.lineWidthPt} lineOpacity={st.lineOpacity} onLine={(patch) => setStyle(patch)} />}

          {shows('style') && (
          <>
          <GroupBox title={bodyTitle} checked={st.showBars} onCheckedChange={(v) => setStyle({ showBars: v })} overridden={ov('showBars')}>
            {isPattern ? (
              <Field label="Background" overridden={ov('barPatternBackground')} note={fillRowNote(st)}>
                <ColorInput
                  value={backgroundDisplay(st)}
                  disabled={!fillUi.patternControlsEnabled || st.barPatternBackground === null}
                  ariaLabel="Pattern background colour"
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
                <ColorInput value={st.barFill} disabled={!fillUi.solidColorEnabled} ariaLabel="Bar fill colour" onChange={(v) => setStyle({ barFill: v })} />
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
            <Field label="Pattern colour" overridden={ov('barPatternColor')}>
              <ColorInput
                value={patternColorDisplay(st)}
                disabled={!fillUi.patternControlsEnabled || followsBorder(st)}
                ariaLabel="Pattern colour"
                onChange={(v) => setStyle({ barPatternColor: v })}
              />
              <label className="auto-check">
                <Check
                  checked={followsBorder(st)}
                  disabled={!fillUi.patternControlsEnabled}
                  ariaLabel="Pattern colour follows the border colour"
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
              hint="Distance between marks (2 to 100 pt)"
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
              hint={`${widthName} (0.2 to 10 pt)`}
              note={fillUi.widthError}
              validate={(v) => widthError(v, st.barPatternSpacingPt, st.barPattern)}
              onCommit={(v) => setStyle({ barPatternWidthPt: v })}
            />
            <NumField {...SLIDERS.fraction} label="Opacity" value={st.barOpacity} min={0} max={1} disabled={!st.showBars} overridden={ov('barOpacity')} onCommit={(v) => setStyle({ barOpacity: v })} hint="0 = transparent, 1 = opaque" note={opacityNote(st)} />
            <NumField {...SLIDERS.line} label="Border" unit="pt" value={st.barBorderWidthPt} min={0} max={20} disabled={!st.showBars} overridden={ov('barBorderWidthPt')} onCommit={(v) => setStyle({ barBorderWidthPt: v })} />
            <NumField {...SLIDERS.fraction} label="Border opacity" value={st.barBorderOpacity} min={0} max={1} disabled={!st.showBars} overridden={ov('barBorderOpacity')} onCommit={(v) => setStyle({ barBorderOpacity: v })} hint="0 = transparent, 1 = opaque" />
            <Field label="Border colour" overridden={ov('barBorderColor')}>
              <ColorInput value={st.barBorderColor} disabled={!st.showBars} onChange={(v) => setStyle({ barBorderColor: v })} />
            </Field>
          </GroupBox>

          <GroupBox
            title={isDist ? 'Points' : titles.symbols}
            checked={st.showSymbols}
            onCheckedChange={(v) => {
              setStyle({ showSymbols: v });
              // Box plots, violins and floating bars draw only the values chosen in "Show values"; with None the box would switch on and show nothing.
              if (v && isDist && chart.distribution.points === 'none') run('Points on the plot', patchDistribution(chart.id, { points: 'all' }));
            }}
            overridden={ov('showSymbols')}
          >
            <SymbolLookFields st={st} ov={ov} setStyle={setStyle} disabled={!st.showSymbols} />
            {chart.type !== 'mean' && <DotPlacementControls chart={chart} disabled={!st.showSymbols} />}
          </GroupBox>

          {!isDist && (
          <>
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
            <ErrorBarLookFields st={st} ov={ov} setStyle={setStyle} disabled={errorOff} />
          </GroupBox>

          </>
          )}
          </>
          )}

          {shows('style') && (
          <>

          {(chart.type === 'mean' || chart.type === 'paired') && (
            <GroupBox title={chart.type === 'paired' ? 'Lines joining the rows' : 'Lines'} checked={st.showLines} onCheckedChange={(v) => setStyle({ showLines: v })} overridden={ov('showLines')}>
              {chart.type === 'paired' && (
                <Field label="Colour by" hint="Row: each row's line has a colour of the palette, after the colours of the data sets. One colour: every line has the colour below. Row needs a palette (not colours set by hand).">
                  <SelectInput<Chart['pairs']['lineColour']>
                    value={chart.pairs.lineColour}
                    disabled={!st.showLines}
                    options={[
                      { value: 'subject', label: 'Row' },
                      { value: 'one', label: 'One colour' },
                    ]}
                    onChange={(v) => run('Line colours', patchLook(chart.id, { pairs: { lineColour: v } }))}
                  />
                </Field>
              )}
              <LineLookFields st={st} ov={ov} setStyle={setStyle} disabled={!st.showLines} colourLocked={chart.type === 'paired' && pairLinesBySubject(chart)} />
              {chart.type === 'paired' && (
                <Field label="Join across a missing value" hint="A row with a missing value: join the values either side of it. Nothing is made up for the missing one.">
                  <Check checked={chart.pairs.bridge} disabled={!st.showLines} onChange={(v) => run('Join across missing values', patchLook(chart.id, { pairs: { bridge: v } }))} />
                </Field>
              )}
            </GroupBox>
          )}
          {(chart.type === 'scatter' || chart.type === 'paired') && (
            <GroupBox title={titles.lines} checked={st.showMeanLine} onCheckedChange={(v) => setStyle({ showMeanLine: v })} overridden={ov('showMeanLine')}>
              {chart.type === 'paired' ? (
                // The colour, thickness and opacity are the ones of the lines joining the rows (one setting); Layers gives this line a look of its own.
                <div className="field-note">Drawn with the colour, thickness and opacity of the lines joining the rows. Give it a look of its own under Layers.</div>
              ) : (
                <LineLookFields st={st} ov={ov} setStyle={setStyle} disabled={!st.showMeanLine} />
              )}
            </GroupBox>
          )}

          <GroupBox title="Additional options">
            {bindingUi.offered && chart.orientation === 'vertical' && (
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

          {multi.points.length > 1 && (
            <SelectedPointsBox
              type={chart.type}
              count={multi.points.length}
              style={multiStyles[0]}
              labelMode={multiMode(multi.points[0])}
              mixed={new Set(multi.points.some((p) => multiMode(p) !== multiMode(multi.points[0])) ? [...multiMixed, 'showPointLabels' as const] : multiMixed)}
              ownKeys={multiOwn}
              onEdit={editPoints}
              onReset={() => run('Reset point labels', composeCommands(...multi.points.map((p) => clearPointStyle(chart.id, p.pointId))))}
            />
          )}

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
          </>
          )}
        </div>
          )}

          {shows('axes') && (
            <div>
              <Section title="X axis">
                <Field label="Show X axis">
                  <Check checked={chart.xAxis.visible} onChange={(v) => run('Show X axis', patchAxis(chart.id, 'xAxis', { visible: v }))} />
                </Field>
                <TickFields chart={chart} which="xAxis" name="X" />
                <div className="muted small">The X axis lists the data sets, so it has no numeric limits to set.</div>
              </Section>
              <Section title={dual ? 'Left Y axis' : 'Y axis'}>
                <Field label={dual ? 'Show left Y axis' : 'Show Y axis'}>
                  <Check checked={chart.yAxis.visible} onChange={(v) => run('Show Y axis', patchAxis(chart.id, 'yAxis', { visible: v }))} />
                </Field>
                <AxisLimits chart={chart} which="yAxis" scale={model.y} name={leftName} />
              </Section>
          {dual && model.y2 && (
            <Section title="Right Y axis">
              <Field label="Right Y axis title">
                <TextInput value={chart.y2Axis.title} onChange={(v) => run('Right Y axis title', patchAxis(chart.id, 'y2Axis', { title: v }), 'axis:y2t')} />
              </Field>
              <Field label="Show right Y axis">
                <Check checked={chart.y2Axis.visible} onChange={(v) => run('Show right Y axis', patchAxis(chart.id, 'y2Axis', { visible: v }))} />
              </Field>
              <AxisLimits chart={chart} which="y2Axis" scale={model.y2} name="Right Y" />
              <div className="muted small">Reference lines, extra ticks and annotations placed at values are on the left Y axis.</div>
            </Section>
          )}
          <GridStyleSection chart={chart} />
              <ReferenceLinesSection chart={chart} />
            </div>
          )}

          {shows('type') && <ChartTypePicker chart={chart} table={table} />}
          {shows('text') && <TextSections chart={chart} groups={table.groups} yName={leftName} dual={dual} />}
          {shows('frame') && <FrameSection chart={chart} dual={dual} origin="y" />}
          {shows('layout') && (
            <div>
              <DimensionsSection chart={chart} />
              {supportsHorizontal(chart.type) && <DirectionSection chart={chart} />}
              <LineOrderSection chart={chart} />
              <ColumnLayoutSection chart={chart} spacing baseline={chart.type === 'bar'} />
            </div>
          )}
          {shows('legend') && <LegendSection chart={chart} groups={table.groups} />}
      {/* ------------------------------------------------ Data sets */}
      {shows('datasets') && (
        <div className="tab-body">
          <OnThisGraph chart={chart} />
          <DataSetOrder chart={chart} groups={model.groups.map((g) => ({ id: g.groupId, label: g.label }))} />
          <SubHeading>Edit a data set</SubHeading>
          <div className="muted small">Select a group to edit its style, or click a bar, symbol or error bar in the chart.</div>
          <ul className="dataset-list">
            {model.groups.map((g) => (
              <li key={g.groupId}>
                <button
                  className={`list-item${selectedGroup?.id === g.groupId ? ' selected' : ''}`}
                  onClick={() => {
                    setSelection({ kind: 'group', groupId: g.groupId });
                    nav.setPage('plot');
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
      {shows('annotations') && <AnnotationsTab chart={chart} placer={annotationPlacer({ family: 'column', model }, model.widthPt, model.heightPt)} />}
      {shows('export') && <ExportPanel chart={chart} table={table} />}
    </InspectorShell>
  );
}
