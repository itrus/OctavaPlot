import { useMemo } from 'react';
import { planBatch, type BatchFormat, type BatchPlan } from '../../chart/export/batchExport';
import type { Id, Project } from '../../model/types';
import { useApp } from '../../state/AppContext';
import { Field, SubHeading } from '../inspector/common/controls';
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
  /** Runs the export of the plan shown, with the format shown. */
  onExport: (plan: BatchPlan, format: BatchFormat) => Promise<ExportOutcome | void>;
  onClose: () => void;
}

/**
 * Exports the picked graphs as one ZIP: the format (the setting of the single export), the files that will be in it, and what
 * cannot be exported. A PNG is at the size of its graph. The warnings and fonts of the report of a single graph are not repeated
 * here: open a graph and its Export to see them.
 */
export function BatchExportDialog({ project, ids, state, onExport, onClose }: Props) {
  const { settings, updateSettings } = useApp();
  const format: BatchFormat = settings.exportFormat;
  const plan = useMemo(() => planBatch(project, ids, format, settings.timestampExports), [project, ids, format, settings.timestampExports]);
  const busy = isBusy(state);
  const reason = plan.tooBig.length > 0 ? `More than the browser can make: ${plan.tooBig.join('; ')}. Make those graphs smaller, or choose SVG.` : plan.items.length === 0 ? 'There is no graph to export.' : null;

  return (
    <Modal
      title={`Export ${ids.length === 1 ? '1 graph' : `${ids.length} graphs`}`}
      confirmLabel="Export ZIP"
      confirmDisabled={busy || reason !== null}
      onConfirm={() => void onExport(plan, format).then((outcome) => outcome && outcome.kind === 'ran' && onClose())}
      onClose={onClose}
      wide
    >
      <Field label="Format" hint="One file for each graph, all in one ZIP file. A PNG is at the size of its graph on screen.">
        <span className="switch-group" role="group" aria-label="Export format">
          {FORMATS.map(([value, label]) => (
            <button key={value} className={`switch${format === value ? ' on' : ''}`} aria-pressed={format === value} onClick={() => updateSettings({ exportFormat: value })}>
              {label}
            </button>
          ))}
        </span>
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
