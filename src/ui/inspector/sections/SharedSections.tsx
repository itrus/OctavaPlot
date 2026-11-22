import { useEffect, useMemo } from 'react';
import { SIZE_PRESETS, applyAspect, presetOf, resizeChart } from '../../../model/graph/aspect';
import { graphSources, type GraphSource } from '../../../model/table/chartTable';
import { AXIS_LIMITS } from '../../../model/graph/axis';
import { FONT_FAMILIES } from '../../../model/graph/look';
import { CHART_PX_MAX, CHART_PX_MIN, chartTextLook, createAnnotation } from '../../../model/defaults';
import { AnnotationEditor } from './AnnotationEditor';
import { DrawingList } from './DrawingEditor';
import { focusWhenShown } from '../common/pendingFocus';
import { newId } from '../../../model/ids';
import { type AnnotationPlacer, nudgePatches } from '../../../chart/shared/scene/annotationPlace';
import { RESULT_STATS, resultValue } from '../../../model/graph/resultTokens';
import { mixedAnnotationKeys, selectedAnnotationIds, toggleAnnotationSelection } from '../../../model/graph/selection/multi';
import { capabilitiesOf } from '../../../model/graph/capabilities';
import type { Annotation, Chart, Group, Id, ResultStat } from '../../../model/types';
import { useCommands, useProject, useSelection } from '../../../state/AppContext';
import {
  addAnnotation,
  addReferenceLine,
  addRegion,
  composeCommands,
  patchAnnotation,
  patchAnnotations,
  patchAxis,
  patchBothAxes,
  patchChart,
  patchLegend,
  patchLook,
  patchReferenceLine,
  patchRegion,
  patchDrawings,
  removeAnnotation,
  removeDrawings,
  removeReferenceLine,
  removeRegion,
  setDisplayName,
  setGroupOnGraph,
  setLegendColumns,
  setLegendOffset,
  setLegendItemVisible,
} from '../../../state/commands';
import { LINE_STYLES } from '../../../model/graph/look';
import type { LineStyle } from '../../../model/types';
import { Check, ColorInput, Field, GroupBox, NumField, Section, SelectInput, SubHeading, TextInput } from '../common/controls';
import { BarLabelSection, hasBarLabels } from './LookControls';
import { LegendOrder } from './LegendOrder';
import { LEGEND_MAX_COLUMNS, LEGEND_MAX_OFFSET_PT, legendColumns, legendOffset } from '../../../model/graph/legendEntries';
import { displayName } from '../../../chart/shared/parts/names';
import { prepareChartInput } from '../../../model/table/preparedChart';
import { SLIDERS } from '../common/sliderRanges';

/**
 * Inspector pieces that do not depend on the kind of chart: titles and fonts, size and shape, legend, annotations and
 * the list of data sets on the graph. Both the category and the XY inspector use them.
 */

/** Edit a chart property as one undoable step (`key` merges rapid edits). */
function useChartSetter(chart: Chart) {
  const { run } = useCommands();
  return (label: string, patch: Partial<Chart>, key?: string) => run(label, patchChart(chart.id, patch), key);
}

