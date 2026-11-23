import { PIE_LABEL_MODES, PIE_LIMITS } from '../../model/options/pieOptions';
import { useRestyle } from './common/useScopedEdits';
import { composeCommands, patchLook, patchStyle, setGroupOnGraph } from '../../state/commands';
import { pieColumn, pieParts } from '../../model/table/pieParts';
import { resolveStyle, dataLayer } from '../../model/graph/style';
import type { Chart, DataTable, PieLabelMode, PieOptions } from '../../model/types';
import { useCommands, useSelection } from '../../state/AppContext';
import { inspectorShapeOf, useInspectorNav } from './common/nav';
import { ColorInput, Field, GroupBox, NumField, SelectInput, TextInput, Check } from './common/controls';
import { AnnotationsTab, DimensionsSection, LegendSection, TextSections } from './sections/SharedSections';
import { PaletteField } from './sections/PalettePicker';
import { LayersSection } from './sections/LayersSection';
import { InspectorShell } from './common/InspectorShell';
import { ExportPanel } from '../export/ExportPanel';
import { ChartTypePicker } from './sections/ChartTypePicker';
import { displayName } from '../../chart/shared/parts/names';
import { SLIDERS } from './common/sliderRanges';

/** Pies and doughnuts have no axes or frame, so their formatting panel has fewer pages. */


