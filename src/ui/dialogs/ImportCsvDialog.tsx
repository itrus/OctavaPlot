import { useMemo, useState } from 'react';
import type { DecimalSeparator } from '../../model/types';
import { detectDelimiter, previewCsv, type CsvDelimiter } from '../data/csv';
import { formatCellFor } from '../data/cellText';
import { DURATION_UNITS, TIME_KINDS, timeColumn, type TimeColumn, type TimeKind, type TimeUnit } from '../../util/timeColumn';
import { Check, Field, SelectInput } from '../inspector/common/controls';
import { Modal } from './NewItemDialogs';

/** What a confirmed import hands back: the table data and what the file was read with. */
export type CsvImportData = Extract<ReturnType<typeof previewCsv>, { ok: true }>['data'] & object;

/** Problem cells listed in full up to this many; the count says how many more there are. */
const MAX_LISTED = 50;

const DELIMITERS: Array<{ value: CsvDelimiter; label: string }> = [
  { value: ',', label: 'Comma' },
  { value: ';', label: 'Semicolon' },
  { value: '\t', label: 'Tab' },
];
const SEPARATORS: Array<{ value: DecimalSeparator; label: string }> = [
  { value: 'point', label: 'Point: 1234.5' },
  { value: 'comma', label: 'Comma: 1234,5' },
  { value: 'auto', label: 'Automatic (point or comma; 1,234 is refused)' },
];

const cellStyle = { border: '1px solid var(--border)', padding: '2px 6px', verticalAlign: 'top', whiteSpace: 'nowrap', textAlign: 'left', fontSize: 12 } as const;
const muted = { color: 'var(--muted)', fontSize: 11 } as const;
const danger = { color: 'var(--danger)', fontSize: 11, whiteSpace: 'normal', maxWidth: 220 } as const;

/**
 * Shown after a CSV or tab-separated file is picked: what the file would become under the chosen delimiter and decimal
 * separator, cell by cell, with every cell that cannot be read listed. Nothing changes until Import.
 * `check` is the table's own rule for the shape of the data (null: fine, else why not).
 */
