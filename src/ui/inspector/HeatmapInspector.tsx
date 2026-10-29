import { useEffect, useState } from 'react';
import { chartTypesFor } from '../../model/graph/chartTypes';
import { editScale, paletteColour, seedCustom } from '../../chart/heatmap/heatColours';
import { HEAT_LIMITS, HEAT_MARKS, HEAT_PALETTE_GROUPS, HEAT_STATISTICS, isDiverging } from '../../model/options/heatmapOptions';
import { GroupedSelectField } from './GroupedSelect';
import type { Chart, ChartType, DataTable, HeatmapOptions } from '../../model/types';
import { useApp } from '../../state/AppContext';
import { patchAxis, patchLook, setChartType } from '../../state/commands';
import { Check, ColorInput, Field, FieldInput, GroupBox, NumField, OptionalNumField, SectionBar, SelectInput, TabBar, TextInput } from './common/controls';
import { SECTIONS as ALL_SECTIONS, TABS } from './common/nav';
import { LayersSection } from './sections/LayersSection';
import { AnnotationsTab, DimensionsSection, TextSections } from './sections/SharedSections';
import type { AppearanceSection, InspectorTab } from '../../state/inspectorNav';

/** The colours of the scale at 16 even positions, as the stops of a CSS gradient (the scale as the cells show it, reversed or not). */
const previewColours = (o: HeatmapOptions): string => Array.from({ length: 16 }, (_, i) => paletteColour(o.palette, i / 15, o.reverse, o.customColours)).join(', ');

const wholeIn = (lim: { min: number; max: number }) => (v: number) => (Number.isInteger(v) && v >= lim.min && v <= lim.max ? null : `A whole number from ${lim.min} to ${lim.max}.`);
const sizeIn = (v: number) => (v >= HEAT_LIMITS.cellPt.min && v <= HEAT_LIMITS.cellPt.max ? null : `From ${HEAT_LIMITS.cellPt.min} to ${HEAT_LIMITS.cellPt.max} pt.`);

