import { CHART_PX_MAX, CHART_PX_MIN } from '../../model/defaults';
import { clearBrowserCopies } from '../../state/recovery/recovery';
import { usePreferences, useRecovery } from '../../state/AppContext';
import { EXPORT_DPI_CHOICES, type ExportDpi, type ExportFormat } from '../../state/settings';
import { DialogWindow } from './DialogShell';
import { Check, Field, NumField, SelectInput, SubHeading } from '../inspector/common/controls';
import type { DecimalSeparator } from '../../model/types';

/** Centralised application preferences, all on one screen. They apply to the app and to new charts, not to a saved project. */
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { settings, updateSettings } = usePreferences();
  const { autosaveOk } = useRecovery();

  return (
    <DialogWindow title="Settings" onClose={onClose} className="settings-modal">
        <div className="modal-body settings-body">
          <SubHeading>General</SubHeading>
          <Field
            label="Autosave"
            hint="Keep a copy of the project in this browser while you work"
            note={settings.autosave && !autosaveOk ? 'Autosave is unavailable: the browser refused to store the project.' : null}
          >
            <Check checked={settings.autosave} onChange={(v) => {
              // Switching off stops the writing; what was written before would stay in the browser, so it is deleted (after asking).
              if (!v && !window.confirm('Switch Autosave off?\n\nThe copy of the project kept in this browser will be deleted. Work that is not saved as a file can then not be recovered.')) return;
              if (!v) clearBrowserCopies();
              updateSettings({ autosave: v });
            }} ariaLabel="Autosave" />
          </Field>
          <Field label="Start new tables with sample data" hint="On: a new project, and the New Data Table dialog, start with sample data. Off: they start with blank tables (the dialog still lets you choose).">
            <Check checked={settings.newProjectSample} onChange={(v) => updateSettings({ newProjectSample: v })} ariaLabel="Start new tables with sample data" />
          </Field>
          <Field label="Decimal separator" hint="How numbers in tables are read, shown, copied and exported. Thousands separators are never read or written. Comma mode also makes CSV files semicolon-separated. Automatic reads 1,5 as 1.5, writes points, and refuses 1,234, which could be a thousand or 1.234.">
            <SelectInput<DecimalSeparator>
              value={settings.decimalSeparator}
              options={[
                { value: 'auto', label: 'Automatic (reads point or comma, writes point)' },
                { value: 'point', label: 'Point: 1234.5 (a comma is refused)' },
                { value: 'comma', label: 'Comma: 1234,5 (a point is refused)' },
              ]}
              onChange={(v) => updateSettings({ decimalSeparator: v })}
            />
          </Field>

          <SubHeading>Graphs</SubHeading>
          <NumField label="Default width" unit="px" step={10} slider={false} value={settings.defaultChartWidthPx} min={CHART_PX_MIN} max={CHART_PX_MAX} onCommit={(v) => updateSettings({ defaultChartWidthPx: v })} />
          <NumField label="Default height" unit="px" step={10} slider={false} value={settings.defaultChartHeightPx} min={CHART_PX_MIN} max={CHART_PX_MAX} onCommit={(v) => updateSettings({ defaultChartHeightPx: v })} />
          <Field label="Page background" hint="The background of new graphs: white, or transparent (an SVG or PNG export has no background colour; a PDF shows the white of the paper). Each graph can change it.">
            <span className="switch-group" role="group" aria-label="Page background of new graphs">
              {(['white', 'transparent'] as const).map((v) => (
                <button key={v} className={`switch${settings.newGraphBackground === v ? ' on' : ''}`} aria-pressed={settings.newGraphBackground === v} onClick={() => updateSettings({ newGraphBackground: v })}>
                  {v === 'white' ? 'White' : 'Transparent'}
                </button>
              ))}
            </span>
          </Field>

          <SubHeading>Export</SubHeading>
          <Field label="Date and time in file names" hint="Exported JSON, CSV, PNG and SVG files get a suffix like _261022_1435 (yymmdd_HHMM)">
            <Check checked={settings.timestampExports} onChange={(v) => updateSettings({ timestampExports: v })} ariaLabel="Date and time in file names" />
          </Field>
          <Field label="Default format" hint="The format the Export page of a graph and of a layout starts with. Choosing a format on an Export page also makes it the default. PNG is a bitmap at the size of the graph on screen; SVG and PDF are vector (shapes and text), at the size of the graph.">
            <span className="switch-group" role="group" aria-label="Export format">
              {(
                [
                  ['png', 'PNG'],
                  ['svg', 'SVG'],
                  ['pdf', 'PDF'],
                ] as const satisfies ReadonlyArray<readonly [ExportFormat, string]>
              ).map(([value, label]) => (
                <button key={value} className={`switch${settings.exportFormat === value ? ' on' : ''}`} aria-pressed={settings.exportFormat === value} onClick={() => updateSettings({ exportFormat: value })}>
                  {label}
                </button>
              ))}
            </span>
          </Field>
          <Field label="Default resolution" hint="Dots per inch of a PNG of a layout page (A4): the resolution the Export page of a layout starts with. Choosing a resolution there also makes it the default. A graph's PNG is at its own size; SVG and PDF have no resolution. 600 dpi takes a few seconds.">
            <SelectInput<string>
              value={String(settings.exportDpi)}
              options={EXPORT_DPI_CHOICES.map((d) => ({ value: String(d), label: `${d} dpi` }))}
              onChange={(v) => updateSettings({ exportDpi: Number(v) as ExportDpi })}
            />
          </Field>
        </div>
    </DialogWindow>
  );
}
