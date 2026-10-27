import { useEffect, useRef, useState } from 'react';
import { CHART_PX_MAX, CHART_PX_MIN } from '../../model/defaults';
import { useApp } from '../../state/AppContext';
import { EXPORT_DPI_CHOICES, PNG_DPI_CHOICES, type ExportDpi, type ExportFormat, type PngDpi } from '../../state/settings';
import { DialogShell, trapTab } from './DialogShell';
import { Check, Field, NumField, SelectInput } from '../inspector/common/controls';
import { useRoving } from '../inspector/common/roving';
import type { DecimalSeparator } from '../../model/types';

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'tables', label: 'Tables' },
  { id: 'graphs', label: 'Graphs' },
  { id: 'export', label: 'Export' },
] as const;
type TabId = (typeof TABS)[number]['id'];

/** Centralised application preferences. They apply to the app and to new charts, not to a saved project. */
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { settings, updateSettings, autosaveOk } = useApp();
  const ref = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<TabId>('general');
  // Left and Right, Home and End move between the tabs, as in any tab list.
  const roving = useRoving(TABS.map(() => true), TABS.findIndex((t) => t.id === tab), (i) => setTab(TABS[i].id));

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
      <div className="modal settings-modal" role="dialog" aria-modal="true" aria-label="Settings" tabIndex={-1} ref={ref}>
        <div className="modal-head">
          <strong>Settings</strong>
          <button className="icon-btn" onClick={onClose} aria-label="Close settings">×</button>
        </div>
        <div className="format-tabs settings-tabs" role="tablist" aria-label="Settings" {...roving.groupProps}>
          {TABS.map((t, i) => (
            <button key={t.id} id={`settings-tab-${t.id}`} role="tab" aria-selected={tab === t.id} aria-controls="settings-panel" {...roving.itemProps(i)} className={`format-tab${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="modal-body settings-body" role="tabpanel" id="settings-panel" aria-labelledby={`settings-tab-${tab}`}>
          {tab === 'general' && (
            <>
            <Field
              label="Autosave"
              hint="Keep a copy of the project in this browser while you work"
              note={settings.autosave && !autosaveOk ? 'Autosave is unavailable: the browser refused to store the project.' : null}
            >
              <Check checked={settings.autosave} onChange={(v) => updateSettings({ autosave: v })} ariaLabel="Autosave" />
            </Field>
            <Field label="Start new tables empty" hint="Off: a new project, and the New Data Table dialog, start with sample data. On: they start with blank tables (the dialog still lets you choose).">
              <Check checked={settings.newProjectEmpty} onChange={(v) => updateSettings({ newProjectEmpty: v })} ariaLabel="Start new tables empty" />
            </Field>
            </>
          )}
          {tab === 'tables' && (
            <>
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
            </>
          )}
          {tab === 'export' && (
            <>
            <Field label="Date and time in file names" hint="Exported JSON, CSV, PNG and SVG files get a suffix like _261022_1435 (yymmdd_HHMM)">
              <Check checked={settings.timestampExports} onChange={(v) => updateSettings({ timestampExports: v })} ariaLabel="Date and time in file names" />
            </Field>
            <Field label="Format" hint="Used by the Export button on the Graphs page. PNG is a bitmap; SVG is vector; PDF holds a picture at the resolution below, at the size of the graph.">
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
            <Field label="PNG resolution" hint="Resolution of the PNG of a graph, written into the file. 96 dpi is the size of the graph on screen; 300 dpi is 3.1 times as wide. SVG has no resolution.">
              <SelectInput<string>
                value={String(settings.pngDpi)}
                options={PNG_DPI_CHOICES.map((d) => ({ value: String(d), label: d === 96 ? '96 dpi (screen size)' : `${d} dpi` }))}
                onChange={(v) => updateSettings({ pngDpi: Number(v) as PngDpi })}
              />
            </Field>
            <Field label="PDF resolution" hint="Resolution of the picture in a PDF, and of the PNG of a layout page. A4 at 600 dpi is 4960 × 7016 px and takes a few seconds; SVG has no resolution.">
              <SelectInput<string>
                value={String(settings.exportDpi)}
                options={EXPORT_DPI_CHOICES.map((d) => ({ value: String(d), label: `${d} dpi` }))}
                onChange={(v) => updateSettings({ exportDpi: Number(v) as ExportDpi })}
              />
            </Field>
            </>
          )}
          {tab === 'graphs' && (
            <>
            <NumField label="Default width" unit="px" step={10} slider={false} value={settings.defaultChartWidthPx} min={CHART_PX_MIN} max={CHART_PX_MAX} onCommit={(v) => updateSettings({ defaultChartWidthPx: v })} />
            <NumField label="Default height" unit="px" step={10} slider={false} value={settings.defaultChartHeightPx} min={CHART_PX_MIN} max={CHART_PX_MAX} onCommit={(v) => updateSettings({ defaultChartHeightPx: v })} />
            <div className="muted small">Applies to charts created from now on; existing charts keep their size.</div>
            </>
          )}
        </div>
      </div>
    </div>
    </DialogShell>
  );
}
