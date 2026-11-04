import { PIE_LABEL_MODES, PIE_LIMITS } from '../../model/options/pieOptions';
import { composeCommands, patchChart, patchLook, patchStyle } from '../../state/commands';
import { resolveStyle, dataLayer } from '../../model/graph/style';
import type { Chart, DataTable, PieLabelMode, PieOptions } from '../../model/types';
import { useApp } from '../../state/AppContext';
import type { InspectorPage } from '../../state/inspectorNav';
import { ColorInput, Field, GroupBox, NumField, SelectInput, TextInput, Check } from './common/controls';
import { AnnotationsTab, DimensionsSection, LegendSection, PaletteField, TextSections } from './sections/SharedSections';
import { LayersSection } from './sections/LayersSection';
import { InspectorShell } from './common/InspectorShell';
import { ExportPanel } from '../export/ExportPanel';
import { useInspectorNav } from './common/useInspectorNav';
import { ChartTypePicker } from './sections/ChartTypePicker';
import { displayName } from '../../chart/shared/parts/names';
import { SLIDERS } from './common/sliderRanges';

/** Pies and doughnuts have no axes or frame, so their formatting panel has fewer pages. */
const PAGES: InspectorPage[] = ['graph', 'plot', 'legend', 'notes', 'export'];

/** The formatting panel of pie and doughnut charts. */
export function PieInspector({ chart, table }: { chart: Chart; table: DataTable }) {
  const { run, selection } = useApp();
  const nav = useInspectorNav(PAGES, ['datasets', 'frame']);
  const { shows } = nav;
  const layer = dataLayer(chart);
  const d = chart.pie;
  const set = (label: string, patch: Partial<PieOptions>, key?: string) => run(label, patchLook(chart.id, { pie: { ...d, ...patch } }), key);
  const doughnut = chart.type === 'doughnut';
  const selectedGroup = selection.kind === 'group' ? selection.groupId : null;
  // The first column of a contingency table is a part like the others (a part is an outcome).
  const parts = table.groups.map((g, i) => ({ g, style: resolveStyle(chart, layer, { id: g.id, paletteIndex: g.paletteIndex ?? i }), label: displayName(chart, g.id, g.name) }));
  const recolour = (groupId: string, patch: Parameters<typeof patchStyle>[2]) => {
    const command = chart.paletteId !== null ? composeCommands(patchStyle(chart.id, groupId, patch), patchChart(chart.id, { paletteId: null })) : patchStyle(chart.id, groupId, patch);
    run('Change style', command, `style:${groupId}:${Object.keys(patch).join(',')}`);
  };

  return (
    <InspectorShell nav={nav}>
          {shows('style') && (
            <div className="tab-body">
              <GroupBox title="Style">
                <PaletteField chart={chart} hint="Gives the parts coordinated colours in order. The colours below still apply on top." />
              </GroupBox>
              <LayersSection chart={chart} table={table} />

              <GroupBox title={doughnut ? 'Doughnut' : 'Pie'}>
                <NumField label="First part starts at" unit="°" hint="Degrees from the top, clockwise" value={d.startAngle} min={PIE_LIMITS.startAngle.min} max={PIE_LIMITS.startAngle.max} onCommit={(v) => set('Pie start angle', { startAngle: v }, 'pie:start')} />
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
                {doughnut && <NumField {...SLIDERS.fraction} label="Hole" hint="Fraction of the radius" value={d.hole} min={PIE_LIMITS.hole.min} max={PIE_LIMITS.hole.max} onCommit={(v) => set('Doughnut hole', { hole: v }, 'pie:hole')} />}
                <Field label="Labels">
                  <SelectInput<PieLabelMode> value={d.labels} options={PIE_LABEL_MODES.map((m) => ({ value: m.value, label: m.label }))} onChange={(v) => set('Pie labels', { labels: v })} />
                </Field>
                <NumField label="Percent decimals" value={d.percentDigits} min={PIE_LIMITS.percentDigits.min} max={PIE_LIMITS.percentDigits.max} slider={false} disabled={d.labels === 'none' || d.labels === 'name' || d.labels === 'value'} onCommit={(v) => set('Percent decimals', { percentDigits: Math.round(v) }, 'pie:digits')} />
                <Field label="Show the total" hint={doughnut ? 'In the hole of each doughnut' : 'Under each pie'}>
                  <Check checked={d.showTotal} onChange={(v) => set('Show total', { showTotal: v })} />
                </Field>
                <Field label="Total text">
                  <TextInput value={d.totalPrefix} disabled={!d.showTotal} onChange={(v) => set('Total text', { totalPrefix: v }, 'pie:prefix')} />
                </Field>
              </GroupBox>

              <GroupBox title="Parts">
                {parts.map(({ g, style, label }) => (
                  <Field key={g.id} label={label} overridden={selectedGroup === g.id}>
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
                <Field label="Border color">
                  <ColorInput value={parts[0]?.style.barBorderColor ?? '#ffffff'} ariaLabel="Border colour" onChange={(v) => run('Change style', patchStyle(chart.id, 'all', { barBorderColor: v }), 'style:all:bordercolor')} />
                </Field>
              </GroupBox>
            </div>
          )}
          {shows('type') && <ChartTypePicker chart={chart} table={table} />}
          {shows('layout') && <DimensionsSection chart={chart} />}
          {shows('text') && <TextSections chart={chart} groups={table.groups} yName="Y" dual={false} axes={false} />}
          {shows('legend') && <LegendSection chart={chart} groups={table.groups} />}
          {shows('annotations') && <AnnotationsTab chart={chart} />}
      {shows('export') && <ExportPanel chart={chart} table={table} />}
    </InspectorShell>
  );
}
