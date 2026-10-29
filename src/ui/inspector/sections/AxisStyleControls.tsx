import type { YAxisScale } from '../../../chart/shared/axes/scales';
import { AXIS_LIMITS, AXIS_SCALES, BREAK_MARKS, MAX_BREAKS, NUMBER_FORMATS, TICK_DIRECTIONS } from '../../../model/graph/axis';
import type { AxisBreak, AxisScaleKind, BreakMark, Chart, NumberFormatKind, TickDirection } from '../../../model/types';
import { useApp } from '../../../state/AppContext';
import { patchAxis, type AxisKey } from '../../../state/commands';
import { Check, Field, NumField, Section, SelectInput, TextInput } from '../common/controls';
import { TimeField } from '../common/TimeField';
import type { TimeColumn } from '../../../util/timeColumn';

const DECIMALS = ['auto', '0', '1', '2', '3', '4', '5', '6'] as const;

/**
 * Scale, direction, ticks and number format of one numeric axis (spec 6.1, 6.3, 6.4). `canScale` is false for charts
 * where a log scale makes no sense (stacked parts, percentages, survival curves); `canReverse` for those where the
 * drawing depends on the direction (the survival at-risk table).
 */
export function AxisStyleControls({
  chart,
  which,
  scale,
  name,
  canScale,
  canReverse,
  time,
}: {
  chart: Chart;
  which: AxisKey;
  scale: YAxisScale;
  name: string;
  canScale: boolean;
  canReverse: boolean;
  /** The axis shows dates, times or durations (the X column of an XY table has this type): it is linear, and its values are typed as dates. */
  time?: TimeColumn;
}) {
  const { run } = useApp();
  const axis = chart[which];
  const set = (label: string, patch: Parameters<typeof patchAxis>[2], key?: string) => run(`${name} ${label}`, patchAxis(chart.id, which, patch), key);
  const isLog = axis.scale !== 'linear';
  const minorLogOk = axis.scale === 'log10';
  return (
    <>
      {time && canScale && <div className="muted small">A date, time or duration axis is linear. Its ticks fall on calendar boundaries (on round multiples for a duration); the tick interval and minor ticks of a calendar axis are not used.</div>}
      {canScale && !time && (
        <Field label="Scale" hint="A log scale shows values by their powers; it needs values above 0">
          <SelectInput<AxisScaleKind> value={axis.scale} options={AXIS_SCALES.map((s) => ({ value: s.value, label: s.label }))} onChange={(v) => set('scale', { scale: v, majorInterval: null, min: null, max: null })} />
        </Field>
      )}
      <Field label="Scale bar" hint="Hide the axis, and a bar the length of one major interval stands in its place" note={axis.visible ? 'Hide this axis to use a scale bar.' : null}>
        <Check checked={axis.scaleBar} disabled={axis.visible || isLog} onChange={(v) => set('scale bar', { scaleBar: v })} />
      </Field>
      {/* The right axis cannot be broken: its series share the clip of the left one. */}
      {canScale && which !== 'y2Axis' && <BreakFields chart={chart} which={which} name={name} scale={scale} time={time} blocked={isLog ? 'A log axis cannot be broken.' : axis.reverse ? 'A reversed axis cannot be broken.' : null} />}
      {canReverse && (
        <Field label="Reverse" hint="Draw the axis the other way round: the largest value where the smallest was">
          <Check checked={axis.reverse} onChange={(v) => set('direction', { reverse: v })} />
        </Field>
      )}
      <Section title="Ticks" defaultOpen={false}>
      <TickFields chart={chart} which={which} name={name} />
      <Field
        label="Minor ticks"
        hint={isLog ? 'On a base 10 log axis: 2 to 9 times each power' : 'Ticks between two major ticks'}
        note={isLog && !minorLogOk ? 'Minor ticks on a log axis are available for base 10.' : null}
      >
        <SelectInput<string>
          value={String(axis.minorTicks)}
          disabled={isLog && !minorLogOk}
          options={
            isLog
              ? [
                  { value: '0', label: 'None' },
                  { value: '1', label: '2 to 9 × power' },
                ]
              : [
                  { value: '0', label: 'None' },
                  { value: '1', label: '1 between' },
                  { value: '2', label: '2 between' },
                  { value: '3', label: '3 between' },
                  { value: '4', label: '4 between' },
                ]
          }
          onChange={(v) => set('minor ticks', { minorTicks: Number(v) })}
        />
      </Field>
      <Field label="Minor gridlines" hint="Lines at the minor ticks; switch minor ticks on first">
        <Check checked={axis.showMinorGrid} disabled={axis.minorTicks === 0} onChange={(v) => set('minor gridlines', { showMinorGrid: v })} />
      </Field>
      </Section>
      <Section title="Numbers" defaultOpen={false}>
      <Field label="Number format">
        <SelectInput<NumberFormatKind> value={axis.numberFormat} options={NUMBER_FORMATS.map((f) => ({ value: f.value, label: f.label }))} onChange={(v) => set('number format', { numberFormat: v })} />
      </Field>
      <Field label="Decimals" hint="Digits after the decimal point; Auto picks them from the tick step">
        <SelectInput<(typeof DECIMALS)[number]>
          value={axis.decimals === null || axis.decimals > 6 ? 'auto' : (String(axis.decimals) as (typeof DECIMALS)[number])}
          disabled={axis.numberFormat === 'auto'}
          options={DECIMALS.map((d) => ({ value: d, label: d === 'auto' ? 'Auto' : d }))}
          onChange={(v) => set('decimals', { decimals: v === 'auto' ? null : Number(v) })}
        />
      </Field>
      <Field label="Thousands separator">
        <Check checked={axis.thousands} onChange={(v) => set('thousands separator', { thousands: v })} />
      </Field>
      <Field label="Prefix">
        <TextInput value={axis.prefix} onChange={(v) => set('prefix', { prefix: v }, `axis:${which}:pre`)} />
      </Field>
      <Field label="Suffix">
        <TextInput value={axis.suffix} onChange={(v) => set('suffix', { suffix: v }, `axis:${which}:suf`)} />
      </Field>
      </Section>
      {scale.warnings.length > 0 && isLog && <div className="muted small">{scale.warnings[0]}</div>}
    </>
  );
}

