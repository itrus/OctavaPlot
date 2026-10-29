import { useMemo, useState } from 'react';
import { SIZE_PRESETS, applyAspect, presetOf, resizeChart } from '../../../model/graph/aspect';
import { graphSources, type GraphSource } from '../../../model/table/chartTable';
import { AXIS_LIMITS } from '../../../model/graph/axis';
import { FONT_FAMILIES, PRINT_WIDTH_MM } from '../../../model/graph/look';
import { CHART_PX_MAX, CHART_PX_MIN } from '../../../model/defaults';
import { newId } from '../../../model/ids';
import { type AnnotationPlacer, changeAnchor, nudgePatches } from '../../../chart/shared/scene/annotationPlace';
import { RESULT_STATS, resultValue } from '../../../model/graph/resultTokens';
import { mixedAnnotationKeys, selectedAnnotationIds, toggleAnnotationSelection } from '../../../model/graph/selection/multi';
import { capabilitiesOf } from '../../../model/graph/capabilities';
import { bracketKindOf } from '../../../model/graph/chartTypes';
import { xySeries } from '../../../model/table/tableLayout';
import { COMPARED_COLOURS, DEFICIENCIES, MIN_DELTA_E, visionReport } from '../../../model/graph/colour/colorVision';
import { GGSCI_CITATION, PALETTE_GROUPS, PALETTE_GROUP_INFO, paletteById, palettesInGroup } from '../../../model/graph/palettes';
import type { Annotation, Chart, Group, Id, ResultStat } from '../../../model/types';
import { useApp } from '../../../state/AppContext';
import {
  addAnnotation,
  addBracket,
  addReferenceLine,
  addRegion,
  applyPalette,
  composeCommands,
  patchAnnotation,
  patchAnnotations,
  patchAxis,
  patchBothAxes,
  patchBracket,
  patchChart,
  patchLegend,
  patchLook,
  patchReferenceLine,
  patchRegion,
  removeAnnotation,
  removeBracket,
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
import { DialogShell, trapTab } from '../../dialogs/DialogShell';
import { Check, ColorInput, Field, GroupBox, NumField, Section, SelectInput, SubHeading, TextInput } from '../common/controls';
import { BarLabelSection, hasBarLabels } from './LookControls';
import { LegendOrder } from './LegendOrder';
import { LEGEND_MAX_COLUMNS, LEGEND_MAX_OFFSET_PT, legendColumns, legendOffset } from '../../../model/graph/legendEntries';
import { displayName } from '../../../chart/shared/parts/names';
import { prepareChartInput } from '../../../model/table/preparedChart';

/**
 * Inspector pieces that do not depend on the kind of chart: titles and fonts, size and shape, legend, annotations and
 * the list of data sets on the graph. Both the category and the XY inspector use them.
 */

/** Edit a chart property as one undoable step (`key` merges rapid edits). */
function useChartSetter(chart: Chart) {
  const { run } = useApp();
  return (label: string, patch: Partial<Chart>, key?: string) => run(label, patchChart(chart.id, patch), key);
}

export function TextSections({ chart, groups, yName, dual, axes = true }: { chart: Chart; groups: Group[]; yName: string; dual: boolean; axes?: boolean }) {
  const { run } = useApp();
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
        <NumField label="Title size" unit="pt" value={chart.titleFontSizePt} min={8} max={144} disabled={!chart.showTitle} onCommit={(v) => setChart('Title size', { titleFontSizePt: v }, 'chart:titlesize')} />
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
        <div className="muted small">
          In any text of the graph (titles, names, labels, annotations): a subscript {'H_{2}O'}, a superscript {'m^{2}'} or {'x^{-1}'}; Greek letters and symbols by name {'\\mu \\alpha \\Delta \\pm \\times \\deg'}, with {'{}'} to end a name ({'\\mu{}m'}). Text without a backslash or a brace is written as typed.
        </div>
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
        <NumField label="Tick label size" unit="pt" value={chart.yAxis.tickFontSizePt} min={8} max={96} onCommit={(v) => run('Tick label size', patchBothAxes(chart.id, { tickFontSizePt: v }), 'axis:tf')} />
        <NumField label="Axis title size" unit="pt" value={chart.yAxis.titleFontSizePt} min={8} max={96} onCommit={(v) => run('Axis title size', patchBothAxes(chart.id, { titleFontSizePt: v }), 'axis:ts')} />
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
        <NumField label="Chart title from the top" unit="pt" value={chart.titleOffsetPt} min={AXIS_LIMITS.offsetPt.min} max={AXIS_LIMITS.offsetPt.max} disabled={!chart.showTitle} onCommit={(v) => run('Title distance', patchLook(chart.id, { titleOffsetPt: v }), 'chart:titleoff')} />
        <NumField label="X title from the axis" unit="pt" value={chart.xAxis.titleOffsetPt} min={AXIS_LIMITS.offsetPt.min} max={AXIS_LIMITS.offsetPt.max} onCommit={(v) => run('X title distance', patchAxis(chart.id, 'xAxis', { titleOffsetPt: v }), 'axis:xto')} />
        <NumField label={`${yName} title from the axis`} unit="pt" value={chart.yAxis.titleOffsetPt} min={AXIS_LIMITS.offsetPt.min} max={AXIS_LIMITS.offsetPt.max} onCommit={(v) => run('Y title distance', patchAxis(chart.id, 'yAxis', { titleOffsetPt: v }), 'axis:yto')} />
        <NumField label="X numbers from the axis" unit="pt" value={chart.xAxis.tickLabelOffsetPt} min={AXIS_LIMITS.offsetPt.min} max={AXIS_LIMITS.offsetPt.max} onCommit={(v) => run('X numbers distance', patchAxis(chart.id, 'xAxis', { tickLabelOffsetPt: v }), 'axis:xno')} />
        <NumField label={`${yName} numbers from the axis`} unit="pt" value={chart.yAxis.tickLabelOffsetPt} min={AXIS_LIMITS.offsetPt.min} max={AXIS_LIMITS.offsetPt.max} onCommit={(v) => run('Y numbers distance', patchAxis(chart.id, 'yAxis', { tickLabelOffsetPt: v }), 'axis:yno')} />
        {dual && (
          <>
            <NumField label="Right Y title from the axis" unit="pt" value={chart.y2Axis.titleOffsetPt} min={AXIS_LIMITS.offsetPt.min} max={AXIS_LIMITS.offsetPt.max} onCommit={(v) => run('Right Y title distance', patchAxis(chart.id, 'y2Axis', { titleOffsetPt: v }), 'axis:y2to')} />
            <NumField label="Right Y numbers from the axis" unit="pt" value={chart.y2Axis.tickLabelOffsetPt} min={AXIS_LIMITS.offsetPt.min} max={AXIS_LIMITS.offsetPt.max} onCommit={(v) => run('Right Y numbers distance', patchAxis(chart.id, 'y2Axis', { tickLabelOffsetPt: v }), 'axis:y2no')} />
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
  // Custom is a choice of its own, also while the width happens to equal a preset.
  const [customPrint, setCustomPrint] = useState(false);
  const print = chart.printWidthMm;
  const printChoice = print === undefined ? 'none' : customPrint || !(PRINT_WIDTH_MM.presets as readonly number[]).includes(print) ? 'custom' : String(print);
  return (
    <div className="tab-body">
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
      <Field label="Print width" hint="The width the graph will be printed at. The export dialog then warns about text and lines that would print too small. Nothing is resized.">
        <SelectInput<string>
          value={printChoice}
          options={[{ value: 'none', label: 'None' }, ...PRINT_WIDTH_MM.presets.map((mm) => ({ value: String(mm), label: `${mm} mm` })), { value: 'custom', label: 'Custom' }]}
          onChange={(v) => {
            setCustomPrint(v === 'custom');
            setChart('Print width', { printWidthMm: v === 'none' ? undefined : v === 'custom' ? (print ?? 100) : Number(v) });
          }}
        />
      </Field>
      {printChoice === 'custom' && (
        <NumField label="Custom print width" unit="mm" step={1} slider={false} value={print ?? 100} min={PRINT_WIDTH_MM.min} max={PRINT_WIDTH_MM.max} onCommit={(v) => setChart('Print width', { printWidthMm: v }, 'chart:pw')} />
      )}
      <div className="muted small">Sizes are in pixels. The default for new charts is set in Settings.</div>
    </div>
  );
}

export function LegendSection({ chart, groups }: { chart: Chart; groups: Group[] }) {
  const { run } = useApp();
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
        <NumField label="Move right" value={legendOffset(chart.legend).x} min={-LEGEND_MAX_OFFSET_PT} max={LEGEND_MAX_OFFSET_PT} step={1} unit="pt" disabled={!chart.legend.visible} onCommit={(v) => run('Move legend', setLegendOffset(chart.id, v, legendOffset(chart.legend).y))} hint="Shifts the legend from its place; negative moves it left" />
        <NumField label="Move down" value={legendOffset(chart.legend).y} min={-LEGEND_MAX_OFFSET_PT} max={LEGEND_MAX_OFFSET_PT} step={1} unit="pt" disabled={!chart.legend.visible} onCommit={(v) => run('Move legend', setLegendOffset(chart.id, legendOffset(chart.legend).x, v))} hint="Negative moves it up" />
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

function ReferenceLinesSection({ chart }: { chart: Chart }) {
  const { run, project } = useApp();
  const lines = capabilitiesOf(chart.type).referenceLines;
  if (lines === 'none') return null;
  const table = prepareChartInput(project, chart)?.table;
  const groups = table?.groups ?? [];
  const hasX = lines === 'xy';
  const oblique = capabilitiesOf(chart.type).guides;
  const add = (axis: 'x' | 'y') => run('Add reference line', addReferenceLine(chart.id, { id: newId('ref'), axis, value: 0, color: '#cc0000', widthPt: 2, style: 'dashed', opacity: 1, label: '', showLabel: false }));
  // An oblique line: y = intercept + slope * x; the identity line is the one with slope 1 and intercept 0.
  const addOblique = (slope: number, intercept: number) => run('Add reference line', addReferenceLine(chart.id, { id: newId('ref'), axis: 'y', value: 0, slope, intercept, color: '#cc0000', widthPt: 2, style: 'dashed', opacity: 1, label: '', showLabel: false }));
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
          <div key={l.id} className="annotation-card selected">
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
                <SelectInput<string>
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
                <SelectInput<string>
                  value={l.valueFrom.groupId}
                  options={groups.some((g) => g.id === l.valueFrom?.groupId) ? groups.map((g) => ({ value: g.id, label: displayName(chart, g.id, g.name) })) : [...groups.map((g) => ({ value: g.id, label: displayName(chart, g.id, g.name) })), { value: l.valueFrom.groupId, label: '(not on this graph)' }]}
                  onChange={(v) => l.valueFrom && set('Bind reference line', { valueFrom: { stat: l.valueFrom.stat, groupId: v } })}
                />
              </Field>
            )}
            <Field label="Label" hint={RESULT_HINT}>
              <TextInput value={l.label} onChange={(v) => set('Reference line label', { label: v }, 'label')} />
            </Field>
            <Field label="Show label">
              <Check checked={l.showLabel} onChange={(v) => set('Show reference line label', { showLabel: v })} />
            </Field>
            <Field label="Colour">
              <ColorInput value={l.color} onChange={(v) => set('Reference line colour', { color: v }, 'color')} />
            </Field>
            <NumField label="Thickness" unit="pt" value={l.widthPt} min={0.2} max={40} onCommit={(v) => set('Reference line thickness', { widthPt: v }, 'width')} />
            <NumField label="Opacity" value={l.opacity} min={0} max={1} onCommit={(v) => set('Reference line opacity', { opacity: v }, 'opacity')} hint="0 = transparent, 1 = opaque" />
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
  const { run } = useApp();
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
            <NumField label="Opacity" value={r.opacity} min={0} max={1} onCommit={(v) => set('Shaded region opacity', { opacity: v }, 'opacity')} hint="0 = transparent, 1 = opaque" />
            <div className="button-row">
              <button onClick={() => run('Delete shaded region', removeRegion(chart.id, r.id))}>Delete band</button>
            </div>
          </div>
        );
      })}
    </Section>
  );
}

