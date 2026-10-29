import { useMemo } from 'react';
import { planBatch, type BatchFormat, type BatchPlan } from '../../chart/export/batchExport';
import type { Id, Project } from '../../model/types';
import { useApp } from '../../state/AppContext';
import { EXPORT_DPI_CHOICES, PNG_DPI_CHOICES, type ExportDpi, type PngDpi } from '../../state/settings';
import { Field, SelectInput, SubHeading } from '../inspector/common/controls';
import { Modal } from '../dialogs/NewItemDialogs';
import { exportStatusText, isBusy, type ExportOutcome, type ExportState } from './exportJob';

const FORMATS: ReadonlyArray<readonly [BatchFormat, string]> = [
  ['png', 'PNG'],
  ['svg', 'SVG'],
  ['pdf', 'PDF'],
];

interface Props {
  /** The project as it is now: every graph of the batch is read from this one value. */
  project: Project;
  /** The graphs picked, in the order they are written. */
  ids: readonly Id[];
  /** The state of the export controller of the view that opened the dialog. */
  state: ExportState;
  /** Runs the export of the plan shown, with the format and resolution shown. */
  onExport: (plan: BatchPlan, format: BatchFormat, dpi: number) => Promise<ExportOutcome | void>;
  onClose: () => void;
}

/**
 * Exports the picked graphs as one ZIP: format and resolution (the settings of the single export), the files that will be in it,
 * and what cannot be exported. The warnings, fonts and print-size checks of the report of a single graph are not repeated here: open a
 * graph and its Export to see them.
 */
export function BatchExportDialog({ project, ids, state, onExport, onClose }: Props) {
  const { settings, updateSettings } = useApp();
  const format: BatchFormat = settings.exportFormat;
  // A graph's PNG has its own resolution (96 dpi is its size on screen); a PDF uses the other one, as for a single graph.
  const dpi = format === 'png' ? settings.pngDpi : settings.exportDpi;
  const plan = useMemo(() => planBatch(project, ids, format, dpi, settings.timestampExports), [project, ids, format, dpi, settings.timestampExports]);
  const busy = isBusy(state);
  const reason = plan.tooBig.length > 0 ? `More than the browser can make at ${dpi} dpi: ${plan.tooBig.join('; ')}. Lower the resolution, make those graphs smaller, or choose SVG.` : plan.items.length === 0 ? 'There is no graph to export.' : null;

  return (
    <Modal
      title={`Export ${ids.length === 1 ? '1 graph' : `${ids.length} graphs`}`}
      confirmLabel="Export ZIP"
      confirmDisabled={busy || reason !== null}
      onConfirm={() => void onExport(plan, format, dpi).then((outcome) => outcome && outcome.kind === 'ran' && onClose())}
      onClose={onClose}
      wide
    >
      <Field label="Format" hint="One file for each graph, all in one ZIP file.">
        <span className="switch-group" role="group" aria-label="Export format">
          {FORMATS.map(([value, label]) => (
            <button key={value} className={`switch${format === value ? ' on' : ''}`} aria-pressed={format === value} onClick={() => updateSettings({ exportFormat: value })}>
              {label}
            </button>
          ))}
        </span>
      </Field>
      <Field label="Resolution" hint={format === 'svg' ? 'SVG has no resolution.' : undefined}>
        <SelectInput<string>
          value={String(dpi)}
          disabled={format === 'svg'}
          options={(format === 'png' ? PNG_DPI_CHOICES : EXPORT_DPI_CHOICES).map((d) => ({ value: String(d), label: `${d} dpi` }))}
          onChange={(v) => updateSettings(format === 'png' ? { pngDpi: Number(v) as PngDpi } : { exportDpi: Number(v) as ExportDpi })}
        />
      </Field>
      <SubHeading>Files</SubHeading>
      <ul className="muted small">
        {plan.items.map((it) => (
          <li key={it.file}>
            {it.file}
            {it.pixels ? ` (${it.pixels.width} × ${it.pixels.height} px)` : ''}
          </li>
        ))}
      </ul>
      {plan.skipped.length > 0 && <div className="warnings" role="alert">⚠ Left out, because their data table is missing: {plan.skipped.join(', ')}.</div>}
      {reason && <div className="warnings" role="alert">⚠ {reason}</div>}
      {state.phase === 'failed' && state.error && <div className="warnings" role="alert">⚠ {state.error}</div>}
      <div className="muted small" role="status">{busy ? exportStatusText(state) : ''}</div>
    </Modal>
  );
}