/** The formatting panel of pie and doughnut charts. */
export function PieInspector({ chart, table }: { chart: Chart; table: DataTable }) {
  const { run } = useCommands();
  const { selection } = useSelection();
  const nav = useInspectorNav(chart.id, inspectorShapeOf(chart.type).pages, inspectorShapeOf(chart.type).lacks);
  const { shows } = nav;
  const layer = dataLayer(chart);
  const d = chart.pie;
  const set = (label: string, patch: Partial<PieOptions>, key?: string) => run(label, patchLook(chart.id, { pie: { ...d, ...patch } }), key);
  const doughnut = chart.type === 'doughnut';
  // Only a circle has a start and a direction; the dots of a grid have no text beside them (the legend names the parts).
  const circle = chart.type === 'pie' || doughnut;
  const dotGrid = chart.type === 'dotGrid';
  const selectedGroup = selection.kind === 'group' ? selection.groupId : null;
  // One column is drawn; its rows are the parts, named by their row titles.
  const column = pieColumn(chart, table);
  const parts = pieParts(table, column).map((p, i) => ({ g: { id: p.id, name: p.label }, style: resolveStyle(chart, layer, { id: p.id, paletteIndex: i }), label: displayName(chart, p.id, p.label) }));
  const partGroups = parts.map((p) => p.g);
  const recolour = useRestyle(chart);
  // Show one column and take the others off the graph.
  const chooseColumn = (id: string) => run('Pie column', composeCommands(...table.groups.map((g) => setGroupOnGraph(chart.id, table.id, g.id, g.id === id))));

  return (
    <InspectorShell nav={nav}>
          {shows('style') && (
            <div className="tab-body">
              <GroupBox title="Style">
                <PaletteField chart={chart} hint="Gives the parts coordinated colours in order. The colours below still apply on top." />
              </GroupBox>
              <LayersSection chart={chart} table={table} />

              <GroupBox title={doughnut ? 'Doughnut' : chart.type === 'slices' ? 'Slices' : dotGrid ? '10 × 10 dot plot' : 'Pie'}>
                {circle && <NumField label="First part starts at" unit="°" hint="Degrees from the top, clockwise" value={d.startAngle} min={PIE_LIMITS.startAngle.min} max={PIE_LIMITS.startAngle.max} onCommit={(v) => set('Pie start angle', { startAngle: v }, 'pie:start')} />}
                {circle && (
                  <Field label="Direction">
                    <SelectInput<PieOptions['direction']>
                      value={d.direction}
                      options={[
                        { value: 'clockwise', label: 'Clockwise' },
                        { value: 'counterclockwise', label: 'Counterclockwise' },
                      ]}
                      onChange={(v) => set('Pie direction', { direction: v })}
                    />
                  </Field>
                )}
                {dotGrid && <div className="muted small">One dot for each percent of the column, filled row by row from the top left. A dot on the border between two parts is cut between them, so each share is exact; the legend names the parts.</div>}
                {dotGrid && (
                  <Field label="Dot shape">
                    <SelectInput<PieOptions['dotShape']>
                      value={d.dotShape}
                      options={[
                        { value: 'circle', label: 'Circle' },
                        { value: 'square', label: 'Square' },
                      ]}
                      onChange={(v) => set('Dot shape', { dotShape: v })}
                    />
                  </Field>
                )}
                {dotGrid && <NumField {...SLIDERS.fraction} label="Dot size" hint="Width of a dot as a fraction of the space between dots" value={d.dotSize} min={PIE_LIMITS.dotSize.min} max={PIE_LIMITS.dotSize.max} onCommit={(v) => set('Dot size', { dotSize: v }, 'pie:dotsize')} />}
                {doughnut && <NumField {...SLIDERS.fraction} label="Hole" hint="Fraction of the radius" value={d.hole} min={PIE_LIMITS.hole.min} max={PIE_LIMITS.hole.max} onCommit={(v) => set('Doughnut hole', { hole: v }, 'pie:hole')} />}
                {!dotGrid && (
                <Field label="Labels">
                  <SelectInput<PieLabelMode> value={d.labels} options={PIE_LABEL_MODES.map((m) => ({ value: m.value, label: m.label }))} onChange={(v) => set('Pie labels', { labels: v })} />
                </Field>
                )}
                {!dotGrid && <NumField label="Percent decimals" value={d.percentDigits} min={PIE_LIMITS.percentDigits.min} max={PIE_LIMITS.percentDigits.max} slider={false} disabled={d.labels === 'none' || d.labels === 'name' || d.labels === 'value'} onCommit={(v) => set('Percent decimals', { percentDigits: Math.round(v) }, 'pie:digits')} />}
                <Field label="Show the total" hint={doughnut ? 'In the hole of the doughnut' : chart.type === 'slices' ? 'Under the bar' : 'Under the pie'}>
                  <Check checked={d.showTotal} onChange={(v) => set('Show total', { showTotal: v })} />
                </Field>
                <Field label="Total text">
                  <TextInput value={d.totalPrefix} disabled={!d.showTotal} onChange={(v) => set('Total text', { totalPrefix: v }, 'pie:prefix')} />
                </Field>
              </GroupBox>

              <GroupBox title="Parts">
                {table.groups.length > 1 && column && (
                  <Field label="Column" hint="A chart shows one column at a time">
                    <SelectInput value={column.id} options={table.groups.map((g) => ({ value: g.id, label: displayName(chart, g.id, g.name) }))} onChange={chooseColumn} />
                  </Field>
                )}
                {parts.map(({ g, style, label }) => (
                  <Field key={g.id} label={selectedGroup === g.id ? `${label} (selected)` : label}>
                    <ColorInput value={style.barFill} ariaLabel={`Colour of ${label}`} onChange={(v) => recolour(g.id, { barFill: v })} />
                  </Field>
                ))}
                <NumField {...SLIDERS.line}
                  label="Border"
                  unit="pt"
                  value={parts[0]?.style.barBorderWidthPt ?? 0}
                  min={0}
                  max={20}
                  onCommit={(v) => run('Change style', patchStyle(chart.id, 'all', { barBorderWidthPt: v }), 'style:all:border')}
                />
                <Field label="Border colour">
                  <ColorInput value={parts[0]?.style.barBorderColor ?? '#ffffff'} ariaLabel="Border colour" onChange={(v) => run('Change style', patchStyle(chart.id, 'all', { barBorderColor: v }), 'style:all:bordercolor')} />
                </Field>
              </GroupBox>
            </div>
          )}
          {shows('type') && <ChartTypePicker chart={chart} table={table} />}
          {shows('layout') && <DimensionsSection chart={chart} />}
          {shows('text') && <TextSections chart={chart} groups={partGroups} yName="Y" dual={false} axes={false} />}
          {shows('legend') && <LegendSection chart={chart} groups={partGroups} />}
          {shows('annotations') && <AnnotationsTab chart={chart} />}
      {shows('export') && <ExportPanel chart={chart} table={table} />}
    </InspectorShell>
  );
}
