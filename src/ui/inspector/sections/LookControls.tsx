import { FRAME_STYLES, GRID_LIMITS, LINE_STYLES } from '../../../model/graph/look';
import type { ReactNode } from 'react';
import type { BarLabelMode, Chart, ChartStyle, FrameStyle, InsideBarLabel, InsideLabelPosition, LineOrder, LineStyle } from '../../../model/types';
import { useCommands } from '../../../state/AppContext';
import { patchLook, patchBarLabels, patchBars, patchBothAxes } from '../../../state/commands';
import { AUTO_BAR_GAP_PCT, AUTO_BAR_OUTER_PCT, BAR_LIMITS, BAR_LABEL_MODES, INSIDE_LABEL_POSITIONS } from '../../../model/options/columnOptions';
import { BAR_LABEL_LIMITS } from '../../../chart/shared/parts/barLabels';
import { Check, ColorInput, Field, NumField, OptionalNumField, Section, SelectInput, TextInput, type Overridden } from '../common/controls';
import { SymbolPicker } from '../common/SymbolPicker';
import { DIRECTION_HINT } from '../common/summaryUi';
import { SLIDERS } from '../common/sliderRanges';

/** A colour that can also be transparent: the colour box is greyed out while it is. */
function OptionalColour({ label, value, fallback, onChange, hint }: { label: string; value: string | null; fallback: string; onChange: (v: string | null) => void; hint?: string }) {
  return (
    <Field label={label} hint={hint}>
      <span className="inline-controls">
        <ColorInput value={value ?? fallback} disabled={value === null} ariaLabel={label} onChange={onChange} />
        <label className="inline-check">
          <Check checked={value === null} onChange={(none) => onChange(none ? null : fallback)} ariaLabel={`${label}: transparent`} /> Transparent
        </label>
      </span>
    </Field>
  );
}

/** Frame, axis colour, and the colours of the plotting region and of the whole chart (spec 5.1, 6.2). */
function FrameAndColours({ chart }: { chart: Chart }) {
  const { run } = useCommands();
  return (
    <Section title="Frame and colours">
      <Field label="Frame" hint="A box round the plotting region">
        <SelectInput<FrameStyle> value={chart.frame} options={FRAME_STYLES.map((f) => ({ value: f.value, label: f.label }))} onChange={(v) => run('Frame', patchLook(chart.id, { frame: v }))} />
      </Field>
      <Field label="Axis colour">
        <ColorInput value={chart.axisColor} ariaLabel="Axis colour" onChange={(v) => run('Axis colour', patchLook(chart.id, { axisColor: v }))} />
      </Field>
      <NumField {...SLIDERS.fraction} label="Axis opacity" value={chart.axisOpacity} min={0} max={1} onCommit={(v) => run('Axis opacity', patchLook(chart.id, { axisOpacity: v }), 'axis:opacity')} hint="Axis lines, ticks and the frame; 0 = transparent, 1 = opaque" />
      <OptionalColour label="Plotting area" value={chart.plotColor} fallback="#ffffff" onChange={(v) => run('Plotting area colour', patchLook(chart.id, { plotColor: v }))} />
      <OptionalColour label="Page background" value={chart.pageColor} fallback="#ffffff" onChange={(v) => run('Page background colour', patchLook(chart.id, { pageColor: v }))} hint="Transparent: an SVG or PNG export has no background colour (a PDF shows the white of the paper). The default for new graphs is in Settings." />
    </Section>
  );
}

/** Colour, thickness and pattern of the major and the minor gridlines, for both axes at once; each axis switches its own on in its section, so this stands with them (Axes). */
export function GridStyleSection({ chart }: { chart: Chart }) {
  const { run } = useCommands();
  const g = chart.grid;
  const set = (label: string, grid: Partial<Chart['grid']>, key?: string) => run(label, patchLook(chart.id, { grid }), key);
  const styles = LINE_STYLES.map((s) => ({ value: s.value, label: s.label }));
  return (
    <Section title="Gridline style (both axes)" defaultOpen={false}>
      <Field label="Major colour">
        <ColorInput value={g.color} ariaLabel="Major gridline colour" onChange={(v) => set('Major gridline colour', { color: v })} />
      </Field>
      <NumField {...SLIDERS.line} label="Major thickness" unit="pt" value={g.widthPt} min={GRID_LIMITS.widthPt.min} max={GRID_LIMITS.widthPt.max} onCommit={(v) => set('Major gridline thickness', { widthPt: v }, 'grid:w')} />
      <NumField {...SLIDERS.fraction} label="Major opacity" value={g.opacity} min={0} max={1} onCommit={(v) => set('Major gridline opacity', { opacity: v }, 'grid:o')} hint="0 = transparent, 1 = opaque" />
      <Field label="Major pattern">
        <SelectInput<LineStyle> value={g.style} options={styles} onChange={(v) => set('Major gridline pattern', { style: v })} />
      </Field>
      <Field label="Minor colour">
        <ColorInput value={g.minorColor} ariaLabel="Minor gridline colour" onChange={(v) => set('Minor gridline colour', { minorColor: v })} />
      </Field>
      <NumField {...SLIDERS.line} label="Minor thickness" unit="pt" value={g.minorWidthPt} min={GRID_LIMITS.widthPt.min} max={GRID_LIMITS.widthPt.max} onCommit={(v) => set('Minor gridline thickness', { minorWidthPt: v }, 'grid:mw')} />
      <NumField {...SLIDERS.fraction} label="Minor opacity" value={g.minorOpacity} min={0} max={1} onCommit={(v) => set('Minor gridline opacity', { minorOpacity: v }, 'grid:mo')} hint="0 = transparent, 1 = opaque" />
      <Field label="Minor pattern">
        <SelectInput<LineStyle> value={g.minorStyle} options={styles} onChange={(v) => set('Minor gridline pattern', { minorStyle: v })} />
      </Field>
    </Section>
  );
}

