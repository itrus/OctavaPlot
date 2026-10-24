import { useEffect, useRef } from 'react';
import { CHART_PX_MAX, CHART_PX_MIN } from '../model/defaults';
import { useApp } from '../state/AppContext';
import type { DecimalSeparator } from './cellText';
import type { ExportFormat } from '../state/settings';
import { DialogShell, trapTab } from './DialogShell';
import { Check, Field, NumField, Section, SelectInput } from './inspector/controls';

/** Centralised application preferences. They apply to the app and to new charts, not to a saved project. */
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { settings, updateSettings, autosaveOk } = useApp();
  const ref = useRef<HTMLDivElement>(null);

  // Focus the dialog once, when it opens. (Doing it in the effect below would pull focus out of a field being edited
  // every time a setting changed, because onClose is a new function on each render.)
  useEffect(() => ref.current?.focus(), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <DialogShell>
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()} onKeyDown={trapTab}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Settings" tabIndex={-1} ref={ref}>
        <div className="modal-head">
          <strong>Settings</strong>
          <button className="icon-btn" onClick={onClose} aria-label="Close settings">×</button>
        </div>
        <div className="modal-body">
          <Section title="General">
            <Field
              label="Autosave"
              hint="Keep a copy of the project in this browser while you work"
              note={settings.autosave && !autosaveOk ? 'Autosave is unavailable: the browser refused to store the project.' : null}
            >
              <Check checked={settings.autosave} onChange={(v) => updateSettings({ autosave: v })} ariaLabel="Autosave" />
            </Field>
            <Field label="New projects and tables start empty" hint="Off: a new project, and the New Data Table dialog, start with sample data. On: they start with blank tables (the dialog still lets you choose).">
              <Check checked={settings.newProjectEmpty} onChange={(v) => updateSettings({ newProjectEmpty: v })} ariaLabel="New projects and tables start empty" />
            </Field>
          </Section>
          <Section title="Numbers in tables">
            <Field label="Decimal separator" hint="How typed, pasted and imported numbers are read. Automatic takes 1,5 as 1.5 but refuses 1,234, which could be 1.234 or 1234.">
              <SelectInput<DecimalSeparator>
                value={settings.decimalSeparator}
                options={[
                  { value: 'auto', label: 'Automatic (decimal point or comma)' },
                  { value: 'point', label: 'Point: 1,234.5 (a comma is refused)' },
                  { value: 'comma', label: 'Comma: 1.234,5 (a point is refused)' },
                ]}
                onChange={(v) => updateSettings({ decimalSeparator: v })}
              />
            </Field>
          </Section>
          <Section title="Export">
            <Field label="Add date and time to file names" hint="Exported JSON, CSV, PNG and SVG files get a suffix like _261022_1435 (yymmdd_HHMM)">
              <Check checked={settings.timestampExports} onChange={(v) => updateSettings({ timestampExports: v })} ariaLabel="Add date and time to file names" />
            </Field>
            <Field label="Format" hint="Used by the Export button on the Graphs page">
              <SelectInput<ExportFormat>
                value={settings.exportFormat}
                options={[
                  { value: 'png', label: 'PNG (default)' },
                  { value: 'svg', label: 'SVG (vector)' },
                ]}
                onChange={(v) => updateSettings({ exportFormat: v })}
              />
            </Field>
          </Section>
          <Section title="New charts">
            <NumField label="Default width" unit="px" step={10} slider={false} value={settings.defaultChartWidthPx} min={CHART_PX_MIN} max={CHART_PX_MAX} onCommit={(v) => updateSettings({ defaultChartWidthPx: v })} />
            <NumField label="Default height" unit="px" step={10} slider={false} value={settings.defaultChartHeightPx} min={CHART_PX_MIN} max={CHART_PX_MAX} onCommit={(v) => updateSettings({ defaultChartHeightPx: v })} />
            <div className="muted small">Applies to charts created from now on; existing charts keep their size.</div>
          </Section>
        </div>
      </div>
    </div>
    </DialogShell>
  );
}
