import { FRAME_STYLES, GRID_LIMITS, LINE_STYLES } from '../../model/look';
import type { BarLabelMode, Chart, FrameStyle, LineStyle } from '../../model/types';
import { useApp } from '../../state/AppContext';
import { patchLook } from '../../state/commands';
import { AUTO_BAR_GAP_PCT, AUTO_BAR_OUTER_PCT, BAR_LIMITS } from '../../model/columnOptions';
import { BAR_LABEL_MODES } from '../../model/columnOptions';
import { BAR_LABEL_LIMITS } from '../../chart/barLabels';
import { patchBarLabels, patchBars, patchBothAxes } from '../../state/commands';
import { Check, ColorInput, Field, NumField, OptionalNumField, Section, SelectInput, TextInput } from './controls';

/** A colour that can also be "none": the colour box is greyed out while it is. */
function OptionalColour({ label, value, fallback, onChange }: { label: string; value: string | null; fallback: string; onChange: (v: string | null) => void }) {
  return (
    <Field label={label}>
      <span className="inline-controls">
        <ColorInput value={value ?? fallback} disabled={value === null} ariaLabel={label} onChange={onChange} />
        <label className="inline-check">
          <Check checked={value === null} onChange={(none) => onChange(none ? null : fallback)} ariaLabel={`${label}: none`} /> None
        </label>
      </span>
    </Field>
  );
}

/** Frame, axis colour, and the colours of the plotting region and of the whole chart (spec 5.1, 6.2). */
function FrameAndColours({ chart }: { chart: Chart }) {
  const { run } = useApp();
  return (
    <Section title="Frame and colours">
      <Field label="Frame" hint="A box round the plotting region">
        <SelectInput<FrameStyle> value={chart.frame} options={FRAME_STYLES.map((f) => ({ value: f.value, label: f.label }))} onChange={(v) => run('Frame', patchLook(chart.id, { frame: v }))} />
      </Field>
      <Field label="Axis colour">
        <ColorInput value={chart.axisColor} ariaLabel="Axis colour" onChange={(v) => run('Axis colour', patchLook(chart.id, { axisColor: v }))} />
      </Field>
      <OptionalColour label="Plotting area" value={chart.plotColor} fallback="#ffffff" onChange={(v) => run('Plotting area colour', patchLook(chart.id, { plotColor: v }))} />
      <OptionalColour label="Page background" value={chart.pageColor} fallback="#ffffff" onChange={(v) => run('Page background colour', patchLook(chart.id, { pageColor: v }))} />
      <div className="muted small">With no page background a PNG export is transparent.</div>
    </Section>
  );
}

/** Colour, thickness and pattern of the major and the minor gridlines; each axis switches its own on in its section. */
function GridStyleSection({ chart }: { chart: Chart }) {
  const { run } = useApp();
  const g = chart.grid;
  const set = (label: string, grid: Partial<Chart['grid']>, key?: string) => run(label, patchLook(chart.id, { grid }), key);
  const styles = LINE_STYLES.map((s) => ({ value: s.value, label: s.label }));
  return (
    <Section title="Gridline style" defaultOpen={false}>
      <Field label="Major colour">
        <ColorInput value={g.color} ariaLabel="Major gridline colour" onChange={(v) => set('Major gridline colour', { color: v })} />
      </Field>
      <NumField label="Major thickness" unit="pt" value={g.widthPt} min={GRID_LIMITS.widthPt.min} max={GRID_LIMITS.widthPt.max} onCommit={(v) => set('Major gridline thickness', { widthPt: v }, 'grid:w')} />
      <Field label="Major pattern">
        <SelectInput<LineStyle> value={g.style} options={styles} onChange={(v) => set('Major gridline pattern', { style: v })} />
      </Field>
      <Field label="Minor colour">
        <ColorInput value={g.minorColor} ariaLabel="Minor gridline colour" onChange={(v) => set('Minor gridline colour', { minorColor: v })} />
      </Field>
      <NumField label="Minor thickness" unit="pt" value={g.minorWidthPt} min={GRID_LIMITS.widthPt.min} max={GRID_LIMITS.widthPt.max} onCommit={(v) => set('Minor gridline thickness', { minorWidthPt: v }, 'grid:mw')} />
      <Field label="Minor pattern">
        <SelectInput<LineStyle> value={g.minorStyle} options={styles} onChange={(v) => set('Minor gridline pattern', { minorStyle: v })} />
      </Field>
    </Section>
  );
}