export function ImportCsvDialog({
  fileName,
  text,
  defaultSeparator,
  xType,
  check,
  onImport,
  onClose,
}: {
  fileName: string;
  text: string;
  defaultSeparator: DecimalSeparator;
  /** An XY table: its first data column may hold dates, times or durations, and `current` is the type it has now. Null for other tables. */
  xType: { current: TimeColumn | undefined } | null;
  check: (data: CsvImportData) => string | null;
  onImport: (data: CsvImportData, separator: DecimalSeparator) => void;
  onClose: () => void;
}) {
  const [delimiter, setDelimiter] = useState<CsvDelimiter>(() => detectDelimiter(text, defaultSeparator === 'comma' ? ';' : ','));
  const [separator, setSeparator] = useState<DecimalSeparator>(defaultSeparator);
  // null: go by the header "Row title"; once the box is ticked or cleared it is the user's choice.
  const [titlesChoice, setTitlesChoice] = useState<boolean | null>(null);
  const firstColumn = titlesChoice === null ? 'auto' : titlesChoice ? 'titles' : 'values';
  // The type of the first data column (an XY table's X): the table's own to begin with; a suggestion from the file is offered, never taken.
  const [xKind, setXKind] = useState<TimeKind | 'number'>(xType?.current?.kind ?? 'number');
  const [xUnit, setXUnit] = useState<TimeUnit>(xType?.current?.kind === 'duration' ? xType.current.unit : 'h');
  const xTime = xType && xKind !== 'number' ? timeColumn(xKind, xUnit) : undefined;
  const preview = useMemo(() => previewCsv(text, { delimiter, separator, firstColumn, times: [xTime] }), [text, delimiter, separator, firstColumn, xTime?.kind, xTime?.unit]);
  const shapeProblem = preview.ok && preview.data ? check(preview.data) : null;
  const canImport = preview.ok && preview.data !== null && shapeProblem === null;

  return (
    <Modal
      title="Import CSV"
      confirmLabel="Import"
      confirmDisabled={!canImport}
      wide
      onClose={onClose}
      onConfirm={() => {
        if (preview.ok && preview.data && !shapeProblem) onImport(preview.data, separator);
      }}
    >
      <div style={{ display: 'grid', gap: 8 }}>
        <div>
          <strong>{fileName}</strong>
          {preview.ok && (
            <span style={muted}>
              {' '}
              {preview.rowCount} row{preview.rowCount === 1 ? '' : 's'} × {preview.columnCount} column{preview.columnCount === 1 ? '' : 's'}
              {preview.hasTitles ? ' (plus row titles)' : ''}
            </span>
          )}
        </div>
        <Field label="Delimiter" hint="What separates the fields of the file. Chosen from the header line.">
          <SelectInput<CsvDelimiter> value={delimiter} options={DELIMITERS} onChange={setDelimiter} />
        </Field>
        <Field label="Decimal separator" hint="How the numbers in the file are written. Thousands separators are never read.">
          <SelectInput<DecimalSeparator> value={separator} options={SEPARATORS} onChange={setSeparator} />
        </Field>
        <Field label="First column is Row titles" hint="Ticked by itself when the first header is Row title. The row titles are text, never numbers.">
          <Check checked={titlesChoice ?? (preview.ok && preview.hasTitles)} onChange={setTitlesChoice} ariaLabel="First column is Row titles" />
        </Field>
        {xType && (
          <>
            <Field label="First data column (X) holds" hint="Dates and times are read as ISO 8601 (2025-03-04, 2025-03-04T10:30:00); nothing else is guessed. A time with an offset (+02:00) is converted to UTC and a notice says so.">
              <SelectInput<TimeKind | 'number'> value={xKind} options={[{ value: 'number', label: 'Numbers' }, ...TIME_KINDS]} onChange={setXKind} />
            </Field>
            {xKind === 'duration' && (
              <Field label="Durations are stored in" hint="A value written 1:30:00 is converted to this unit; a bare number is already in it.">
                <SelectInput<TimeUnit> value={xUnit} options={DURATION_UNITS.map((u) => ({ value: u.value, label: u.label }))} onChange={setXUnit} />
              </Field>
            )}
            {preview.ok && preview.suggestedTime && xKind === 'number' && (
              <div role="status" style={muted}>
                The first data column looks like {preview.suggestedTime.kind === 'date' ? 'dates' : preview.suggestedTime.kind === 'datetime' ? 'dates and times' : 'durations'}.{' '}
                <button onClick={() => { setXKind(preview.suggestedTime!.kind); setXUnit(preview.suggestedTime!.unit); }}>Read it that way</button>
              </div>
            )}
          </>
        )}
        {!preview.ok && (
          <div role="alert" style={{ color: 'var(--danger)' }}>
            {preview.message}
          </div>
        )}
        {preview.ok && (
          <>
            <div style={{ overflow: 'auto', maxHeight: '38vh', border: '1px solid var(--border)' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%' }} aria-label="Preview of the file">
                <thead>
                  <tr>
                    <th style={cellStyle}>Line</th>
                    {preview.hasTitles && <th style={cellStyle}>Row title</th>}
                    {preview.names.slice(0, preview.rows[0]?.cells.length ?? 0).map((n, i) => (
                      <th key={i} style={cellStyle}>
                        {n}
                      </th>
                    ))}
                    {preview.hiddenColumns > 0 && <th style={{ ...cellStyle, ...muted }}>+{preview.hiddenColumns} more</th>}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.line}>
                      <td style={{ ...cellStyle, ...muted }}>{r.line}</td>
                      {r.title !== null && <td style={cellStyle}>{r.title}</td>}
                      {r.cells.map((c, i) => (
                        <td key={i} style={cellStyle} title={c.problem ?? undefined}>
                          <div>{c.text === '' ? <span style={muted}>(empty)</span> : c.text}</div>
                          {c.problem ? <div style={danger}>{c.problem}</div> : c.text.trim() !== '' && <div style={muted}>= {formatCellFor(c.value, separator, i === 0 ? xTime : undefined)}</div>}
                        </td>
                      ))}
                      {preview.hiddenColumns > 0 && <td style={cellStyle} />}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.notes.length > 0 && (
              <div role="status" style={muted}>
                {preview.notes.join('. ')}.
              </div>
            )}
            {preview.rowCount > preview.rows.length && <div style={muted}>The first {preview.rows.length} of {preview.rowCount} rows are shown.</div>}
            {preview.problems.length > 0 && (
              <div role="alert">
                <div style={{ color: 'var(--danger)' }}>
                  {preview.problems.length} cell{preview.problems.length === 1 ? '' : 's'} cannot be read. Change the delimiter or decimal separator, or fix the file; Import stays off until none is left.
                </div>
                <ul style={{ margin: '4px 0 0', paddingLeft: 18, maxHeight: '18vh', overflow: 'auto', fontSize: 12 }}>
                  {preview.problems.slice(0, MAX_LISTED).map((p) => (
                    <li key={`${p.line}:${p.column}`}>
                      Line {p.line}, column {p.column} ({p.label}): <code>{p.text}</code>: {p.message}
                    </li>
                  ))}
                  {preview.problems.length > MAX_LISTED && <li>and {preview.problems.length - MAX_LISTED} more</li>}
                </ul>
              </div>
            )}
            {shapeProblem && (
              <div role="alert" style={{ color: 'var(--danger)' }}>
                {shapeProblem}
              </div>
            )}
            <div style={muted}>Import replaces the data of this table. Undo brings it back.</div>
          </>
        )}
      </div>
    </Modal>
  );
}
