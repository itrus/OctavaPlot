import { EXTRA_TICK_LIMITS, MAX_EXTRA_TICKS } from '../../../model/graph/axis';
import { LINE_STYLES } from '../../../model/graph/look';
import type { YAxisScale } from '../../../chart/shared/axes/scales';
import type { Chart, ExtraTick, ExtraTickDirection, LineStyle } from '../../../model/types';
import { useApp } from '../../../state/AppContext';
import { patchAxis } from '../../../state/commands';
import type { TimeColumn } from '../../../util/timeColumn';
import { Check, ColorInput, Field, GroupBox, NumField, SelectInput, TextInput } from '../common/controls';
import { TimeField } from '../common/TimeField';

type GridChoice = 'axis' | 'own' | 'none';

const DIRECTIONS: Array<{ value: ExtraTickDirection; label: string }> = [
  { value: 'auto', label: 'Like the axis' },
  { value: 'out', label: 'Out' },
  { value: 'in', label: 'In' },
  { value: 'both', label: 'Both ways' },
];

/**
 * Ticks added by hand among the automatic ones, on a numeric axis: for each, its value, its text (shown or not, what it says, turned,
 * moved away from the axis), its mark (size, direction, thickness) and a gridline of its own (thickness, pattern, colour, behind or in
 * front of the data).
 */
export function ExtraTicksControls({ chart, which, scale, name, time }: { chart: Chart; which: 'xAxis' | 'yAxis'; scale: YAxisScale; name: string; time?: TimeColumn }) {
  const { run } = useApp();
  const ticks = chart[which].extraTicks ?? [];
  const tag = which === 'xAxis' ? 'x' : 'y';
  const grid = chart.grid;
  const set = (label: string, next: ExtraTick[], key?: string) => run(label, patchAxis(chart.id, which, { extraTicks: next }), key);
  const edit = (i: number, patch: Partial<ExtraTick>) => ticks.map((t, j) => (j === i ? { ...t, ...patch } : t));
  // A new tick starts in the middle of the axis, or at the first value that no tick has yet.
  const start = [(scale.domain[0] + scale.domain[1]) / 2, ...scale.domain].find((v) => !ticks.some((t) => t.value === v)) ?? scale.domain[0];
  const { angle, textOffsetPt, tickWidthPt, gridWidthPt } = EXTRA_TICK_LIMITS;
  return (
    <>
      {ticks.map((t, i) => {
        const change = (what: string, patch: Partial<ExtraTick>, key?: string) => set(what, edit(i, patch), key ? `axis:${tag}tick${i}${key}` : undefined);
        const choice: GridChoice = t.showGrid === undefined ? 'axis' : t.showGrid ? 'own' : 'none';
        const showText = t.showText !== false;
        const showTick = t.showTick !== false;
        return (
          <div key={i} className="annotation-card selected">
            {time ? (
              <TimeField label={`${name} extra tick ${i + 1}`} time={time} value={t.value} onCommit={(v) => v !== null && change('Extra tick value', { value: v }, 'v')} hint="A value outside the axis range or in an omitted range is not drawn, and a notice says so" />
            ) : (
              <NumField label={`${name} extra tick ${i + 1}`} value={t.value} onCommit={(v) => change('Extra tick value', { value: v }, 'v')} hint="A value outside the axis range, in an omitted range, or at or below 0 on a log axis is not drawn, and a notice says so" />
            )}
            <GroupBox title="Text" checked={showText} onCheckedChange={(v) => change('Extra tick text', { showText: v ? undefined : false })}>
              <Field label="Text" hint="Written instead of the number; empty keeps the number">
                <TextInput value={t.label} disabled={!showText} onChange={(v) => change('Extra tick text', { label: v }, 'text')} />
              </Field>
              <NumField label="Angle" unit="°" value={t.textAngle ?? 0} min={angle.min} max={angle.max} disabled={!showText} hint="Turns the text clockwise" onCommit={(v) => change('Extra tick text angle', { textAngle: v === 0 ? undefined : v }, 'angle')} />
              <NumField label="Offset" unit="pt" value={t.textOffsetPt ?? 0} min={textOffsetPt.min} max={textOffsetPt.max} disabled={!showText} hint="Moves the text away from the axis" onCommit={(v) => change('Extra tick text offset', { textOffsetPt: v === 0 ? undefined : v }, 'offset')} />
            </GroupBox>
            <GroupBox title="Tick mark" checked={showTick} onCheckedChange={(v) => change('Extra tick mark', { showTick: v ? undefined : false })}>
              <Field label="Size">
                <SelectInput<'major' | 'minor'> value={t.tickSize ?? 'major'} disabled={!showTick} options={[{ value: 'major', label: 'Major' }, { value: 'minor', label: 'Minor (half)' }]} onChange={(v) => change('Extra tick size', { tickSize: v === 'major' ? undefined : v })} />
              </Field>
              <Field label="Direction">
                <SelectInput<ExtraTickDirection> value={t.tickDirection ?? 'auto'} disabled={!showTick} options={DIRECTIONS} onChange={(v) => change('Extra tick direction', { tickDirection: v === 'auto' ? undefined : v })} />
              </Field>
              <NumField label="Thickness" unit="pt" value={t.tickWidthPt ?? chart[which].lineWidthPt} min={tickWidthPt.min} max={tickWidthPt.max} disabled={!showTick} hint="As thick as the axis line unless set" onCommit={(v) => change('Extra tick thickness', { tickWidthPt: v }, 'width')} />
            </GroupBox>
            <GroupBox title="Gridline">
              <Field label="Gridline" hint="Like the axis: drawn with the automatic gridlines, while the axis has them on">
                <SelectInput<GridChoice>
                  value={choice}
                  options={[{ value: 'axis', label: 'Like the axis' }, { value: 'own', label: 'Own line' }, { value: 'none', label: 'None' }]}
                  onChange={(v) => change('Extra tick gridline', { showGrid: v === 'axis' ? undefined : v === 'own' })}
                />
              </Field>
              {choice === 'own' && (
                <>
                  <NumField label="Thickness" unit="pt" value={t.gridWidthPt ?? grid.widthPt} min={gridWidthPt.min} max={gridWidthPt.max} onCommit={(v) => change('Extra tick gridline thickness', { gridWidthPt: v }, 'gwidth')} />
                  <Field label="Pattern">
                    <SelectInput<LineStyle> value={t.gridStyle ?? grid.style} options={LINE_STYLES.map((l) => ({ value: l.value, label: l.label }))} onChange={(v) => change('Extra tick gridline pattern', { gridStyle: v })} />
                  </Field>
                  <Field label="Colour">
                    <ColorInput value={t.gridColor ?? grid.color} onChange={(v) => change('Extra tick gridline colour', { gridColor: v }, 'gcolor')} />
                  </Field>
                  <Field label="In front of the data" hint="Off: behind the data">
                    <Check checked={t.gridOver === true} onChange={(v) => change('Extra tick gridline order', { gridOver: v ? true : undefined })} />
                  </Field>
                </>
              )}
            </GroupBox>
            <div className="button-row">
              <button onClick={() => set('Delete extra tick', ticks.filter((_, j) => j !== i))}>Delete tick</button>
            </div>
          </div>
        );
      })}
      <div className="button-row">
        <button disabled={ticks.length >= MAX_EXTRA_TICKS} onClick={() => set('Add extra tick', [...ticks, { value: time ? (time.kind === 'duration' ? start : Math.round(start)) : Number(start.toPrecision(6)), label: '' }])}>+ Tick at a value</button>
      </div>
    </>
  );
}