/** Frame section: the axis lines, the frame round the plot, colours and gridline style. */
export function FrameSection({ chart, dual, origin = 'y' }: { chart: Chart; dual: boolean; origin?: 'xy' | 'y' | 'none' }) {
  const { run } = useApp();
  const set = (patch: Partial<Chart['origin']>, label: string, key: string) => run(label, patchLook(chart.id, { origin: { ...chart.origin, ...patch } }), key);
  return (
    <div>
      {origin !== 'none' && (
        <Section title="Origin">
          {origin === 'xy' && (
            <OptionalNumField label="Y axis crosses X at" hint="Auto: the left edge. The numbers stay at the edge." value={chart.origin.x} autoValue={0} onCommit={(v) => set({ x: v }, 'Origin X', 'origin:x')} />
          )}
          <OptionalNumField label={origin === 'xy' ? 'X axis crosses Y at' : 'Category axis crosses Y at'} hint="Auto: the low edge. A value outside the axis keeps the edge. The numbers stay at the edge." value={chart.origin.y} autoValue={0} onCommit={(v) => set({ y: v }, 'Origin Y', 'origin:y')} />
        </Section>
      )}
      <Section title="Axis lines">
        <NumField label="Axis line thickness" unit="pt" value={chart.yAxis.lineWidthPt} min={0} max={10} onCommit={(v) => run('Axis line thickness', patchBothAxes(chart.id, { lineWidthPt: v }), 'axis:lw')} />
        {dual && <div className="muted small">Line thickness applies to both Y axes.</div>}
      </Section>
      <FrameAndColours chart={chart} />
      <GridStyleSection chart={chart} />
    </div>
  );
}

/**
 * Where the columns of a column chart sit: the space between them, before the first and after the last (percent of a
 * column's width, Auto = the usual layout), and where the bars begin.
 */
export function ColumnLayoutSection({ chart, spacing, baseline }: { chart: Chart; spacing: boolean; baseline: boolean }) {
  const { run } = useApp();
  const b = chart.bars;
  const { min, max } = BAR_LIMITS.spacingPct;
  const pct = (v: number) => (v >= min && v <= max ? null : `Between ${min} and ${max}.`);
  return (
    <Section title="Columns">
      {spacing && (
        <>
          <OptionalNumField label="Space between columns (%)" hint="Percent of a column's width" value={b.gapPct} autoValue={AUTO_BAR_GAP_PCT} validate={pct} onCommit={(v) => run('Space between columns', patchBars(chart.id, { gapPct: v }), 'bars:gap')} />
          <OptionalNumField label="Before the first column (%)" value={b.beforePct} autoValue={AUTO_BAR_OUTER_PCT} validate={pct} onCommit={(v) => run('Space before the first column', patchBars(chart.id, { beforePct: v }), 'bars:before')} />
          <OptionalNumField label="After the last column (%)" value={b.afterPct} autoValue={AUTO_BAR_OUTER_PCT} validate={pct} onCommit={(v) => run('Space after the last column', patchBars(chart.id, { afterPct: v }), 'bars:after')} />
        </>
      )}
      {baseline && (
        <OptionalNumField label="Bars begin at" hint="Auto: bars start at 0, or at the nearest edge of the axis when 0 is outside it" value={b.baseline} autoValue={0} onCommit={(v) => run('Bar baseline', patchBars(chart.id, { baseline: v }), 'bars:base')} />
      )}
      {!spacing && !baseline && <div className="muted small">This chart has no columns to lay out.</div>}
    </Section>
  );
}