/** Direction and length of the tick marks: the part of the axis style every axis has, the category axis too. */
export function TickFields({ chart, which, name }: { chart: Chart; which: AxisKey; name: string }) {
  const { run } = useApp();
  const axis = chart[which];
  const set = (label: string, patch: Parameters<typeof patchAxis>[2], key?: string) => run(`${name} ${label}`, patchAxis(chart.id, which, patch), key);
  return (
    <>
      <Field label="Tick direction">
        <SelectInput<TickDirection> value={axis.tickDirection} options={TICK_DIRECTIONS.map((d) => ({ value: d.value, label: d.label }))} onChange={(v) => set('tick direction', { tickDirection: v })} />
      </Field>
      <NumField
        label="Tick length"
        unit="pt"
        value={axis.tickLengthPt}
        min={AXIS_LIMITS.tickLengthPt.min}
        max={AXIS_LIMITS.tickLengthPt.max}
        disabled={axis.tickDirection === 'none'}
        onCommit={(v) => set('tick length', { tickLengthPt: v }, `axis:${which}:tl`)}
      />
    </>
  );
}

/**
 * The breaks of a numeric axis (spec 6.6): up to two ranges of values left out, with a gap between what is above and
 * below. A new break starts in the middle of the axis, a third of its range wide.
 */
function BreakFields({ chart, which, name, scale, blocked, time }: { chart: Chart; which: AxisKey; name: string; scale: YAxisScale; blocked: string | null; time?: TimeColumn }) {
  const { run } = useApp();
  const axis = chart[which];
  const set = (breaks: AxisBreak[], label: string, key?: string) => run(`${name} ${label}`, patchAxis(chart.id, which, { breaks }), key);
  const [lo, hi] = [Math.min(...scale.domain), Math.max(...scale.domain)];
  const add = () => {
    const third = (hi - lo) / 3;
    const free = axis.breaks.length === 0 ? lo + third : (axis.breaks[axis.breaks.length - 1].to + hi) / 2 - third / 2;
    // A date or a time is a whole day or second; the six digits that suit a plain number would cut a time of 1.7 billion seconds.
    const snap = (v: number) => (time ? (time.kind === 'duration' ? v : Math.round(v)) : Number(v.toPrecision(6)));
    set([...axis.breaks, { from: snap(free), to: snap(free + third / 2) }], 'break added');
  };
  return (
    <Section title="Breaks" defaultOpen={false}>
      {blocked && <div className="muted small">{blocked}</div>}
      {axis.breaks.map((b, i) => (
        <div key={i}>
          {time ? (
            <>
              <TimeField label={`Break ${i + 1} from`} time={time} value={b.from} validate={(v) => (v < b.to ? null : 'Must be before the end of the break.')} onCommit={(v) => v !== null && set(axis.breaks.map((x, k) => (k === i ? { ...x, from: v } : x)), 'break start', `axis:${which}:bf${i}`)} />
              <TimeField label={`Break ${i + 1} to`} time={time} value={b.to} validate={(v) => (v > b.from ? null : 'Must be after the start of the break.')} onCommit={(v) => v !== null && set(axis.breaks.map((x, k) => (k === i ? { ...x, to: v } : x)), 'break end', `axis:${which}:bt${i}`)} />
            </>
          ) : (
            <>
              <NumField label={`Break ${i + 1} from`} value={b.from} slider={false} disabled={!!blocked} validate={(v) => (v < b.to ? null : 'Must be below the end of the break.')} onCommit={(v) => set(axis.breaks.map((x, k) => (k === i ? { ...x, from: v } : x)), 'break start', `axis:${which}:bf${i}`)} />
              <NumField label={`Break ${i + 1} to`} value={b.to} slider={false} disabled={!!blocked} validate={(v) => (v > b.from ? null : 'Must be above the start of the break.')} onCommit={(v) => set(axis.breaks.map((x, k) => (k === i ? { ...x, to: v } : x)), 'break end', `axis:${which}:bt${i}`)} />
            </>
          )}
          <button className="small-btn" onClick={() => set(axis.breaks.filter((_, k) => k !== i), 'break removed')}>
            Remove break {i + 1}
          </button>
        </div>
      ))}
      <div className="button-row">
        <button className="small-btn" disabled={!!blocked || axis.breaks.length >= MAX_BREAKS} onClick={add}>
          + Add a break
        </button>
      </div>
      <Field label="Mark at the break">
        <SelectInput<BreakMark> value={axis.breakMark} disabled={axis.breaks.length === 0} options={BREAK_MARKS.map((m) => ({ value: m.value, label: m.label }))} onChange={(v) => run(`${name} break mark`, patchAxis(chart.id, which, { breakMark: v }))} />
      </Field>
      <div className="muted small">The values inside a break are left out of the axis, and what is drawn across it is cut off.</div>
    </Section>
  );
}
