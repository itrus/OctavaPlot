import { useState } from 'react';
import type { CsvExportMode } from '../data/csv';
import { Modal } from './NewItemDialogs';

const CHOICES: Array<{ mode: CsvExportMode; label: string; about: string }> = [
  { mode: 'entered', label: 'All rows as entered', about: 'Every value as stored, excluded values included.' },
  { mode: 'analysis', label: 'Analysis-ready', about: 'Excluded values are written as empty cells, so the file shows what the charts and calculations used.' },
  { mode: 'withExclusions', label: 'As entered with exclusion columns', about: 'Every value as stored, and after each column that has excluded values, a "<Group> excluded" column (1 or empty) and a "<Group> excluded reason" column.' },
];

/** Asks what a CSV export does with the excluded values of the table. */
export function ExportCsvDialog({ excluded, onExport, onClose }: { excluded: number; onExport: (mode: CsvExportMode) => void; onClose: () => void }) {
  const [mode, setMode] = useState<CsvExportMode>('entered');
  return (
    <Modal title="Export CSV" confirmLabel="Export" onClose={onClose} onConfirm={() => onExport(mode)}>
      <div style={{ color: 'var(--muted)', fontSize: 11.5, marginBottom: 8 }}>
        This table has {excluded.toLocaleString('en-US')} excluded value{excluded === 1 ? '' : 's'}: kept in the table, but left out of every chart and calculation.
      </div>
      <div style={{ display: 'grid', gap: 8 }} role="radiogroup" aria-label="What to export">
        {CHOICES.map((c) => (
          <label key={c.mode} style={{ display: 'grid', gap: 2 }}>
            <span>
              <input type="radio" name="csv-export-mode" checked={mode === c.mode} onChange={() => setMode(c.mode)} /> {c.label}
            </span>
            <span style={{ color: 'var(--muted)', fontSize: 11.5, marginLeft: 22 }}>{c.about}</span>
          </label>
        ))}
      </div>
      <div style={{ color: 'var(--muted)', fontSize: 11.5, marginTop: 8 }}>
        Whatever you choose, a column whose values name subjects is followed by a "&lt;Group&gt; subject" column, and the first column of a series with a factor by a "&lt;Group&gt; factor" column, so that the file reads back with the same roles.
      </div>
    </Modal>
  );
}
