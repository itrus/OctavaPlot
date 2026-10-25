import { useState } from 'react';
import { PIE_LABEL_MODES, PIE_LIMITS } from '../../model/options/pieOptions';
import { chartTypesFor } from '../../model/graph/chartTypes';
import { composeCommands, patchChart, patchLook, patchStyle, setChartType } from '../../state/commands';
import { resolveStyle, dataLayer } from '../../model/graph/style';
import type { Chart, ChartType, DataTable, PieLabelMode, PieOptions } from '../../model/types';
import { useApp } from '../../state/AppContext';
import { ColorInput, Field, GroupBox, NumField, SectionBar, SelectInput, TabBar, TextInput, Check } from './common/controls';
import { AnnotationsTab, DimensionsSection, LegendSection, PaletteField, TextSections } from './sections/SharedSections';
import { LayersSection } from './sections/LayersSection';
import { TABS } from './common/nav';
import { displayName } from '../../chart/shared/parts/names';
import type { AppearanceSection, InspectorTab } from '../../state/inspectorNav';

/** Pies and doughnuts have no axes or frame, so their formatting panel has fewer sections. */
const SECTIONS: Array<{ id: AppearanceSection; label: string }> = [
  { id: 'style', label: 'Style' },
  { id: 'text', label: 'Text' },
  { id: 'layout', label: 'Layout' },
  { id: 'legend', label: 'Legend' },
];

/** The formatting panel of pie and doughnut charts. */
export function PieInspector({ chart, table }: { chart: Chart; table: DataTable }) {
  const { run, selection, inspectorNav } = useApp();
  const [tab, setTab] = useState<InspectorTab>('appearance');
  const [section, setSection] = useState<AppearanceSection>('style');
  // A click on the chart sends the panel to the settings of what was clicked (axes and frame have none here).
  const [seenNav, setSeenNav] = useState(inspectorNav.n);
  if (seenNav !== inspectorNav.n) {
    setSeenNav(inspectorNav.n);
    const t = inspectorNav.target;
    if (t) {
      setTab(t.tab);
      if (t.section && SECTIONS.some((s) => s.id === t.section)) setSection(t.section);
    }
  }
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
    <aside className="inspector" aria-label="Graph formatting">
      <TabBar tabs={TABS.filter((t) => t.id !== 'datasets')} value={tab} onChange={setTab} />
      {tab === 'appearance' && (
        <div>
          <SectionBar sections={SECTIONS} value={section} onChange={setSection} />
          {section === 'style' && (
            <div className="tab-body">
              <GroupBox title="Style">
                <Field label="Appearance">
                  <SelectInput<ChartType> value={chart.type} options={chartTypesFor('contingency').map((c) => ({ value: c.type, label: c.label }))} onChange={(t) => run('Change graph type', setChartType(chart.id, t))} />
                </Field>
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
                {doughnut && <NumField label="Hole" hint="Fraction of the radius" value={d.hole} min={PIE_LIMITS.hole.min} max={PIE_LIMITS.hole.max} onCommit={(v) => set('Doughnut hole', { hole: v }, 'pie:hole')} />}
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
                <NumField
                  label="Border"
                  unit="pt"
                  value={parts[0]?.style.barBorderWidthPt ?? 0}
                  min={0}
                  max={40}
                  onCommit={(v) => run('Change style', patchStyle(chart.id, 'all', { barBorderWidthPt: v }), 'style:all:border')}
                />
                <Field label="Border color">
                  <ColorInput value={parts[0]?.style.barBorderColor ?? '#ffffff'} ariaLabel="Border colour" onChange={(v) => run('Change style', patchStyle(chart.id, 'all', { barBorderColor: v }), 'style:all:bordercolor')} />
                </Field>
              </GroupBox>
            </div>
          )}
          {section === 'text' && <TextSections chart={chart} groups={table.groups} yName="Y" dual={false} axes={false} />}
          {section === 'layout' && <DimensionsSection chart={chart} />}
          {section === 'legend' && <LegendSection chart={chart} groups={table.groups} />}
        </div>
      )}
      {tab === 'annotations' && <AnnotationsTab chart={chart} />}
    </aside>
  );
}
