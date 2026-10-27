import type { ChartStyle, ChartType, PointLabelCollision, PointLabelSource } from '../../../model/types';
import { LABEL_FONT_LIMITS, LABEL_OFFSET_LIMITS, LABEL_DECIMALS_LIMITS, type Box, type PointLabelModel } from '../../../chart/shared/parts/labels';
import { Check, ColorInput, Field, GroupBox, NumField, type Overridden, SelectInput } from '../common/controls';
import {
  KEEP_LABEL_PATCH,
  LABEL_MODE_OPTIONS,
  POINT_LABEL_KEYS,
  describePointOverrideUi,
  labelModeAction,
  pointPlacementAction,
  pointStatus,
  seedCustomOffsets,
} from '../common/pointOverrideUi';
import {
  COLLISION_OPTIONS,
  IDENTIFIER_NOTE,
  colourPatch,
  decimalsPatch,
  describePointLabelUi,
  labelStatusLines,
  placementPatch,
  suppressedRows,
} from '../common/pointLabelUi';

/** "Label each point" and its options; the status block reports on the whole graph. */
export function PointLabelControls({
  type,
  style,
  labels,
  overridden,
  onChange,
}: {
  type: ChartType;
  style: ChartStyle;
  labels: PointLabelModel;
  overridden: (key: keyof ChartStyle) => Overridden;
  onChange: (patch: Partial<ChartStyle>) => void;
}) {
  const ui = describePointLabelUi(type, style);
  const off = !ui.optionsEnabled;
  const status = labelStatusLines(labels.report);
  const hidden = suppressedRows(labels.suppressed);
  return (
    <>
      <Field label="Label each point" overridden={overridden('showPointLabels')} note={ui.checkboxReason}>
        <Check
          checked={style.showPointLabels === true}
          disabled={!ui.checkboxEnabled}
          ariaLabel="Label each point"
          onChange={(v) => onChange({ showPointLabels: v })}
        />
      </Field>
      <div className="muted small">{ui.caption}</div>
      <Field label="Label colour" overridden={overridden('pointLabelColor')}>
        <ColorInput
          value={ui.colourValue}
          disabled={off || ui.colourAuto}
          ariaLabel="Label colour"
          onChange={(v) => onChange(colourPatch(false, v))}
        />
        <label className="auto-check">
          <Check
            checked={ui.colourAuto}
            disabled={off}
            ariaLabel="Label colour automatic"
            onChange={(v) => onChange(colourPatch(v, ui.colourValue))}
          />
          Auto
        </label>
      </Field>
      <details className="label-options">
        <summary>Label options</summary>
        <fieldset className="label-options-body" disabled={off}>
          <legend className="visually-hidden">Label options</legend>
          <Field label="Label text" overridden={overridden('pointLabelSource')}>
            <select
              value={ui.source}
              aria-label="Label text source"
              onChange={(e) => onChange({ pointLabelSource: e.target.value as PointLabelSource })}
            >
              {ui.sources.map((o) => (
                <option key={o.value} value={o.value} disabled={!o.enabled} title={o.reason ?? undefined}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          {ui.sources.map((o) => (o.reason && !o.enabled && type === 'mean' ? <div key={o.value} className="muted small">{o.reason}</div> : null))}
          {ui.showIdentifierNote && <div className="muted small">{IDENTIFIER_NOTE}</div>}
          {ui.decimals.visible && (
            <NumField
              label="Decimals"
              value={ui.decimals.value}
              min={LABEL_DECIMALS_LIMITS.min}
              max={LABEL_DECIMALS_LIMITS.max}
              disabled={off || ui.decimals.auto}
              overridden={overridden('pointLabelDecimals')}
              validate={(v) => (Number.isInteger(v) ? null : 'Enter a whole number.')}
              onCommit={(v) => onChange(decimalsPatch(false, v))}
            />
          )}
          {ui.decimals.visible && (
            <Field label="Auto decimals">
              <Check
                checked={ui.decimals.auto}
                disabled={off}
                ariaLabel="Automatic decimals (6 significant digits)"
                onChange={(v) => onChange(decimalsPatch(v, ui.decimals.value))}
              />
            </Field>
          )}
          <Field label="Placement" overridden={overridden('pointLabelPlacement')} note={ui.placementReason}>
            <select
              value={ui.placement}
              aria-label="Label placement"
              onChange={(e) => {
                const patch = placementPatch(e.target.value);
                if (patch) onChange(patch);
              }}
            >
              {ui.placements.map((o) => (
                <option key={o.value} value={o.value} disabled={o.disabled && o.value !== ui.placement}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <NumField
            label="Offset X"
            unit="pt"
            value={style.pointLabelOffsetXPt}
            min={LABEL_OFFSET_LIMITS.min}
            max={LABEL_OFFSET_LIMITS.max}
            disabled={!ui.offsets.enabled}
            overridden={overridden('pointLabelOffsetXPt')}
            note={ui.offsets.note}
            onCommit={(v) => onChange({ pointLabelOffsetXPt: v })}
          />
          <NumField
            label="Offset Y"
            unit="pt"
            value={style.pointLabelOffsetYPt}
            min={LABEL_OFFSET_LIMITS.min}
            max={LABEL_OFFSET_LIMITS.max}
            disabled={!ui.offsets.enabled}
            overridden={overridden('pointLabelOffsetYPt')}
            onCommit={(v) => onChange({ pointLabelOffsetYPt: v })}
          />
          <NumField
            label="Size"
            unit="pt"
            value={style.pointLabelFontSizePt}
            min={LABEL_FONT_LIMITS.min}
            max={LABEL_FONT_LIMITS.max}
            disabled={off}
            overridden={overridden('pointLabelFontSizePt')}
            onCommit={(v) => onChange({ pointLabelFontSizePt: v })}
          />
          <Field label="Bold" overridden={overridden('pointLabelBold')}>
            <Check checked={style.pointLabelBold} disabled={off} ariaLabel="Bold labels" onChange={(v) => onChange({ pointLabelBold: v })} />
          </Field>
          <Field label="Italic" overridden={overridden('pointLabelItalic')}>
            <Check checked={style.pointLabelItalic} disabled={off} ariaLabel="Italic labels" onChange={(v) => onChange({ pointLabelItalic: v })} />
          </Field>
          <Field label="Overlaps" overridden={overridden('pointLabelCollision')}>
            <SelectInput<PointLabelCollision>
              value={ui.collision}
              disabled={off}
              options={COLLISION_OPTIONS}
              onChange={(v) => onChange({ pointLabelCollision: v })}
            />
          </Field>
          <Field label="Leader lines" overridden={overridden('pointLabelLeader')} hint="A line from a displaced label to its point">
            <Check checked={style.pointLabelLeader} disabled={off} ariaLabel="Leader lines" onChange={(v) => onChange({ pointLabelLeader: v })} />
          </Field>
        </fieldset>
      </details>
      {(status.length > 0 || hidden.rows.length > 0) && (
        <div className="label-status" aria-live="polite">
          {status.map((line) => (
            <div key={line} className="muted small">{line}</div>
          ))}
          {hidden.rows.length > 0 && (
            <ul className="label-suppressed">
              {hidden.rows.map((row, i) => (
                <li key={i} className="muted small">{row}</li>
              ))}
              {hidden.more > 0 && <li className="muted small">and {hidden.more} more</li>}
            </ul>
          )}
        </div>
      )}
    </>
  );
}

/** Edits to one point's own overrides; the Inspector turns them into one undoable command. */
export interface PointEdit {
  set?: Partial<ChartStyle>;
  clear?: Array<keyof ChartStyle>;
}

/** "Selected point": per-point label overrides (object level, above the data set). */
export function SelectedPointBox({
  type,
  style,
  overrides,
  rowTitle,
  pointId,
  labels,
  seed,
  onEdit,
  onReset,
}: {
  type: ChartType;
  /** Style resolved down to the point. */
  style: ChartStyle;
  overrides: Partial<ChartStyle>;
  rowTitle: string | null;
  pointId: string;
  labels: PointLabelModel;
  /** Where the point and its label are drawn now, used to seed Custom offsets. */
  seed: { point: { cx: number; cy: number } | null; box: Box | null };
  onEdit: (label: string, edit: PointEdit, coalesceKey?: string) => void;
  onReset: () => void;
}) {
  const ui = describePointOverrideUi(style, { type, overrides, rowTitle });
  const off = !ui.optionsEnabled;
  const status = pointStatus(ui, labels, pointId);
  const has = (key: keyof ChartStyle) => overrides[key] !== undefined;
  const anyOverride = POINT_LABEL_KEYS.some(has);
  const set = (patch: Partial<ChartStyle>, label = 'Change point label') =>
    onEdit(label, { set: patch }, `point:${pointId}:${Object.keys(patch).join(',')}`);
  return (
    <GroupBox title="Selected point" overridden={anyOverride}>
      <div className="muted small">{rowTitle === null ? 'Missing row' : rowTitle.trim() === '' ? 'Row without a title' : `Row: ${rowTitle}`}</div>
      <Field label="Label" overridden={has('showPointLabels')} note={ui.reason}>
        <select
          value={ui.mode}
          disabled={!ui.available}
          aria-label="Label for this point"
          onChange={(e) => {
            const action = labelModeAction(e.target.value);
            if (action) onEdit('Change point label', action);
          }}
        >
          {LABEL_MODE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </Field>
      <Field label="Label colour" overridden={has('pointLabelColor')}>
        <ColorInput
          value={ui.colourValue}
          disabled={off || ui.colourAuto}
          ariaLabel="Point label colour"
          onChange={(v) => set(colourPatch(false, v))}
        />
        <label className="auto-check">
          <Check
            checked={ui.colourAuto}
            disabled={off}
            ariaLabel="Point label colour automatic"
            onChange={(v) => set(colourPatch(v, ui.colourValue))}
          />
          Auto
        </label>
      </Field>
      <NumField
        label="Size"
        unit="pt"
        value={style.pointLabelFontSizePt}
        min={LABEL_FONT_LIMITS.min}
        max={LABEL_FONT_LIMITS.max}
        disabled={off}
        overridden={has('pointLabelFontSizePt')}
        onCommit={(v) => set({ pointLabelFontSizePt: v })}
      />
      <Field label="Bold" overridden={has('pointLabelBold')}>
        <Check checked={style.pointLabelBold} disabled={off} ariaLabel="Bold label for this point" onChange={(v) => set({ pointLabelBold: v })} />
      </Field>
      <Field label="Italic" overridden={has('pointLabelItalic')}>
        <Check checked={style.pointLabelItalic} disabled={off} ariaLabel="Italic label for this point" onChange={(v) => set({ pointLabelItalic: v })} />
      </Field>
      <Field label="Placement" overridden={has('pointLabelPlacement')}>
        <select
          value={ui.placement}
          disabled={off}
          aria-label="Placement of this label"
          onChange={(e) => {
            const seeded = seedCustomOffsets(style, seed.point, seed.box);
            const action = pointPlacementAction(e.target.value, ui.placement, seeded);
            if (action) onEdit('Change point label', action);
          }}
        >
          {ui.placements.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
          ))}
        </select>
      </Field>
      <NumField
        label="Offset X"
        unit="pt"
        value={style.pointLabelOffsetXPt}
        min={LABEL_OFFSET_LIMITS.min}
        max={LABEL_OFFSET_LIMITS.max}
        disabled={!ui.offsets.enabled}
        overridden={has('pointLabelOffsetXPt')}
        note={ui.offsets.note}
        onCommit={(v) => set({ pointLabelOffsetXPt: v })}
      />
      <NumField
        label="Offset Y"
        unit="pt"
        value={style.pointLabelOffsetYPt}
        min={LABEL_OFFSET_LIMITS.min}
        max={LABEL_OFFSET_LIMITS.max}
        disabled={!ui.offsets.enabled}
        overridden={has('pointLabelOffsetYPt')}
        onCommit={(v) => set({ pointLabelOffsetYPt: v })}
      />
      <div className="muted small" aria-live="polite">{status.text}</div>
      <div className="button-row">
        {status.canKeep && <button onClick={() => set(KEEP_LABEL_PATCH, 'Keep point label')}>Keep this label</button>}
        <button onClick={onReset} disabled={!anyOverride}>Reset point label</button>
      </div>
    </GroupBox>
  );
}