export function TextSections({ chart, groups, yName, dual, axes = true }: { chart: Chart; groups: ReadonlyArray<Pick<Group, 'id' | 'name'>>; yName: string; dual: boolean; axes?: boolean }) {
  const { run } = useCommands();
  const setChart = useChartSetter(chart);
  return (
    <div>
      <Section title="Titles">
        <Field label="Show chart title">
          <Check checked={chart.showTitle} onChange={(v) => setChart('Show chart title', { showTitle: v })} />
        </Field>
        <Field label="Chart title">
          <TextInput value={chart.title} disabled={!chart.showTitle} onChange={(v) => setChart('Chart title', { title: v }, 'chart:title')} />
        </Field>
        <NumField {...SLIDERS.font} label="Title size" unit="pt" value={chart.titleFontSizePt} min={8} max={40} disabled={!chart.showTitle} onCommit={(v) => setChart('Title size', { titleFontSizePt: v }, 'chart:titlesize')} />
        {axes && (
          <>
        <Field label="X axis title">
          <TextInput value={chart.xAxis.title} onChange={(v) => run('X axis title', patchAxis(chart.id, 'xAxis', { title: v }), 'axis:xt')} />
        </Field>
        <Field label={`${yName} axis title`}>
          <TextInput value={chart.yAxis.title} onChange={(v) => run('Y axis title', patchAxis(chart.id, 'yAxis', { title: v }), 'axis:yt')} />
        </Field>
          </>
        )}
      </Section>
      {axes && (
      <Section title="Axis titles">
        <Field label={`Show X axis title`}>
          <Check checked={chart.xAxis.titleVisible} onChange={(v) => run('Show X axis title', patchAxis(chart.id, 'xAxis', { titleVisible: v }))} />
        </Field>
        <Field label={`Show ${yName} axis title`}>
          <Check checked={chart.yAxis.titleVisible} onChange={(v) => run('Show Y axis title', patchAxis(chart.id, 'yAxis', { titleVisible: v }))} />
        </Field>
        {dual && (
          <>
            <Field label="Show right Y axis title">
              <Check checked={chart.y2Axis.titleVisible} onChange={(v) => run('Show right Y axis title', patchAxis(chart.id, 'y2Axis', { titleVisible: v }))} />
            </Field>
          </>
        )}
      </Section>
      )}
      <Section title="Fonts">
        <Field label="Font">
          <SelectInput<string> value={chart.fontFamily} options={FONT_FAMILIES.map((f) => ({ value: f.value, label: f.label }))} onChange={(v) => run('Font', patchLook(chart.id, { fontFamily: v }))} />
        </Field>
        <Field label="Text colour">
          <ColorInput value={chart.textColor} ariaLabel="Text colour" onChange={(v) => run('Text colour', patchLook(chart.id, { textColor: v }))} />
        </Field>
        <NumField {...SLIDERS.font} label="Tick label size" unit="pt" value={chart.yAxis.tickFontSizePt} min={8} max={40} onCommit={(v) => run('Tick label size', patchBothAxes(chart.id, { tickFontSizePt: v }), 'axis:tf')} />
        <NumField {...SLIDERS.font} label="Axis title size" unit="pt" value={chart.yAxis.titleFontSizePt} min={8} max={40} onCommit={(v) => run('Axis title size', patchBothAxes(chart.id, { titleFontSizePt: v }), 'axis:ts')} />
        <Field label="Bold chart title">
          <Check checked={chart.titleBold} onChange={(v) => run('Bold chart title', patchLook(chart.id, { titleBold: v }))} />
        </Field>
        <Field label="Bold axis titles">
          <Check checked={chart.yAxis.titleBold} onChange={(v) => run('Bold axis titles', patchBothAxes(chart.id, { titleBold: v }))} />
        </Field>
        <Field label="Bold tick numbers">
          <Check checked={chart.yAxis.tickBold} onChange={(v) => run('Bold tick numbers', patchBothAxes(chart.id, { tickBold: v }))} />
        </Field>
        {dual && <div className="muted small">Sizes and weights apply to both Y axes.</div>}
      </Section>
      {axes && (
      <Section title="Distances" defaultOpen={false}>
        <NumField {...SLIDERS.distance} label="Chart title from the top" unit="pt" value={chart.titleOffsetPt} min={AXIS_LIMITS.offsetPt.min} max={AXIS_LIMITS.offsetPt.max} disabled={!chart.showTitle} onCommit={(v) => run('Title distance', patchLook(chart.id, { titleOffsetPt: v }), 'chart:titleoff')} />
        <NumField {...SLIDERS.distance} label="X title from the axis" unit="pt" value={chart.xAxis.titleOffsetPt} min={AXIS_LIMITS.offsetPt.min} max={AXIS_LIMITS.offsetPt.max} onCommit={(v) => run('X title distance', patchAxis(chart.id, 'xAxis', { titleOffsetPt: v }), 'axis:xto')} />
        <NumField {...SLIDERS.distance} label={`${yName} title from the axis`} unit="pt" value={chart.yAxis.titleOffsetPt} min={AXIS_LIMITS.offsetPt.min} max={AXIS_LIMITS.offsetPt.max} onCommit={(v) => run('Y title distance', patchAxis(chart.id, 'yAxis', { titleOffsetPt: v }), 'axis:yto')} />
        <NumField {...SLIDERS.distance} label="X numbers from the axis" unit="pt" value={chart.xAxis.tickLabelOffsetPt} min={AXIS_LIMITS.offsetPt.min} max={AXIS_LIMITS.offsetPt.max} onCommit={(v) => run('X numbers distance', patchAxis(chart.id, 'xAxis', { tickLabelOffsetPt: v }), 'axis:xno')} />
        <NumField {...SLIDERS.distance} label={`${yName} numbers from the axis`} unit="pt" value={chart.yAxis.tickLabelOffsetPt} min={AXIS_LIMITS.offsetPt.min} max={AXIS_LIMITS.offsetPt.max} onCommit={(v) => run('Y numbers distance', patchAxis(chart.id, 'yAxis', { tickLabelOffsetPt: v }), 'axis:yno')} />
        {dual && (
          <>
            <NumField {...SLIDERS.distance} label="Right Y title from the axis" unit="pt" value={chart.y2Axis.titleOffsetPt} min={AXIS_LIMITS.offsetPt.min} max={AXIS_LIMITS.offsetPt.max} onCommit={(v) => run('Right Y title distance', patchAxis(chart.id, 'y2Axis', { titleOffsetPt: v }), 'axis:y2to')} />
            <NumField {...SLIDERS.distance} label="Right Y numbers from the axis" unit="pt" value={chart.y2Axis.tickLabelOffsetPt} min={AXIS_LIMITS.offsetPt.min} max={AXIS_LIMITS.offsetPt.max} onCommit={(v) => run('Right Y numbers distance', patchAxis(chart.id, 'y2Axis', { tickLabelOffsetPt: v }), 'axis:y2no')} />
          </>
        )}
      </Section>
      )}
      <Section title="Display names">
        {groups.map((g) => (
          <Field key={g.id} label={g.name}>
            <TextInput value={chart.displayNames[g.id] ?? ''} placeholder={g.name} onChange={(v) => run('Display name', setDisplayName(chart.id, g.id, v), `dn:${g.id}`)} />
          </Field>
        ))}
        <div className="muted small">Display names are used by the legend and labels. Empty = data name.</div>
      </Section>
    </div>
  );
}

