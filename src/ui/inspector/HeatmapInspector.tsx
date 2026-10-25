import { useState } from 'react';
import { chartTypesFor } from '../../model/graph/chartTypes';
import { HEAT_LIMITS, HEAT_PALETTES } from '../../model/options/heatmapOptions';
import type { Chart, ChartType, DataTable, HeatmapOptions } from '../../model/types';
import { useApp } from '../../state/AppContext';
import { patchAxis, patchLook, setChartType } from '../../state/commands';
import { Check, ColorInput, Field, GroupBox, NumField, OptionalNumField, SectionBar, SelectInput, TabBar } from './common/controls';
import { SECTIONS as ALL_SECTIONS, TABS } from './common/nav';
import { LayersSection } from './sections/LayersSection';
import { AnnotationsTab, DimensionsSection, TextSections } from './sections/SharedSections';
import type { AppearanceSection, InspectorTab } from '../../state/inspectorNav';

/** A heat map has no axes of numbers, no frame and no legend: its panel has the style, text and layout sections. */
const SECTIONS = ALL_SECTIONS.filter((s) => s.id === 'style' || s.id === 'text' || s.id === 'layout');

/** The formatting panel of heat maps of a grouped table. */
export function HeatmapInspector({ chart, table }: { chart: Chart; table: DataTable }) {
  const { run, inspectorNav } = useApp();
  const [tab, setTab] = useState<InspectorTab>('appearance');
  const [section, setSection] = useState<AppearanceSection>('style');
  const [seenNav, setSeenNav] = useState(inspectorNav.n);
  if (seenNav !== inspectorNav.n) {
    setSeenNav(inspectorNav.n);
    const t = inspectorNav.target;
    if (t) {
      setTab(t.tab === 'datasets' ? 'appearance' : t.tab);
      if (t.section && SECTIONS.some((s) => s.id === t.section)) setSection(t.section);
    }
  }
  const o = chart.heatmap;
  const set = (label: string, patch: Partial<HeatmapOptions>, key?: string) => run(label, patchLook(chart.id, { heatmap: { ...o, ...patch } }), key);
  const diverging = HEAT_PALETTES.find((p) => p.value === o.palette)?.diverging ?? false;
  const normalised = o.normalise !== 'none';

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
                  <SelectInput<ChartType> value={chart.type} options={chartTypesFor('grouped').map((c) => ({ value: c.type, label: c.label }))} onChange={(t) => run('Change graph type', setChartType(chart.id, t))} />
                </Field>
              </GroupBox>
              <LayersSection chart={chart} table={table} />

              <GroupBox title="Colours">
                <Field label="Scale">
                  <SelectInput<HeatmapOptions['palette']> value={o.palette} options={HEAT_PALETTES.map((p) => ({ value: p.value, label: p.label }))} onChange={(v) => set('Heat map colours', { palette: v })} />
                </Field>
                <Field label="Reverse the colours">
                  <Check checked={o.reverse} onChange={(v) => set('Reverse colours', { reverse: v })} />
                </Field>
                <OptionalNumField label="Lowest value" hint="Auto: the smallest value" value={o.min} autoValue={0} validate={(v) => (o.max !== null && v >= o.max ? 'Must be below the highest value.' : null)} onCommit={(v) => set('Lowest colour value', { min: v }, 'heat:min')} />
                <OptionalNumField label="Highest value" hint="Auto: the largest value" value={o.max} autoValue={1} validate={(v) => (o.min !== null && v <= o.min ? 'Must be above the lowest value.' : null)} onCommit={(v) => set('Highest colour value', { max: v }, 'heat:max')} />
                {diverging && <OptionalNumField label="Middle (black) at" hint="Auto: the middle of the range, or 0 for z-scores and centred values" value={o.centre} autoValue={0} onCommit={(v) => set('Middle colour value', { centre: v }, 'heat:centre')} />}
                <Field label="Missing cells">
                  <ColorInput value={o.missingColour} ariaLabel="Colour of missing cells" onChange={(v) => set('Missing cell colour', { missingColour: v })} />
                </Field>
                <Field label="Colour bar">
                  <Check checked={o.colourbar} onChange={(v) => set('Colour bar', { colourbar: v })} />
                </Field>
              </GroupBox>

              <GroupBox title="Values">
                {table.layout?.kind === 'replicates' && (
                  <Field label="A cell of replicates shows">
                    <SelectInput<HeatmapOptions['summary']>
                      value={o.summary}
                      options={[
                        { value: 'mean', label: 'The mean' },
                        { value: 'median', label: 'The median' },
                      ]}
                      onChange={(v) => set('Heat map summary', { summary: v })}
                    />
                  </Field>
                )}
                <Field label="Normalise" hint="Rescale each row or each column before colouring">
                  <SelectInput<HeatmapOptions['normalise']>
                    value={o.normalise}
                    options={[
                      { value: 'none', label: 'No' },
                      { value: 'row', label: 'Each row' },
                      { value: 'column', label: 'Each column' },
                    ]}
                    onChange={(v) => set('Heat map normalising', { normalise: v })}
                  />
                </Field>
                <Field label="Method">
                  <SelectInput<HeatmapOptions['method']>
                    value={o.method}
                    disabled={!normalised}
                    options={[
                      { value: 'zscore', label: 'Z-score' },
                      { value: 'minmax', label: 'Minimum to maximum (0 to 1)' },
                      { value: 'centre', label: 'Subtract the mean' },
                    ]}
                    onChange={(v) => set('Heat map normalising method', { method: v })}
                  />
                </Field>
                <Field label="Swap rows and columns">
                  <Check checked={o.transpose} onChange={(v) => set('Swap rows and columns', { transpose: v })} />
                </Field>
              </GroupBox>

              <GroupBox title="Cells">
                <NumField label="Space between cells" unit="pt" value={o.cellGapPt} min={HEAT_LIMITS.cellGapPt.min} max={HEAT_LIMITS.cellGapPt.max} onCommit={(v) => set('Space between cells', { cellGapPt: v }, 'heat:gap')} />
                <Field label="Numbers in the cells">
                  <Check checked={o.showValues} onChange={(v) => set('Numbers in the cells', { showValues: v })} />
                </Field>
                <OptionalNumField label="Decimals" hint="Auto: three significant digits" value={o.decimals} autoValue={2} validate={(v) => (Number.isInteger(v) && v >= 0 && v <= HEAT_LIMITS.decimals.max ? null : `A whole number from 0 to ${HEAT_LIMITS.decimals.max}.`)} onCommit={(v) => set('Cell decimals', { decimals: v }, 'heat:decimals')} />
                <Field label="Row labels">
                  <Check checked={chart.yAxis.visible} onChange={(v) => run('Row labels', patchAxis(chart.id, 'yAxis', { visible: v }))} />
                </Field>
                <Field label="Column labels">
                  <Check checked={chart.xAxis.visible} onChange={(v) => run('Column labels', patchAxis(chart.id, 'xAxis', { visible: v }))} />
                </Field>
              </GroupBox>
            </div>
          )}
          {section === 'text' && <TextSections chart={chart} groups={table.groups} yName="Rows" dual={false} />}
          {section === 'layout' && <DimensionsSection chart={chart} />}
        </div>
      )}
      {tab === 'annotations' && <AnnotationsTab chart={chart} />}
    </aside>
  );
}