const LABEL_DECIMALS = ['auto', '0', '1', '2', '3', '4', '5', '6'] as const;

/** Chart types that can write a value or a sample size above their bars. */
export const hasBarLabels = (type: Chart['type']): boolean => type === 'bar' || type === 'scatter' || type === 'mean' || type === 'groupedBar' || type === 'contingencyBars';

/** Labels above the bars: the plotted value or the sample size, with the number format and the text style. */
export function BarLabelSection({ chart }: { chart: Chart }) {
  const { run } = useApp();
  const l = chart.barLabels;
  const set = (label: string, patch: Partial<Chart['barLabels']>, key?: string) => run(label, patchBarLabels(chart.id, patch), key);
  const off = l.show === 'none';
  return (
    <Section title="Labels above the bars">
      <Field label="Show" hint="The plotted value (mean, median...) or the number of values behind the bar">
        <SelectInput<BarLabelMode> value={l.show} options={BAR_LABEL_MODES.map((m) => ({ value: m.value, label: m.label }))} onChange={(v) => set('Bar labels', { show: v })} />
      </Field>
      <Field label="Decimals">
        <SelectInput<(typeof LABEL_DECIMALS)[number]>
          value={l.decimals === null || l.decimals > 6 ? 'auto' : (String(l.decimals) as (typeof LABEL_DECIMALS)[number])}
          disabled={l.show !== 'value'}
          options={LABEL_DECIMALS.map((d) => ({ value: d, label: d === 'auto' ? 'Auto' : d }))}
          onChange={(v) => set('Bar label decimals', { decimals: v === 'auto' ? null : Number(v) })}
        />
      </Field>
      <Field label="Thousands separator">
        <Check checked={l.thousands} disabled={off} onChange={(v) => set('Bar label thousands', { thousands: v })} />
      </Field>
      <Field label="Prefix">
        <TextInput value={l.prefix} disabled={off} onChange={(v) => set('Bar label prefix', { prefix: v }, 'barlabel:pre')} />
      </Field>
      <Field label="Suffix">
        <TextInput value={l.suffix} disabled={off} onChange={(v) => set('Bar label suffix', { suffix: v }, 'barlabel:suf')} />
      </Field>
      <NumField label="Size" unit="pt" value={l.sizePt} min={BAR_LABEL_LIMITS.sizePt.min} max={BAR_LABEL_LIMITS.sizePt.max} disabled={off} onCommit={(v) => set('Bar label size', { sizePt: v }, 'barlabel:size')} />
      <Field label="Colour">
        <span className="inline-controls">
          <ColorInput value={l.color ?? chart.textColor} disabled={off || l.color === null} ariaLabel="Bar label colour" onChange={(v) => set('Bar label colour', { color: v })} />
          <label className="inline-check">
            <Check checked={l.color === null} disabled={off} onChange={(auto) => set('Bar label colour', { color: auto ? null : chart.textColor })} ariaLabel="Bar label colour: same as the text" /> Auto
          </label>
        </span>
      </Field>
    </Section>
  );
}

/** Direction of a column chart: up from the category axis, or across from it. */
export function DirectionSection({ chart }: { chart: Chart }) {
  const { run } = useApp();
  return (
    <Section title="Direction">
      <Field label="Columns run" hint="Vertical: categories along the bottom. Horizontal: categories down the left and the value axis along the bottom.">
        <SelectInput<'vertical' | 'horizontal'>
          value={chart.orientation}
          options={[
            { value: 'vertical', label: 'Vertical' },
            { value: 'horizontal', label: 'Horizontal' },
          ]}
          onChange={(v) => run('Direction', patchLook(chart.id, { orientation: v }))}
        />
      </Field>
      {chart.orientation === 'horizontal' && <div className="muted small">The value axis uses the Y axis settings; the right axis and point labels are not available on horizontal charts yet.</div>}
    </Section>
  );
}