export function DimensionsSection({ chart }: { chart: Chart }) {
  const setChart = useChartSetter(chart);
  return (
    <GroupBox title="Size">
      <Field label="Shape" hint="Free keeps width and height independent; 4:3, 3:4 and Square move one when you change the other">
        <span className="switch-group" role="group" aria-label="Chart shape">
          {(
            [
              ['free', 'Free'],
              ['4:3', '4:3'],
              ['3:4', '3:4'],
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
      <Field label="Size preset" hint="Sets width, height and shape together">
        <SelectInput<string>
          value={presetOf(chart)?.id ?? 'custom'}
          options={[...(presetOf(chart) ? [] : [{ value: 'custom', label: 'Custom' }]), ...SIZE_PRESETS.map((p) => ({ value: p.id, label: p.label }))]}
          onChange={(v) => {
            const p = SIZE_PRESETS.find((s) => s.id === v);
            if (p) setChart(`Chart size ${p.label}`, { aspect: p.aspect, widthPx: p.widthPx, heightPx: p.heightPx });
          }}
        />
      </Field>
      <NumField label="Chart width" unit="px" value={chart.widthPx} min={CHART_PX_MIN} max={CHART_PX_MAX} onCommit={(v) => setChart('Chart width', resizeChart(chart, chart.aspect, 'width', v), 'chart:w')} />
      <NumField label="Chart height" unit="px" value={chart.heightPx} min={CHART_PX_MIN} max={CHART_PX_MAX} onCommit={(v) => setChart('Chart height', resizeChart(chart, chart.aspect, 'height', v), 'chart:h')} />
    </GroupBox>
  );
}

export function LegendSection({ chart, groups }: { chart: Chart; groups: ReadonlyArray<Pick<Group, 'id' | 'name'>> }) {
  const { run } = useCommands();
  return (
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
        <Field label="Key shape" hint="The colour key of bars: a wide rectangle or a square">
          <SelectInput<'rectangle' | 'square'>
            value={chart.legend.keyShape}
            disabled={!chart.legend.visible}
            options={[
              { value: 'rectangle', label: 'Rectangle' },
              { value: 'square', label: 'Square' },
            ]}
            onChange={(v) => run('Legend key shape', patchLegend(chart.id, { keyShape: v }))}
          />
        </Field>
        <NumField label="Columns" value={legendColumns(chart.legend)} min={1} max={LEGEND_MAX_COLUMNS} step={1} disabled={!chart.legend.visible} onCommit={(v) => run('Legend columns', setLegendColumns(chart.id, v))} hint="Entries in a row; 1 is one under the other" />
        <NumField {...SLIDERS.move} label="Move right" value={legendOffset(chart.legend).x} min={-LEGEND_MAX_OFFSET_PT} max={LEGEND_MAX_OFFSET_PT} step={1} unit="pt" disabled={!chart.legend.visible} onCommit={(v) => run('Move legend', setLegendOffset(chart.id, v, legendOffset(chart.legend).y))} hint="Shifts the legend from its place; negative moves it left" />
        <NumField {...SLIDERS.move} label="Move down" value={legendOffset(chart.legend).y} min={-LEGEND_MAX_OFFSET_PT} max={LEGEND_MAX_OFFSET_PT} step={1} unit="pt" disabled={!chart.legend.visible} onCommit={(v) => run('Move legend', setLegendOffset(chart.id, legendOffset(chart.legend).x, v))} hint="Negative moves it up" />
        <LegendOrder chart={chart} groups={groups} />
        <SubHeading>Data sets in legend</SubHeading>
        {groups.map((g) => (
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
  );
}

/** Lines at chosen values of the axes: a threshold, a target, a control level. */
/** What the text fields that can hold a result say about it. */
const RESULT_HINT = 'A result of a data set can be written in the text, as {{n Control}}, {{mean Control}} or {{sd Control|2}} (n, sum, mean, sd, sem, median, min, max; a number of decimals after a bar). It is filled when the graph is drawn, so it follows the data.';

/** Lines at values of the axes (a threshold, a target, a control level); they are set with the axes. */
export function ReferenceLinesSection({ chart }: { chart: Chart }) {
  const { run } = useCommands();
  const { project } = useProject();
  const lines = capabilitiesOf(chart.type).referenceLines;
  if (lines === 'none') return null;
  const table = prepareChartInput(project, chart)?.table;
  const groups = table?.groups ?? [];
  const hasX = lines === 'xy';
  // A line clicked on the graph is the one picked here, and is brought into view.
  const { selection } = useSelection();
  const picked = selection.kind === 'referenceLine' ? selection.lineId : null;
  useEffect(() => {
    if (picked) document.getElementById(`ref-card-${picked}`)?.scrollIntoView({ block: 'nearest' });
  }, [picked]);
  const oblique = capabilitiesOf(chart.type).guides;
  const add = (axis: 'x' | 'y') => run('Add reference line', addReferenceLine(chart.id, { id: newId('ref'), axis, value: 0, color: '#000000', widthPt: 4, style: 'dotted', opacity: 1, label: '', showLabel: true, labelAt: 'end', onTop: true }));
  // An oblique line: y = intercept + slope * x; the identity line is the one with slope 1 and intercept 0.
  const addOblique = (slope: number, intercept: number) => run('Add reference line', addReferenceLine(chart.id, { id: newId('ref'), axis: 'y', value: 0, slope, intercept, color: '#000000', widthPt: 4, style: 'dotted', opacity: 1, label: '', showLabel: false }));
  return (
    <Section title="Reference lines">
      <div className="button-row">
        <button onClick={() => add('y')}>+ Line at a Y value</button>
        {hasX && <button onClick={() => add('x')}>+ Line at an X value</button>}
      </div>
      {oblique && (
        <div className="button-row">
          <button onClick={() => addOblique(1, 0)} title="The line Y = X: where a value would lie if both axes agreed">+ Identity line</button>
          <button onClick={() => addOblique(1, 1)} title="A line Y = a + bX, with its own intercept a and slope b">+ Line Y = a + bX</button>
        </div>
      )}
      {chart.referenceLines.length === 0 && <div className="muted small">A reference line is drawn across the plot at a value of an axis. A value outside the axis range is not drawn, and a notice says so.</div>}
      {chart.referenceLines.map((l, i) => {
        const set = (label: string, patch: Parameters<typeof patchReferenceLine>[2], key?: string) => run(label, patchReferenceLine(chart.id, l.id, patch), key === undefined ? undefined : `ref:${l.id}:${key}`);
        return (
          <div key={l.id} id={`ref-card-${l.id}`} className={`annotation-card${picked === l.id ? ' selected' : ''}`}>
            {l.slope !== undefined ? (
              <>
                <NumField label={`Intercept a (line ${i + 1})`} value={l.intercept ?? 0} onCommit={(v) => set('Reference line intercept', { intercept: v }, 'intercept')} hint="The line is Y = a + bX" />
                <NumField label="Slope b" value={l.slope} onCommit={(v) => set('Reference line slope', { slope: v }, 'slope')} hint="1 with an intercept of 0 is the identity line; both axes need the same length for a unit (Axes: Equal units) for it to run at 45 degrees" />
              </>
            ) : l.valueFrom ? (
              <div className="field-note">
                Drawn at the {RESULT_STATS.find((s) => s.id === l.valueFrom?.stat)?.label} of {groups.find((g) => g.id === l.valueFrom?.groupId)?.name ?? 'a data set that is not on this graph'}
                {table && resultValue(table, l.valueFrom.groupId, l.valueFrom.stat) !== null ? `: ${resultValue(table, l.valueFrom.groupId, l.valueFrom.stat)}` : ' (not available)'}. It moves when the data change.
              </div>
            ) : (
              <NumField label={`${l.axis.toUpperCase()} value (line ${i + 1})`} value={l.value} onCommit={(v) => set('Reference line value', { value: v }, 'value')} />
            )}
            {groups.length > 0 && l.slope === undefined && (
              <Field label="Value from" hint="Bind the line to a result of a data set, so that it follows the data. Choosing Typed value keeps the line where it is.">
                <SelectInput<string> dropdown
                  value={l.valueFrom?.stat ?? 'typed'}
                  options={[{ value: 'typed', label: 'Typed value' }, ...RESULT_STATS.map((s) => ({ value: s.id, label: s.label }))]}
                  onChange={(v) => {
                    if (v === 'typed') {
                      const now = l.valueFrom && table ? resultValue(table, l.valueFrom.groupId, l.valueFrom.stat) : null;
                      set('Reference line value', { valueFrom: undefined, ...(now !== null ? { value: now } : {}) });
                    } else set('Bind reference line', { valueFrom: { stat: v as ResultStat, groupId: l.valueFrom?.groupId ?? groups[0].id } });
                  }}
                />
              </Field>
            )}
            {l.valueFrom && (
              <Field label="Of data set">
                <SelectInput<string> dropdown
                  value={l.valueFrom.groupId}
                  options={groups.some((g) => g.id === l.valueFrom?.groupId) ? groups.map((g) => ({ value: g.id, label: displayName(chart, g.id, g.name) })) : [...groups.map((g) => ({ value: g.id, label: displayName(chart, g.id, g.name) })), { value: l.valueFrom.groupId, label: '(not on this graph)' }]}
                  onChange={(v) => l.valueFrom && set('Bind reference line', { valueFrom: { stat: l.valueFrom.stat, groupId: v } })}
                />
              </Field>
            )}
            <Field label="Label" hint={RESULT_HINT}>
              <TextInput value={l.label} onChange={(v) => set('Reference line label', { label: v }, 'label')} />
            </Field>
            <Field label="Label" hint="Outside the plotting box: the end of the line is right of a horizontal line and above a vertical one; the beginning is left of it and below it. An oblique line has its label at its end, inside the plot.">
              <SelectInput<'none' | 'end' | 'start'>
                value={!l.showLabel ? 'none' : l.slope === undefined && l.labelAt === 'start' ? 'start' : 'end'}
                options={[{ value: 'none', label: 'No label' }, { value: 'end', label: 'End of the line' }, ...(l.slope === undefined ? [{ value: 'start' as const, label: 'Beginning of the line' }] : [])]}
                onChange={(v) => set('Reference line label', v === 'none' ? { showLabel: false } : { showLabel: true, labelAt: v })}
              />
            </Field>
            <Field label="In front of the data" hint="Draw the line over the bars, points and curves instead of behind them">
              <Check checked={l.onTop === true} onChange={(v) => set('Reference line in front', { onTop: v })} />
            </Field>
            <Field label="Colour">
              <ColorInput value={l.color} onChange={(v) => set('Reference line colour', { color: v }, 'color')} />
            </Field>
            <NumField {...SLIDERS.line} label="Thickness" unit="pt" value={l.widthPt} min={0.2} max={20} onCommit={(v) => set('Reference line thickness', { widthPt: v }, 'width')} />
            <NumField {...SLIDERS.fraction} label="Opacity" value={l.opacity} min={0} max={1} onCommit={(v) => set('Reference line opacity', { opacity: v }, 'opacity')} hint="0 = transparent, 1 = opaque" />
            <Field label="Pattern">
              <SelectInput<LineStyle> value={l.style} options={LINE_STYLES.map((o) => ({ value: o.value, label: o.label }))} onChange={(v) => set('Reference line pattern', { style: v })} />
            </Field>
            <div className="button-row">
              <button onClick={() => run('Delete reference line', removeReferenceLine(chart.id, l.id))}>Delete line</button>
            </div>
          </div>
        );
      })}
    </Section>
  );
}

/** Shaded regions: a band across the plot between two values of an axis (XY charts), behind the reference lines and the data. */
function RegionsSection({ chart }: { chart: Chart }) {
  const { run } = useCommands();
  if (!capabilitiesOf(chart.type).guides) return null;
  const add = (axis: 'x' | 'y') => run('Add shaded region', addRegion(chart.id, { id: newId('reg'), axis, from: 0, to: 1, color: '#4f81bd', opacity: 0.25, label: '', showLabel: false }));
  return (
    <Section title="Shaded regions">
      <div className="button-row">
        <button onClick={() => add('y')}>+ Band between two Y values</button>
        <button onClick={() => add('x')}>+ Band between two X values</button>
      </div>
      {chart.regions.length === 0 && <div className="muted small">A band is drawn across the plot between two values of an axis, behind the data (a normal range, a window of time). The part outside the axis range is cut off; a band with nothing left is not drawn, and a notice says so.</div>}
      {chart.regions.map((r, i) => {
        const set = (label: string, patch: Parameters<typeof patchRegion>[2], key?: string) => run(label, patchRegion(chart.id, r.id, patch), key === undefined ? undefined : `region:${r.id}:${key}`);
        const axisName = r.axis.toUpperCase();
        return (
          <div key={r.id} className="annotation-card selected">
            <NumField label={`${axisName} from (band ${i + 1})`} value={r.from} onCommit={(v) => set('Shaded region start', { from: v }, 'from')} />
            <NumField label={`${axisName} to`} value={r.to} onCommit={(v) => set('Shaded region end', { to: v }, 'to')} hint="The two values can be in either order" />
            <Field label="Label">
              <TextInput value={r.label} onChange={(v) => set('Shaded region label', { label: v }, 'label')} />
            </Field>
            <Field label="Show label">
              <Check checked={r.showLabel} onChange={(v) => set('Show shaded region label', { showLabel: v })} />
            </Field>
            <Field label="Colour">
              <ColorInput value={r.color} onChange={(v) => set('Shaded region colour', { color: v }, 'color')} />
            </Field>
            <NumField {...SLIDERS.fraction} label="Opacity" value={r.opacity} min={0} max={1} onCommit={(v) => set('Shaded region opacity', { opacity: v }, 'opacity')} hint="0 = transparent, 1 = opaque" />
            <div className="button-row">
              <button onClick={() => run('Delete shaded region', removeRegion(chart.id, r.id))}>Delete band</button>
            </div>
          </div>
        );
      })}
    </Section>
  );
}

/**
 * The annotations of a graph. `placer` (from the model of the graph) says where each one is drawn; with it a text can be anchored to
 * values on the axes instead of a place on the page. Without it (a graph with no model here) every text is placed on the page.
 */
export function AnnotationsTab({ chart, placer }: { chart: Chart; placer?: AnnotationPlacer }) {
  const { run } = useCommands();
  const { selection, setSelection } = useSelection();
  // Several annotations selected together are edited together, and where they differ a field says so ("Mixed").
  const picked = selectedAnnotationIds(selection);
  const chosen = chart.annotations.filter((a) => picked.includes(a.id));
  const mixed = mixedAnnotationKeys(chosen);
  const setAll = (label: string, patch: Partial<Annotation>, key: string) => run(label, patchAnnotations(chart.id, chosen.map((a) => a.id), patch), `ann:${chosen.map((a) => a.id).join()}:${key}`);
  return (
    <div className="tab-body">
      {hasBarLabels(chart.type) && <BarLabelSection chart={chart} />}
      <RegionsSection chart={chart} />
      <Section title="Shapes and lines">
        <DrawingList
          drawings={chart.drawings ?? []}
          picked={selection.kind === 'drawings' ? selection.drawingIds : []}
          onPick={(id, toggle) => {
            const was = selection.kind === 'drawings' ? selection.drawingIds : [];
            const next = toggle ? (was.includes(id) ? was.filter((x) => x !== id) : [...was, id]) : was.length === 1 && was[0] === id ? [] : [id];
            setSelection(next.length > 0 ? { kind: 'drawings', drawingIds: next } : { kind: 'chart' });
          }}
          onPatch={(ids, label, patch, key) => run(label, patchDrawings({ chartId: chart.id }, ids, patch), key)}
          onRemove={(ids) => {
            run(ids.length === 1 ? 'Delete shape' : 'Delete shapes', removeDrawings({ chartId: chart.id }, ids));
            setSelection({ kind: 'chart' });
          }}
          placer={placer}
          fontLabel={FONT_FAMILIES.find((f) => f.value === chart.fontFamily)?.label ?? 'the graph'}
        />
      </Section>
      <div className="button-row">
        <button
          onClick={() => {
            const added = createAnnotation(chartTextLook(chart), 0.4, 0.08);
            run('Add annotation', addAnnotation(chart.id, added));
            setSelection({ kind: 'annotation', annotationId: added.id });
            focusWhenShown(`annotation-text:${added.id}`);
          }}
        >
          + Add text annotation
        </button>
      </div>
      {chart.annotations.length === 0 && <div className="muted small">No annotations. Choose Text on the graph's toolbar and click the graph where the text should go, or use the button above; a text can be dragged within the chart.</div>}
      {chosen.length > 1 && (
        <GroupBox title={`Selected annotations (${chosen.length})`}>
          <div className="muted small">These annotations are edited together. Ctrl or Shift on an annotation, on the chart or in the list, takes it in or out; the arrow keys move them together.</div>
          <NumField {...SLIDERS.font} label="Size" unit="pt" value={chosen[0].fontSizePt} min={8} max={40} overridden={{ mixed: mixed.has('fontSizePt') }} onCommit={(v) => setAll('Annotation size', { fontSizePt: v }, 'size')} />
          <Field label="Colour" overridden={{ mixed: mixed.has('color') }}>
            <ColorInput value={chosen[0].color} onChange={(v) => setAll('Annotation colour', { color: v }, 'color')} />
          </Field>
          <NumField {...SLIDERS.fraction} label="Opacity" value={chosen[0].opacity} min={0} max={1} overridden={{ mixed: mixed.has('opacity') }} onCommit={(v) => setAll('Annotation opacity', { opacity: v }, 'opacity')} hint="0 = transparent, 1 = opaque" />
          <div className="button-row">
            <button
              onClick={() => {
                run('Delete annotations', composeCommands(...chosen.map((a) => removeAnnotation(chart.id, a.id))));
                setSelection({ kind: 'chart' });
              }}
            >
              Delete selected annotations
            </button>
          </div>
        </GroupBox>
      )}
      {chart.annotations.map((a) => {
        const isSel = picked.length === 1 && picked[0] === a.id;
        const inSel = picked.includes(a.id);
        return (
          <div
            key={a.id}
            className={`annotation-card${inSel ? ' selected' : ''}`}
            onKeyDown={(e) => {
              // Arrow keys nudge the selected annotations (1% of the chart, 0.1% with Alt, 5% with Shift); typing in a field is left alone.
              const t = e.target as HTMLElement;
              if (!inSel || t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || !e.key.startsWith('Arrow')) return;
              e.preventDefault();
              const step = e.shiftKey ? 0.05 : e.altKey ? 0.001 : 0.01;
              const dx = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0;
              const dy = e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0;
              // From where each text is drawn; a text anchored to data keeps its new values.
              const moves = nudgePatches(chosen, placer, dx, dy);
              run('Move annotation', composeCommands(...moves.map((m) => patchAnnotation(chart.id, m.id, m.patch))), `ann:${moves.map((m) => m.id).join()}:nudge`);
            }}
          >
            {/* The selected text has its name in the heading of its settings, so its row is not repeated above them. */}
            {!isSel && (
              <button className="list-item" onClick={(e) => setSelection(e.ctrlKey || e.metaKey || e.shiftKey ? toggleAnnotationSelection(selection, a.id, chart.annotations.map((x) => x.id)) : { kind: 'annotation', annotationId: a.id })}>
                {a.text.split('\n')[0] || '(empty)'}
              </button>
            )}
            {isSel && (
              <AnnotationEditor
                annotation={a}
                placer={placer}
                resultHint={RESULT_HINT}
                fontLabel={FONT_FAMILIES.find((f) => f.value === chart.fontFamily)?.label ?? 'the graph'}
                onPatch={(label, patch, key) => run(label, patchAnnotation(chart.id, a.id, patch), key)}
                onDelete={() => {
                  run('Delete annotation', removeAnnotation(chart.id, a.id));
                  setSelection({ kind: 'chart' });
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Check boxes to put data sets on the graph or take them off, grouped by table. */
export function OnThisGraph({ chart }: { chart: Chart }) {
  const { project } = useProject();
  const { run } = useCommands();
  const tablesWithSources = useMemo(() => {
    const byTable = new Map<Id, [Id, string, GraphSource[]]>();
    for (const s of graphSources(project, chart)) {
      if (!byTable.has(s.tableId)) byTable.set(s.tableId, [s.tableId, s.tableName, []]);
      byTable.get(s.tableId)![2].push(s);
    }
    return [...byTable.values()];
  }, [project, chart]);
  const setMany = (sources: GraphSource[], on: boolean) =>
    run(on ? 'Show all data sets' : 'Hide all data sets', composeCommands(...sources.map((s) => setGroupOnGraph(chart.id, s.tableId, s.group.id, on))));
  // Data sets of other tables can be added to column-table graphs only; an XY graph plots its own table's series.
  const ownKind = project.dataTables.find((x) => x.id === chart.dataTableId)?.kind;
  const multi = project.dataTables.some((t) => t.id !== chart.dataTableId && t.kind === ownKind);
  return (
    <>
      <SubHeading>On this graph</SubHeading>
      {tablesWithSources.map(([tableId, tableName, sources]) => (
        <div key={tableId} className="source-table">
          <div className="source-table-head">
            <strong>{tableName}</strong>
            {tableId === chart.dataTableId && <span className="muted small"> (graph's table)</span>}
            <span className="source-actions">
              <button className="small-btn" onClick={() => setMany(sources, true)}>All on</button>
              <button className="small-btn" onClick={() => setMany(sources, false)}>All off</button>
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
      {!multi && ownKind === 'column' && <div className="muted small">Add another column table to plot its data sets on this graph too.</div>}
    </>
  );
}