/** The edges of the colour intervals as a list of numbers, typed with commas and set when the box is left; a text that is not numbers is refused. */
function EdgesField({ value, onCommit }: { value: number[]; onCommit: (v: number[]) => void }) {
  const shown = value.join(', ');
  const [text, setText] = useState(shown);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) {
      setText(shown);
      setError(null);
    }
  }, [shown, focused]);
  const commit = () => {
    const numbers = text.split(/[;,\s]+/).filter((x) => x !== '').map(Number);
    if (numbers.some((n) => !Number.isFinite(n))) return setError('Enter numbers separated by commas.');
    if (numbers.length > HEAT_LIMITS.steps.max - 1) return setError(`At most ${HEAT_LIMITS.steps.max - 1} edges.`);
    setError(null);
    onCommit([...new Set(numbers)].sort((a, b) => a - b));
  };
  return (
    <Field label="Interval edges" hint="Colour intervals with edges you choose, for example 2, 5, 10; they replace the equal steps" error={error}>
      <FieldInput
        ariaLabel="Interval edges"
        className={error ? 'invalid' : ''}
        placeholder="None"
        value={text}
        onFocus={() => setFocused(true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
    </Field>
  );
}

function MarkField({ label, value, onChange }: { label: string; value: HeatmapOptions['missingMark']; onChange: (v: HeatmapOptions['missingMark']) => void }) {
  return (
    <Field label={label} hint="Drawn over cells of this kind, in the colour of the text on them">
      <SelectInput<HeatmapOptions['missingMark']> value={value} options={HEAT_MARKS.map(({ value: v, label: l }) => ({ value: v, label: l }))} onChange={onChange} />
    </Field>
  );
}

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
  const diverging = isDiverging(o);
  const normalised = o.normalise !== 'none';
  // The colour inputs show the scale as drawn. Editing one turns a gradient into the own scale first, in the same patch (one undo step).
  const drawn = (t: number) => paletteColour(o.palette, t, o.reverse, o.customColours);
  const edit = (slot: 'low' | 'mid' | 'high', colour: string | null) => set('Heat map colours', editScale(o, slot, colour), o.palette === 'custom' ? `heat:colour:${slot}` : undefined);
  // Choosing Custom from a gradient copies the scale on screen; while the scale is already custom nothing changes.
  const choose = (v: HeatmapOptions['palette']) => {
    if (v !== 'custom') set('Heat map colours', { palette: v });
    else if (o.palette !== 'custom') set('Heat map colours', seedCustom(o, diverging));
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
                  <SelectInput<ChartType> value={chart.type} options={chartTypesFor('grouped').map((c) => ({ value: c.type, label: c.label }))} onChange={(t) => run('Change graph type', setChartType(chart.id, t))} />
                </Field>
              </GroupBox>
              <LayersSection chart={chart} table={table} />

              <GroupBox title="Colours">
                <GroupedSelectField<HeatmapOptions['palette']>
                  label="Scale"
                  value={o.palette}
                  groups={HEAT_PALETTE_GROUPS}
                  onChange={choose}
                  after={<span aria-hidden="true" style={{ flex: '0 0 56px', height: 14, border: '1px solid #9aa3ab', background: `linear-gradient(to right, ${previewColours(o)})` }} />}
                />
                <Field label="Low">
                  <ColorInput value={drawn(0)} ariaLabel="Low colour of the scale" onChange={(v) => edit('low', v)} />
                </Field>
                <Field label="Middle colour" hint="A colour in the middle, at the middle colour value">
                  <Check checked={diverging} onChange={(on) => edit('mid', on ? drawn(0.5) : null)} />
                </Field>
                {diverging && (
                  <Field label="Middle">
                    <ColorInput value={drawn(0.5)} ariaLabel="Middle colour of the scale" onChange={(v) => edit('mid', v)} />
                  </Field>
                )}
                <Field label="High">
                  <ColorInput value={drawn(1)} ariaLabel="High colour of the scale" onChange={(v) => edit('high', v)} />
                </Field>
                <Field label="Reverse the colours">
                  <Check checked={o.reverse} onChange={(v) => set('Reverse colours', { reverse: v })} />
                </Field>
                <OptionalNumField label="Lowest value" hint="Auto: the smallest value" value={o.min} autoValue={0} validate={(v) => (o.max !== null && v >= o.max ? 'Must be below the highest value.' : null)} onCommit={(v) => set('Lowest colour value', { min: v }, 'heat:min')} />
                <OptionalNumField label="Highest value" hint="Auto: the largest value" value={o.max} autoValue={1} validate={(v) => (o.min !== null && v <= o.min ? 'Must be above the lowest value.' : null)} onCommit={(v) => set('Highest colour value', { max: v }, 'heat:max')} />
                {diverging && <OptionalNumField label="Middle colour at" hint="Auto: the middle of the range, or 0 for z-scores and centred values" value={o.centre} autoValue={0} onCommit={(v) => set('Middle colour value', { centre: v }, 'heat:centre')} />}
                <OptionalNumField label="Colour steps" hint="Auto: a continuous scale; or this many equal intervals, each one colour" value={o.steps} autoValue={5} validate={wholeIn(HEAT_LIMITS.steps)} onCommit={(v) => set('Colour steps', { steps: v }, 'heat:steps')} />
                <EdgesField value={o.breaks} onCommit={(v) => set('Interval edges', { breaks: v })} />
                <Field label="Missing cells">
                  <ColorInput value={o.missingColour} ariaLabel="Colour of missing cells" onChange={(v) => set('Missing cell colour', { missingColour: v })} />
                </Field>
                <MarkField label="Missing cells mark" value={o.missingMark} onChange={(v) => set('Missing cell mark', { missingMark: v })} />
                <Field label="Excluded cells own colour" hint="Cells whose values are all excluded; off: the colour of missing cells">
                  <Check checked={o.excludedColour !== null} onChange={(on) => set('Excluded cell colour', { excludedColour: on ? o.missingColour : null })} />
                </Field>
                {o.excludedColour !== null && (
                  <Field label="Excluded cells">
                    <ColorInput value={o.excludedColour} ariaLabel="Colour of excluded cells" onChange={(v) => set('Excluded cell colour', { excludedColour: v })} />
                  </Field>
                )}
                <MarkField label="Excluded cells mark" value={o.excludedMark} onChange={(v) => set('Excluded cell mark', { excludedMark: v })} />
                <Field label="Out-of-range own colour" hint="Cells beyond the lowest or highest value; off: the end colour of the scale">
                  <Check checked={o.outsideColour !== null} onChange={(on) => set('Out-of-range colour', { outsideColour: on ? drawn(1) : null })} />
                </Field>
                {o.outsideColour !== null && (
                  <Field label="Out-of-range cells">
                    <ColorInput value={o.outsideColour} ariaLabel="Colour of cells outside the range" onChange={(v) => set('Out-of-range colour', { outsideColour: v })} />
                  </Field>
                )}
                <MarkField label="Out-of-range mark" value={o.outsideMark} onChange={(v) => set('Out-of-range mark', { outsideMark: v })} />
              </GroupBox>

              <GroupBox title="Colour bar">
                <Field label="Colour bar">
                  <Check checked={o.colourbar} onChange={(v) => set('Colour bar', { colourbar: v })} />
                </Field>
                {o.colourbar && (
                  <>
                    <NumField label="Width" unit="pt" value={o.barWidthPt} min={HEAT_LIMITS.barWidthPt.min} max={HEAT_LIMITS.barWidthPt.max} onCommit={(v) => set('Colour bar width', { barWidthPt: v }, 'heat:barWidth')} />
                    <NumField label="Length" unit="%" hint="Of the height of the cells" value={o.barLengthPct} min={HEAT_LIMITS.barLengthPct.min} max={HEAT_LIMITS.barLengthPct.max} onCommit={(v) => set('Colour bar length', { barLengthPct: v }, 'heat:barLength')} />
                    <NumField label="Ticks" hint="About this many numbers; a scale in intervals has one at each edge" value={o.barTicks} min={HEAT_LIMITS.barTicks.min} max={HEAT_LIMITS.barTicks.max} slider={false} validate={wholeIn(HEAT_LIMITS.barTicks)} onCommit={(v) => set('Colour bar ticks', { barTicks: v }, 'heat:barTicks')} />
                    <Field label="Title">
                      <Check checked={o.barTitle !== ''} onChange={(on) => set('Colour bar title', { barTitle: on ? null : '' })} />
                    </Field>
                    {o.barTitle !== '' && (
                      <Field label="Title text" hint="Empty: named by what the colours show">
                        <TextInput value={o.barTitle ?? ''} placeholder="Automatic" ariaLabel="Colour bar title" onChange={(v) => set('Colour bar title', { barTitle: v === '' ? null : v }, 'heat:barTitle')} />
                      </Field>
                    )}
                  </>
                )}
              </GroupBox>

              <GroupBox title="Values">
                {(table.layout?.kind === 'replicates' || table.layout?.kind === 'summary') && (
                  <Field label="A cell shows" hint="Entered values give the mean or median as entered; an SD or SEM only when it was entered">
                    <SelectInput<HeatmapOptions['summary']>
                      value={o.summary}
                      options={HEAT_STATISTICS.map(({ value, label }) => ({ value, label }))}
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
                <OptionalNumField label="Cell width" hint="Auto: the cells fill the width; a size too large for it is held at the width" value={o.cellWidthPt} autoValue={40} validate={sizeIn} onCommit={(v) => set('Cell width', { cellWidthPt: v }, 'heat:cellW')} />
                <OptionalNumField label="Cell height" hint="Auto: the cells fill the height" value={o.cellHeightPt} autoValue={20} validate={sizeIn} onCommit={(v) => set('Cell height', { cellHeightPt: v }, 'heat:cellH')} />
                <OptionalNumField label="Rows in a group" hint="Auto: no groups; else extra space after this many rows" value={o.rowGroupSize} autoValue={5} validate={wholeIn(HEAT_LIMITS.groupSize)} onCommit={(v) => set('Row groups', { rowGroupSize: v }, 'heat:rowGroup')} />
                <OptionalNumField label="Columns in a group" hint="Auto: no groups; else extra space after this many columns" value={o.colGroupSize} autoValue={5} validate={wholeIn(HEAT_LIMITS.groupSize)} onCommit={(v) => set('Column groups', { colGroupSize: v }, 'heat:colGroup')} />
                <NumField label="Space between groups" unit="pt" value={o.groupGapPt} min={HEAT_LIMITS.groupGapPt.min} max={HEAT_LIMITS.groupGapPt.max} disabled={o.rowGroupSize === null && o.colGroupSize === null} onCommit={(v) => set('Space between groups', { groupGapPt: v }, 'heat:groupGap')} />
                <Field label="Numbers in the cells">
                  <Check checked={o.showValues} onChange={(v) => set('Numbers in the cells', { showValues: v })} />
                </Field>
                <OptionalNumField label="Decimals" hint="Auto: three significant digits" value={o.decimals} autoValue={2} validate={(v) => (Number.isInteger(v) && v >= 0 && v <= HEAT_LIMITS.decimals.max ? null : `A whole number from 0 to ${HEAT_LIMITS.decimals.max}.`)} onCommit={(v) => set('Cell decimals', { decimals: v }, 'heat:decimals')} />
                <Field label="Row labels">
                  <Check checked={chart.yAxis.visible} onChange={(v) => run('Row labels', patchAxis(chart.id, 'yAxis', { visible: v }))} />
                </Field>
                <NumField label="Row label every" hint="Write every this many-th row label" value={o.rowLabelEvery} min={HEAT_LIMITS.labelEvery.min} max={HEAT_LIMITS.labelEvery.max} slider={false} validate={wholeIn(HEAT_LIMITS.labelEvery)} onCommit={(v) => set('Row label spacing', { rowLabelEvery: v }, 'heat:rowEvery')} />
                <Field label="Column labels">
                  <Check checked={chart.xAxis.visible} onChange={(v) => run('Column labels', patchAxis(chart.id, 'xAxis', { visible: v }))} />
                </Field>
                <NumField label="Column label every" hint="Write every this many-th column label" value={o.colLabelEvery} min={HEAT_LIMITS.labelEvery.min} max={HEAT_LIMITS.labelEvery.max} slider={false} validate={wholeIn(HEAT_LIMITS.labelEvery)} onCommit={(v) => set('Column label spacing', { colLabelEvery: v }, 'heat:colEvery')} />
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
