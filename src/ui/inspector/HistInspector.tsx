import { useMemo, useState } from 'react';
import { buildHistModel } from '../../chart/histModel';
import { chartTypesFor } from '../../model/chartTypes';
import { defaultYTitle, FREQUENCIES, HISTOGRAM_LIMITS } from '../../model/histogramOptions';
import { resolveStyle } from '../../model/style';
import type { Chart, ChartType, DataTable, HistogramOptions } from '../../model/types';
import { useApp } from '../../state/AppContext';
import { composeCommands, patchAxis, patchChart, patchLook, patchStyle, setChartType } from '../../state/commands';
import { Check, ColorInput, Field, GroupBox, NumField, OptionalNumField, Section, SectionBar, SelectInput, TabBar } from './controls';
import { FrameSection } from './LookControls';
import { SECTIONS, TABS, type AppearanceSection, type InspectorTab } from './nav';
import { AnnotationsTab, DimensionsSection, LegendSection, OnThisGraph, PaletteField, TextSections } from './SharedSections';
import { AxisLimits } from './XyInspector';

/** The formatting panel of histograms and cumulative distributions of a column table. */
export function HistInspector({ chart, table }: { chart: Chart; table: DataTable }) {
  const { run, inspectorNav } = useApp();
  const [tab, setTab] = useState<InspectorTab>('appearance');
  const [section, setSection] = useState<AppearanceSection>('style');
  const [seenNav, setSeenNav] = useState(inspectorNav.n);
  if (seenNav !== inspectorNav.n) {
    setSeenNav(inspectorNav.n);
    const t = inspectorNav.target;
    if (t) {
      setTab(t.tab);
      if (t.section) setSection(t.section);
    }
  }
  const model = useMemo(() => buildHistModel(chart, table), [chart, table]);
  const layer = chart.layers[0];
  const o = chart.histogram;
  const histogram = chart.type === 'histogram';
  // The Y axis title follows what the heights are, as long as it is still the title the chart made for itself.
  const set = (label: string, patch: Partial<HistogramOptions>, key?: string) => {
    const next = { ...o, ...patch };
    const type = chart.type === 'ecdf' ? 'ecdf' : 'histogram';
    const follow = chart.yAxis.title === defaultYTitle(type, o) && defaultYTitle(type, next) !== chart.yAxis.title;
    const change = patchLook(chart.id, { histogram: next });
    run(label, follow ? composeCommands(change, patchAxis(chart.id, 'yAxis', { title: defaultYTitle(type, next) })) : change, key);
  };
  const recolour = (groupId: string, patch: Parameters<typeof patchStyle>[2]) => {
    const command = chart.paletteId !== null ? composeCommands(patchStyle(chart.id, groupId, patch), patchChart(chart.id, { paletteId: null })) : patchStyle(chart.id, groupId, patch);
    run('Change style', command, `style:${groupId}:${Object.keys(patch).join(',')}`);
  };
  const rows = table.groups.map((g, i) => ({ g, style: resolveStyle(chart, layer, { id: g.id, paletteIndex: g.paletteIndex ?? i }) }));

  return (
    <aside className="inspector" aria-label="Graph formatting">
      <TabBar tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'appearance' && (
        <div>
          <SectionBar sections={SECTIONS} value={section} onChange={setSection} />
          {section === 'style' && (
            <div className="tab-body">
              <GroupBox title="Style">
                <Field label="Appearance">
                  <SelectInput<ChartType> value={chart.type} options={chartTypesFor('column').map((c) => ({ value: c.type, label: c.label }))} onChange={(t) => run('Change graph type', setChartType(chart.id, t))} />
                </Field>
                <PaletteField chart={chart} hint="Gives the data sets coordinated colours in order. The colours below still apply on top." />
              </GroupBox>

              {histogram ? (
                <GroupBox title="Histogram">
                  <Field label="Bins" hint="Automatic: about log2(n) + 1 bins of a round width">
                    <SelectInput<HistogramOptions['binning']>
                      value={o.binning}
                      options={[
                        { value: 'auto', label: 'Automatic' },
                        { value: 'width', label: 'Set the width' },
                      ]}
                      onChange={(v) => set('Histogram bins', { binning: v, binWidth: v === 'width' && o.binWidth === null ? (model.x.ticks.length > 1 ? model.x.ticks[1] - model.x.ticks[0] : 1) : o.binWidth })}
                    />
                  </Field>
                  {o.binning === 'width' && (
                    <NumField label="Bin width" value={o.binWidth ?? 1} min={HISTOGRAM_LIMITS.binWidth.min} slider={false} onCommit={(v) => set('Bin width', { binWidth: v }, 'hist:width')} />
                  )}
                  <OptionalNumField label="First bin edge at" hint="Auto: bins line up with multiples of the width" value={o.firstEdge} autoValue={0} onCommit={(v) => set('First bin edge', { firstEdge: v }, 'hist:first')} />
                  <Field label="Height shows">
                    <SelectInput<HistogramOptions['frequency']> value={o.frequency} options={FREQUENCIES.map((f) => ({ value: f.value, label: f.label }))} onChange={(v) => set('Histogram height', { frequency: v })} />
                  </Field>
                  <Field label="Cumulative">
                    <SelectInput<HistogramOptions['cumulative']>
                      value={o.cumulative}
                      options={[
                        { value: 'off', label: 'Off' },
                        { value: 'ascending', label: 'Upwards' },
                        { value: 'descending', label: 'Downwards' },
                      ]}
                      onChange={(v) => set('Cumulative histogram', { cumulative: v })}
                    />
                  </Field>
                  <Field label="Several data sets">
                    <SelectInput<HistogramOptions['arrangement']>
                      value={o.arrangement}
                      options={[
                        { value: 'overlay', label: 'Over each other' },
                        { value: 'side', label: 'Side by side in each bin' },
                      ]}
                      onChange={(v) => set('Histogram arrangement', { arrangement: v })}
                    />
                  </Field>
                  <NumField label="Space between bars" unit="%" hint="Percent of the width of a bin" value={o.gapPct} min={HISTOGRAM_LIMITS.gapPct.min} max={HISTOGRAM_LIMITS.gapPct.max} slider={false} onCommit={(v) => set('Space between bars', { gapPct: v }, 'hist:gap')} />
                </GroupBox>
              ) : (
                <GroupBox title="Cumulative distribution">
                  <Field label="Counts the values">
                    <SelectInput<HistogramOptions['ecdfDirection']>
                      value={o.ecdfDirection}
                      options={[
                        { value: 'atOrBelow', label: 'At or below each value' },
                        { value: 'above', label: 'Above each value' },
                      ]}
                      onChange={(v) => set('Distribution direction', { ecdfDirection: v })}
                    />
                  </Field>
                  <Field label="Shown as">
                    <SelectInput<HistogramOptions['ecdfUnits']>
                      value={o.ecdfUnits}
                      options={[
                        { value: 'fraction', label: 'Fraction' },
                        { value: 'percent', label: 'Percent' },
                        { value: 'count', label: 'Count' },
                      ]}
                      onChange={(v) => set('Distribution units', { ecdfUnits: v })}
                    />
                  </Field>
                  <Field label="Symbols at the steps">
                    <Check checked={o.ecdfSymbols} onChange={(v) => set('Distribution symbols', { ecdfSymbols: v })} />
                  </Field>
                  <Field label="Carry to the ends of the axis">
                    <Check checked={o.ecdfExtend} onChange={(v) => set('Distribution tails', { ecdfExtend: v })} />
                  </Field>
                </GroupBox>
              )}

              <GroupBox title="Data sets">
                {rows.map(({ g, style }) => (
                  <Field key={g.id} label={g.name}>
                    <ColorInput
                      value={histogram ? style.barFill : style.lineColor}
                      ariaLabel={`Colour of ${g.name}`}
                      onChange={(v) => recolour(g.id, histogram ? { barFill: v } : { lineColor: v, symbolColor: v, symbolBorderColor: v })}
                    />
                  </Field>
                ))}
                {histogram ? (
                  <>
                    <NumField label="Border" unit="pt" value={rows[0]?.style.barBorderWidthPt ?? 0} min={0} max={40} onCommit={(v) => run('Change style', patchStyle(chart.id, 'all', { barBorderWidthPt: v }), 'style:all:border')} />
                    <Field label="Border color">
                      <ColorInput value={rows[0]?.style.barBorderColor ?? '#000000'} ariaLabel="Border colour" onChange={(v) => run('Change style', patchStyle(chart.id, 'all', { barBorderColor: v }), 'style:all:bordercolor')} />
                    </Field>
                    <NumField label="Opacity" value={rows[0]?.style.barOpacity ?? 1} min={0} max={1} onCommit={(v) => run('Change style', patchStyle(chart.id, 'all', { barOpacity: v }), 'style:all:opacity')} />
                  </>
                ) : (
                  <NumField label="Line thickness" unit="pt" value={rows[0]?.style.lineWidthPt ?? 1} min={0.2} max={40} onCommit={(v) => run('Change style', patchStyle(chart.id, 'all', { lineWidthPt: v }), 'style:all:line')} />
                )}
              </GroupBox>
            </div>
          )}
          {section === 'axes' && (
            <div>
              <Section title="X axis (values)">
                <Field label="Show X axis">
                  <Check checked={chart.xAxis.visible} onChange={(v) => run('Show X axis', patchAxis(chart.id, 'xAxis', { visible: v }))} />
                </Field>
                <AxisLimits chart={chart} which="xAxis" scale={model.x} name="X" canScale={false} canReverse={false} />
              </Section>
              <Section title="Y axis">
                <Field label="Show Y axis">
                  <Check checked={chart.yAxis.visible} onChange={(v) => run('Show Y axis', patchAxis(chart.id, 'yAxis', { visible: v }))} />
                </Field>
                <AxisLimits chart={chart} which="yAxis" scale={model.y} name="Y" canScale={false} canReverse={false} />
              </Section>
            </div>
          )}
          {section === 'frame' && <FrameSection chart={chart} dual={false} origin="xy" />}
          {section === 'text' && <TextSections chart={chart} groups={table.groups} yName="Y" dual={false} />}
          {section === 'layout' && <DimensionsSection chart={chart} />}
          {section === 'legend' && <LegendSection chart={chart} groups={table.groups} />}
        </div>
      )}
      {tab === 'datasets' && (
        <div className="tab-body">
          <OnThisGraph chart={chart} />
        </div>
      )}
      {tab === 'annotations' && <AnnotationsTab chart={chart} />}
    </aside>
  );
}