/** Frame section: the axis lines, the frame round the plot, colours and gridline style. */
export function FrameSection({ chart, dual, origin = 'y' }: { chart: Chart; dual: boolean; origin?: 'xy' | 'y' | 'none' }) {
  const { run } = useCommands();
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
        <NumField {...SLIDERS.line} label="Axis line thickness" unit="pt" value={chart.yAxis.lineWidthPt} min={0} max={20} onCommit={(v) => run('Axis line thickness', patchBothAxes(chart.id, { lineWidthPt: v }), 'axis:lw')} />
        {dual && <div className="muted small">Line thickness applies to both Y axes.</div>}
      </Section>
      <FrameAndColours chart={chart} />
    </div>
  );
}

/**
 * Where the columns of a column chart sit: the space between them, before the first and after the last (percent of a
 * column's width, Auto = the usual layout), and where the bars begin.
 */
export function ColumnLayoutSection({ chart, spacing, baseline, numericX }: { chart: Chart; spacing: boolean; baseline: boolean; numericX?: boolean }) {
  const { run } = useCommands();
  const b = chart.bars;
  const { min, max } = BAR_LIMITS.spacingPct;
  const pct = (v: number) => (v >= min && v <= max ? null : `Between ${min} and ${max}.`);
  return (
    <Section title={numericX ? 'Bars' : 'Columns'}>
      {spacing && numericX && (
        <OptionalNumField label="Space between bars (%)" hint="Percent of a bar's width. The room of an X is the smallest distance between two X values; several series stand side by side in it." value={b.gapPct} autoValue={AUTO_BAR_GAP_PCT} validate={pct} onCommit={(v) => run('Space between bars', patchBars(chart.id, { gapPct: v }), 'bars:gap')} />
      )}
      {spacing && !numericX && (
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

/** Auto and 0 to 10: the whole range that the setting accepts (a value above the menu would show as Auto). */
const LABEL_DECIMALS = ['auto', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] as const;

/** Chart types that can write a value or a sample size above their bars. */
export const hasBarLabels = (type: Chart['type']): boolean => type === 'bar' || type === 'scatter' || type === 'mean' || type === 'groupedBar' || type === 'contingencyBars';

/** Labels above the bars: the plotted value or the sample size, with the number format and the text style. */
export function BarLabelSection({ chart }: { chart: Chart }) {
  const { run } = useCommands();
  const l = chart.barLabels;
  const set = (label: string, patch: Partial<Chart['barLabels']>, key?: string) => run(label, patchBarLabels(chart.id, patch), key);
  const inside: InsideBarLabel = l.inside ?? { position: 'end', show: 'none', color: null };
  const setInside = (label: string, patch: Partial<InsideBarLabel>) => run(label, patchBarLabels(chart.id, { inside: { ...inside, ...patch } }));
  const insideOff = inside.show === 'none';
  const off = l.show === 'none' && insideOff;
  return (
    <Section title="Labels above the bars">
      <Field label="Show" hint="The plotted value (mean, median...) or the number of values behind the bar">
        <SelectInput<BarLabelMode> value={l.show} options={BAR_LABEL_MODES.map((m) => ({ value: m.value, label: m.label }))} onChange={(v) => set('Bar labels', { show: v })} />
      </Field>
      <Field label="Inside the bar" hint="A second label inside each bar, for example the sample size at the base while the value is above the end. It is left out, with a note, where the bar is too small for the text.">
        <SelectInput<BarLabelMode> value={inside.show} options={BAR_LABEL_MODES.map((m) => ({ value: m.value, label: m.label }))} onChange={(v) => setInside('Bar label inside', { show: v })} />
      </Field>
      <Field label="Inside at">
        <SelectInput<InsideLabelPosition> value={inside.position} disabled={insideOff} options={INSIDE_LABEL_POSITIONS.map((m) => ({ value: m.value, label: m.label }))} onChange={(v) => setInside('Bar label inside position', { position: v })} />
      </Field>
      <Field label="Inside colour" hint="Auto: black or white, whichever reads better on the bar">
        <span className="inline-controls">
          <ColorInput value={inside.color ?? '#000000'} disabled={insideOff || inside.color === null} ariaLabel="Inside bar label colour" onChange={(v) => setInside('Bar label inside colour', { color: v })} />
          <label className="inline-check">
            <Check checked={inside.color === null} disabled={insideOff} onChange={(auto) => setInside('Bar label inside colour', { color: auto ? null : '#000000' })} ariaLabel="Inside bar label colour: automatic" /> Auto
          </label>
        </span>
      </Field>
      <Field label="Decimals">
        <SelectInput<(typeof LABEL_DECIMALS)[number]>
          value={l.decimals === null ? 'auto' : (String(l.decimals) as (typeof LABEL_DECIMALS)[number])}
          disabled={l.show !== 'value' && inside.show !== 'value'}
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
      <NumField {...SLIDERS.font} label="Size" unit="pt" value={l.sizePt} min={BAR_LABEL_LIMITS.sizePt.min} max={BAR_LABEL_LIMITS.sizePt.max} disabled={off} onCommit={(v) => set('Bar label size', { sizePt: v }, 'barlabel:size')} />
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
  const { run } = useCommands();
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

/** Whether lines and error bars are drawn over or under the symbols and bars. */
export function LineOrderSection({ chart }: { chart: Chart }) {
  const { run } = useCommands();
  return (
    <Section title="Drawing order">
      <Field label="Lines and error bars go" hint="Auto draws them as the chart type usually does: over bars, under symbols. On top puts them over the symbols and bars too; Underneath puts them behind both.">
        <SelectInput<LineOrder>
          value={chart.lineOrder}
          options={[
            { value: 'auto', label: 'Auto' },
            { value: 'onTop', label: 'On top' },
            { value: 'underneath', label: 'Underneath' },
          ]}
          onChange={(v) => run('Drawing order', patchLook(chart.id, { lineOrder: v }))}
        />
      </Field>
    </Section>
  );
}

/** The offset between the traces of an offset-traces chart: blank is the automatic step, shown as a hint. */
export function OffsetSection({ chart, autoStep }: { chart: Chart; autoStep: number }) {
  const { run } = useCommands();
  return (
    <Section title="Offset traces">
      <OptionalNumField label="Offset between traces" hint="In Y units; trace 1 stays where it is, trace 2 is lifted by one step, trace 3 by two. Auto: a little more than the largest range of a trace, so they do not overlap. Below 0 stacks them downward." value={chart.traceOffset} autoValue={autoStep} onCommit={(v) => run('Offset between traces', patchLook(chart.id, { traceOffset: v }), 'offset:step')} />
      <div className="muted small">The offset is written on the figure. Hide the Y axis and turn on its scale bar (Axes) to read the size of the traces.</div>
    </Section>
  );
}

/** What the shared style fields below edit: the style as resolved for the data sets in scope, its override marks, and the edit. */
interface StyleEdit {
  st: ChartStyle;
  ov: (key: keyof ChartStyle) => Overridden;
  setStyle: (patch: Partial<ChartStyle>) => void;
  /** The box is switched off: the fields are greyed out. */
  disabled: boolean;
}

/** Colour, thickness and opacity of a line (a connecting line, a mean or centre line, the lines joining the rows); `colourLocked`: the colour comes from elsewhere. */
export function LineLookFields({ st, ov, setStyle, disabled, colourLocked = false }: StyleEdit & { colourLocked?: boolean }) {
  return (
    <>
      <Field label="Colour" overridden={ov('lineColor')}>
        <ColorInput value={st.lineColor} disabled={disabled || colourLocked} onChange={(v) => setStyle({ lineColor: v })} />
      </Field>
      <NumField {...SLIDERS.line} label="Thickness" unit="pt" value={st.lineWidthPt} min={0.2} max={20} disabled={disabled} overridden={ov('lineWidthPt')} onCommit={(v) => setStyle({ lineWidthPt: v })} />
      <NumField {...SLIDERS.fraction} label="Opacity" value={st.lineOpacity} min={0} max={1} disabled={disabled} overridden={ov('lineOpacity')} onCommit={(v) => setStyle({ lineOpacity: v })} hint="0 = transparent, 1 = opaque" />
    </>
  );
}

/**
 * The look of the symbols: colour (which colours the border too, as a palette does; Border colour can then differ), shape, size,
 * fill and border. `afterSize` goes after the size (the size legend of bubbles); `colourNote` explains a colour that is set elsewhere.
 */
export function SymbolLookFields({ st, ov, setStyle, disabled, colourLocked = false, colourNote = null, sizeLabel = 'Size', sizeHint, afterSize }: StyleEdit & { colourLocked?: boolean; colourNote?: string | null; sizeLabel?: string; sizeHint?: string; afterSize?: ReactNode }) {
  return (
    <>
      <Field label="Colour" overridden={ov('symbolColor')} note={colourNote}>
        <ColorInput value={st.symbolColor} disabled={disabled || colourLocked} onChange={(v) => setStyle({ symbolColor: v, symbolBorderColor: v })} />
      </Field>
      <Field label="Shape" overridden={ov('symbolShape')}>
        <SymbolPicker shape={st.symbolShape} fillOpacity={st.symbolFillOpacity} disabled={disabled} onChange={setStyle} />
      </Field>
      <NumField {...SLIDERS.symbol} label={sizeLabel} unit="pt" value={st.symbolSizePt} min={2} max={60} disabled={disabled} overridden={ov('symbolSizePt')} {...(sizeHint ? { hint: sizeHint } : {})} onCommit={(v) => setStyle({ symbolSizePt: v })} />
      {afterSize}
      <NumField {...SLIDERS.fraction} label="Fill opacity" value={st.symbolFillOpacity} min={0} max={1} disabled={disabled} overridden={ov('symbolFillOpacity')} onCommit={(v) => setStyle({ symbolFillOpacity: v })} hint="1 = solid, 0 = hollow: only the border shows" />
      <Field label="Border colour" overridden={ov('symbolBorderColor')}>
        <ColorInput value={st.symbolBorderColor} disabled={disabled || colourLocked} onChange={(v) => setStyle({ symbolBorderColor: v })} />
      </Field>
      <NumField {...SLIDERS.line} label="Border thickness" unit="pt" value={st.symbolBorderWidthPt} min={0} max={20} disabled={disabled} overridden={ov('symbolBorderWidthPt')} onCommit={(v) => setStyle({ symbolBorderWidthPt: v })} />
      <NumField {...SLIDERS.fraction} label="Border opacity" value={st.symbolBorderOpacity} min={0} max={1} disabled={disabled} overridden={ov('symbolBorderOpacity')} onCommit={(v) => setStyle({ symbolBorderOpacity: v })} hint="0 = transparent, 1 = opaque" />
    </>
  );
}

/** The look of error bars: colour, cap, direction, thickness and opacity (what they show is set above them, with the summary). */
export function ErrorBarLookFields({ st, ov, setStyle, disabled }: StyleEdit) {
  return (
    <>
      <Field label="Colour" overridden={ov('errorColor')}>
        <ColorInput value={st.errorColor} disabled={disabled} onChange={(v) => setStyle({ errorColor: v })} />
      </Field>
      <Field label="Cap style" overridden={ov('errorCap')}>
        <SelectInput value={st.errorCap} disabled={disabled} options={[{ value: 'bar', label: 'Bar' }, { value: 'none', label: 'None' }]} onChange={(v) => setStyle({ errorCap: v })} />
      </Field>
      <NumField {...SLIDERS.cap} label="Cap width" unit="pt" value={st.errorCapWidthPt} min={0} max={40} disabled={disabled || st.errorCap === 'none'} overridden={ov('errorCapWidthPt')} onCommit={(v) => setStyle({ errorCapWidthPt: v })} />
      <Field label="Direction" overridden={ov('errorDirection')} hint={DIRECTION_HINT}>
        <SelectInput value={st.errorDirection} disabled={disabled} options={[{ value: 'both', label: 'Both' }, { value: 'positive', label: 'Above' }, { value: 'negative', label: 'Below' }]} onChange={(v) => setStyle({ errorDirection: v })} />
      </Field>
      <NumField {...SLIDERS.line} label="Thickness" unit="pt" value={st.errorLineWidthPt} min={0.2} max={20} disabled={disabled} overridden={ov('errorLineWidthPt')} onCommit={(v) => setStyle({ errorLineWidthPt: v })} />
      <NumField {...SLIDERS.fraction} label="Opacity" value={st.errorOpacity} min={0} max={1} disabled={disabled} overridden={ov('errorOpacity')} onCommit={(v) => setStyle({ errorOpacity: v })} hint="0 = transparent, 1 = opaque" />
    </>
  );
}