/** Comparison brackets: a bar joining two data sets with the label the owner supplies. Nothing is calculated from it. */
function BracketsSection({ chart }: { chart: Chart }) {
  const { run, project } = useApp();
  const kind = bracketKindOf(chart.type);
  if (kind === null) return null;
  const table = prepareChartInput(project, chart)?.table;
  // Charts over columns join data sets (columns); grouped and XY charts join the series (blocks of columns) of their table.
  const sets = !table ? [] : kind === 'columns' ? table.groups.map((g) => ({ id: g.id, name: g.name })) : xySeries(table).map((s) => ({ id: s.id, name: s.name }));
  const options = sets.map((g) => ({ value: g.id, label: displayName(chart, g.id, g.name) }));
  // A bracket that joins a data set that is no longer on the graph says so, and can be pointed at another.
  const optionsFor = (id: Id) => (options.some((o) => o.value === id) ? options : [...options, { value: id, label: '(not on this graph)' }]);
  // Grouped bars: the categories are the rows of the table that have a name (a bracket keeps the row, so inserting a row above moves it).
  const rows = !table || kind !== 'grouped' ? [] : table.rows.flatMap((r, i) => (r.title.trim() !== '' ? [{ value: String(i), label: r.title.trim() }] : []));
  const rowOptionsFor = (row: number) => (rows.some((o) => o.value === String(row)) ? rows : [...rows, { value: String(row), label: `Row ${row + 1}` }]);
  const add = () => run('Add comparison bracket', addBracket(chart.id, { id: newId('brk'), from: sets[0].id, to: sets[1 % sets.length].id, label: '', color: '#000000', widthPt: 2, fontSizePt: 24, ...(kind === 'grouped' ? { row: Number(rows[0]?.value ?? 0) } : {}) }));
  const what = kind === 'columns' ? 'data sets' : kind === 'grouped' ? 'series, in one category or across two' : 'series at one X';
  return (
    <Section title="Comparison brackets">
      <div className="button-row">
        <button onClick={add} disabled={sets.length < 2 && !(kind === 'grouped' && sets.length >= 1 && rows.length >= 2)}>+ Bracket between two {kind === 'columns' ? 'data sets' : kind === 'grouped' ? 'series or categories' : 'series'}</button>
      </div>
      {chart.brackets.length === 0 && <div className="muted small">A bracket joins two {what} and shows the label you give it (a p-value, stars, "ns"). Nothing is calculated: the result is yours, from your own test. {kind === 'xy' ? 'The bar stands to the right of the two points, and the X axis is extended to fit it.' : 'The axis is extended to fit the brackets, and brackets that overlap stand one above the other.'}</div>}
      {chart.brackets.map((b, i) => {
        const set = (label: string, patch: Parameters<typeof patchBracket>[2], key?: string) => run(label, patchBracket(chart.id, b.id, patch), key === undefined ? undefined : `brk:${b.id}:${key}`);
        const row = b.row ?? Number(rows[0]?.value ?? 0);
        return (
          <div key={b.id} className="annotation-card selected">
            <Field label={`From (bracket ${i + 1})`}>
              <SelectInput<string> value={b.from} options={optionsFor(b.from)} onChange={(v) => set('Bracket start', { from: v })} />
            </Field>
            {kind === 'grouped' && (
              <Field label="Category of From">
                <SelectInput<string> value={String(row)} options={rowOptionsFor(row)} onChange={(v) => set('Bracket category', { row: Number(v) })} />
              </Field>
            )}
            <Field label="To">
              <SelectInput<string> value={b.to} options={optionsFor(b.to)} onChange={(v) => set('Bracket end', { to: v })} />
            </Field>
            {kind === 'grouped' && (
              <Field label="Category of To" hint="The same category as From, or another one to join two categories.">
                <SelectInput<string> value={String(b.toRow ?? row)} options={rowOptionsFor(b.toRow ?? row)} onChange={(v) => set('Bracket end category', { row, toRow: Number(v) })} />
              </Field>
            )}
            {kind === 'xy' && <NumField label="At X" value={b.at ?? 0} onCommit={(v) => set('Bracket X', { at: v }, 'at')} hint="Both series must have a point at this X." />}
            <Field label="Label" hint={`What you want written above the bracket: a p-value, stars, ns. ${RESULT_HINT}`}>
              <TextInput value={b.label} onChange={(v) => set('Bracket label', { label: v }, 'label')} />
            </Field>
            <Field label="Colour">
              <ColorInput value={b.color} onChange={(v) => set('Bracket colour', { color: v }, 'color')} />
            </Field>
            <NumField label="Thickness" unit="pt" value={b.widthPt} min={0.2} max={40} onCommit={(v) => set('Bracket thickness', { widthPt: v }, 'width')} />
            <NumField label="Label size" unit="pt" value={b.fontSizePt} min={4} max={200} onCommit={(v) => set('Bracket label size', { fontSizePt: v }, 'font')} />
            <div className="button-row">
              <button onClick={() => run('Delete comparison bracket', removeBracket(chart.id, b.id))}>Delete bracket</button>
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
  const { run, selection, setSelection } = useApp();
  // Several annotations selected together are edited together, and where they differ a field says so ("Mixed").
  const picked = selectedAnnotationIds(selection);
  const chosen = chart.annotations.filter((a) => picked.includes(a.id));
  const mixed = mixedAnnotationKeys(chosen);
  const setAll = (label: string, patch: Partial<Annotation>, key: string) => run(label, patchAnnotations(chart.id, chosen.map((a) => a.id), patch), `ann:${chosen.map((a) => a.id).join()}:${key}`);
  return (
    <div className="tab-body">
      {hasBarLabels(chart.type) && <BarLabelSection chart={chart} />}
      <ReferenceLinesSection chart={chart} />
      <RegionsSection chart={chart} />
      <BracketsSection chart={chart} />
      <div className="button-row">
        <button
          onClick={() => {
            const id = newId('ann');
            run('Add annotation', addAnnotation(chart.id, { id, text: 'Text', xFrac: 0.4, yFrac: 0.08, fontSizePt: 28, color: '#000000', opacity: 1 }));
            setSelection({ kind: 'annotation', annotationId: id });
          }}
        >
          + Add text annotation
        </button>
      </div>
      {chart.annotations.length === 0 && <div className="muted small">No annotations. Added text can be dragged within the chart.</div>}
      {chosen.length > 1 && (
        <GroupBox title={`Selected annotations (${chosen.length})`}>
          <div className="muted small">These annotations are edited together. Ctrl or Shift on an annotation, on the chart or in the list, takes it in or out; the arrow keys move them together.</div>
          <NumField label="Size" unit="pt" value={chosen[0].fontSizePt} min={8} max={192} overridden={{ mixed: mixed.has('fontSizePt') }} onCommit={(v) => setAll('Annotation size', { fontSizePt: v }, 'size')} />
          <Field label="Colour" overridden={{ mixed: mixed.has('color') }}>
            <ColorInput value={chosen[0].color} onChange={(v) => setAll('Annotation colour', { color: v }, 'color')} />
          </Field>
          <NumField label="Opacity" value={chosen[0].opacity} min={0} max={1} overridden={{ mixed: mixed.has('opacity') }} onCommit={(v) => setAll('Annotation opacity', { opacity: v }, 'opacity')} hint="0 = transparent, 1 = opaque" />
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
            <button className="list-item" onClick={(e) => setSelection(e.ctrlKey || e.metaKey || e.shiftKey ? toggleAnnotationSelection(selection, a.id, chart.annotations.map((x) => x.id)) : { kind: 'annotation', annotationId: a.id })}>
              {a.text.split('\n')[0] || '(empty)'}
            </button>
            {isSel && (
              <>
                <Field label="Text" hint={RESULT_HINT}>
                  <textarea rows={2} aria-label="Annotation text" value={a.text} onChange={(e) => run('Edit annotation text', patchAnnotation(chart.id, a.id, { text: e.target.value }), `ann:${a.id}:text`)} />
                </Field>
                {placer?.supportsData && (
                  <Field label="Anchor" hint="Page: a place on the page. Data values: a place on the axes, so the text follows the axis range, a log scale and breaks.">
                    <SelectInput<'page' | 'data'>
                      value={a.anchor === 'data' ? 'data' : 'page'}
                      options={[
                        { value: 'page', label: 'Page' },
                        { value: 'data', label: 'Data values' },
                      ]}
                      onChange={(v) => {
                        const patch = changeAnchor(a, placer, v);
                        if (patch && Object.keys(patch).length > 0) run('Annotation anchor', patchAnnotation(chart.id, a.id, patch));
                      }}
                    />
                  </Field>
                )}
                {placer && a.anchor === 'data' ? (
                  <>
                    {placer.numericX && <NumField label="X value" value={a.x ?? 0} min={-1e15} max={1e15} slider={false} hint="In the units of the X axis; the left edge of the text" onCommit={(v) => run('Annotation position', patchAnnotation(chart.id, a.id, { x: v }), `ann:${a.id}:x`)} />}
                    <NumField label="Y value" value={a.y ?? 0} min={-1e15} max={1e15} slider={false} hint="In the units of the value axis; the top edge of the text" onCommit={(v) => run('Annotation position', patchAnnotation(chart.id, a.id, { y: v }), `ann:${a.id}:y`)} />
                    {placer.acrossPage === 'x' && <NumField label="Left" unit="% of chart width" value={Math.round(a.xFrac * 1000) / 10} min={0} max={100} slider={false} step={0.1} hint="Across the categories the position stays a place on the page" onCommit={(v) => run('Annotation position', patchAnnotation(chart.id, a.id, { xFrac: v / 100 }), `ann:${a.id}:xf`)} />}
                    {placer.acrossPage === 'y' && <NumField label="Top" unit="% of chart height" value={Math.round(a.yFrac * 1000) / 10} min={0} max={100} slider={false} step={0.1} hint="Across the categories the position stays a place on the page" onCommit={(v) => run('Annotation position', patchAnnotation(chart.id, a.id, { yFrac: v / 100 }), `ann:${a.id}:yf`)} />}
                    {placer.skipped([a]).length > 0 && <div className="field-note">These values are outside the axis range, so the text is not drawn.</div>}
                  </>
                ) : (
                  <>
                    <NumField label="Left" unit="% of chart width" value={Math.round(a.xFrac * 1000) / 10} min={0} max={100} slider={false} step={0.1} hint="Position of the left edge of the text; arrow keys nudge a selected annotation (Shift 5%, Alt 0.1%)" onCommit={(v) => run('Annotation position', patchAnnotation(chart.id, a.id, { xFrac: v / 100 }), `ann:${a.id}:x`)} />
                    <NumField label="Top" unit="% of chart height" value={Math.round(a.yFrac * 1000) / 10} min={0} max={100} slider={false} step={0.1} onCommit={(v) => run('Annotation position', patchAnnotation(chart.id, a.id, { yFrac: v / 100 }), `ann:${a.id}:y`)} />
                  </>
                )}
                <NumField label="Size" unit="pt" value={a.fontSizePt} min={8} max={192} onCommit={(v) => run('Annotation size', patchAnnotation(chart.id, a.id, { fontSizePt: v }), `ann:${a.id}:size`)} />
                <Field label="Colour">
                  <ColorInput value={a.color} onChange={(v) => run('Annotation colour', patchAnnotation(chart.id, a.id, { color: v }), `ann:${a.id}:color`)} />
                </Field>
                <NumField label="Opacity" value={a.opacity} min={0} max={1} onCommit={(v) => run('Annotation opacity', patchAnnotation(chart.id, a.id, { opacity: v }), `ann:${a.id}:opacity`)} hint="0 = transparent, 1 = opaque" />
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
  );
}

/** Check boxes to put data sets on the graph or take them off, grouped by table. */
export function OnThisGraph({ chart }: { chart: Chart }) {
  const { project, run } = useApp();
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

/** The palette menu entries, in subcategories. */
function PaletteOptions() {
  return (
    <>
      {PALETTE_GROUPS.map((g) => (
        <optgroup key={g} label={g}>
          {palettesInGroup(g).map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

/** Whether the first colours of a palette stay distinguishable with a colour-vision deficiency (measured, see colorVision.ts). */
function VisionNote({ colors }: { colors: readonly string[] }) {
  const r = useMemo(() => visionReport(colors), [colors]);
  const worst = (Object.keys(DEFICIENCIES) as (keyof typeof DEFICIENCIES)[]).reduce((a, k) => (r.byKind[k] < r.byKind[a] ? k : a), 'protan' as keyof typeof DEFICIENCIES);
  return r.safe ? (
    <div className="small vision vision-ok">✓ Colour-vision safe: the first {COMPARED_COLOURS} colours stay apart for red-weak, green-weak and blue-weak vision.</div>
  ) : (
    <div className="small muted vision">Not colour-vision safe: two of the first {COMPARED_COLOURS} colours come close with {DEFICIENCIES[worst].label} vision (difference {r.byKind[worst].toFixed(1)}; {MIN_DELTA_E} or more is clear).</div>
  );
}

/** An info button beside the palette menu; it opens a window with the colours, what the palette is and its source. */
function PaletteInfo({ paletteId }: { paletteId: string | null }) {
  const [open, setOpen] = useState(false);
  const palette = paletteById(paletteId);
  if (!palette) return null;
  return (
    <>
      <button className="icon-btn palette-info" aria-label="About this palette" title="About this palette" onClick={() => setOpen(true)}>i</button>
      {open && (
        <DialogShell>
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)} onKeyDown={(e) => (e.key === 'Escape' ? setOpen(false) : trapTab(e))}>
          <div className="modal modal-wide" role="dialog" aria-modal="true" aria-label="Colour palettes" tabIndex={-1} ref={(el) => el?.focus()}>
            <div className="modal-head">
              <strong>Colour palettes</strong>
              <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close">×</button>
            </div>
            <div className="modal-body modal-pad palette-about">
              <p className="muted small">In use: <strong>{palette.name}</strong>, {palette.colors.length} colours, applied to the data sets in order and repeated when there are more data sets than colours. Colour-vision notes are measured on the first {COMPARED_COLOURS} colours of each palette, by simulating red-weak, green-weak and blue-weak vision (Machado et al., 2009) and taking the smallest CIE76 colour difference between any two of them.</p>
              {PALETTE_GROUPS.map((g) => (
                <section key={g} className="palette-group">
                  <h4>{g}</h4>
                  <p className="muted small">{PALETTE_GROUP_INFO[g]}</p>
                  {palettesInGroup(g).map((p) => (
                    <div key={p.id} className={`palette-entry${p.id === palette.id ? ' current' : ''}`}>
                      <div className="palette-entry-head">
                        <strong>{p.name}</strong>
                        <span className="palette-swatches" aria-hidden="true">
                          {p.colors.slice(0, 12).map((c, i) => (
                            <i key={i} style={{ background: c }} title={c} />
                          ))}
                        </span>
                      </div>
                      {p.description && <div className="small">{p.description}</div>}
                      <VisionNote colors={p.colors} />
                    </div>
                  ))}
                </section>
              ))}
              <p className="muted small">
                Source of the colours (all but the last group): {GGSCI_CITATION.text} <a href={GGSCI_CITATION.url} target="_blank" rel="noreferrer">{GGSCI_CITATION.url}</a>. Descriptions after <a href={GGSCI_CITATION.vignette} target="_blank" rel="noreferrer">the ggsci introduction</a>.
              </p>
            </div>
            <div className="modal-foot">
              <button className="primary" onClick={() => setOpen(false)}>Close</button>
            </div>
          </div>
        </div>
        </DialogShell>
      )}
    </>
  );
}

/** The colour palette of the data sets: choosing one gives them coordinated colours in order. */
export function PaletteField({ chart, hint }: { chart: Chart; hint: string }) {
  const { run } = useApp();
  const palette = paletteById(chart.paletteId);
  return (
    <Field label="Color palette" hint={hint}>
      <select
        value={chart.paletteId ?? 'custom'}
        aria-label="Color palette"
        onChange={(e) => {
          const chosen = paletteById(e.target.value);
          if (chosen) run(`Apply ${chosen.name} palette`, applyPalette(chart.id, chosen));
        }}
      >
        {chart.paletteId === null && (
          <option value="custom" disabled>
            Custom colours
          </option>
        )}
        <PaletteOptions />
      </select>
      {palette && (
        <span className="palette-swatches" aria-hidden="true">
          {palette.colors.slice(0, 5).map((c) => (
            <i key={c} style={{ background: c }} />
          ))}
        </span>
      )}
      <PaletteInfo paletteId={chart.paletteId} />
    </Field>
  );
}
