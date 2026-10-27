import { memo, useCallback, type CSSProperties, useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent, type MouseEvent } from 'react';
import type { DataTable, DecimalSeparator, TableKind } from '../../model/types';
import { useApp } from '../../state/AppContext';
import { rowTitleAt, sanitizeRowTitle } from '../../model/table/rows';
import { newId } from '../../model/ids';
import { addAnalysis, addGroup, appendRows, composeCommands, deleteRows, duplicateRows, insertRows, MAX_TABLE_ROWS, rowRoom, setExcluded, pasteMatrix, removeGroup, renameGroup, removeSeries, renameSeries, replaceTableData, setCells, setRowTitles, type CellEdit } from '../../state/commands';
import { copyText, downloadBlob, exportFileName } from '../../util/download';
import { AddColumnIcon, AddManyRowsIcon, ExcludeIcon, ExportIcon, FitCurveIcon, ImportIcon, IncludeIcon } from '../components/icons';
import { isCsvFile, tableToCsv, type CsvExportMode } from '../data/csv';
import { excludedCount } from '../../model/table/exclusion';
import { ExportCsvDialog } from '../dialogs/ExportCsvDialog';
import { ImportCsvDialog, type CsvImportData } from '../dialogs/ImportCsvDialog';
import { AppendRowsDialog } from '../dialogs/AppendRowsDialog';
import { RowsMenu } from './RowsMenu';
import { leadingColumns, usesSeriesBlocks } from '../../model/graph/chartTypes';
import { layoutOf, subLabels, tableSeriesWidth, xySeries } from '../../model/table/tableLayout';
import { blockToText, formatCell, parseCell, planPaste, selectionStrings } from '../data/cellText';
import { planFill } from '../data/fill';

// Sizes at 100% zoom, in px; the table multiplies them by its zoom.
const BASE_ROW_H = 24;
const BASE_COL_W = 112;
const BASE_ROWNUM_W = 52;
const BASE_TITLE_W = 120;
const BASE_HEADER_H = 34;
/** Rows rendered beyond the viewport on each side: a fast wheel must not outrun them. */
const OVERSCAN = 40;

interface Sel {
  ar: number;
  ac: number;
  fr: number;
  fc: number;
}
interface Editing {
  row: number;
  col: number;
  text: string;
}

/** Text shown when a cell opens for editing; col -1 is the Row title column. */
const editText = (table: DataTable, row: number, col: number, separator: DecimalSeparator) =>
  col < 0 ? rowTitleAt(table, row) : formatCell(table.groups[col]?.observations[row]?.value ?? null, separator);

const bounds = (s: Sel) => ({
  r0: Math.min(s.ar, s.fr),
  r1: Math.max(s.ar, s.fr),
  c0: Math.min(s.ac, s.fc),
  c1: Math.max(s.ac, s.fc),
});

interface CellProps {
  row: number;
  col: number;
  /** The value is kept but not used by any chart or calculation. */
  excluded?: boolean;
  reason?: string;
  /** Cell width in px at the current zoom. */
  width: number;
  text: string;
  inRange: boolean;
  active: boolean;
  editing: Editing | null;
  invalid: boolean;
  onDown: (row: number, col: number, e: MouseEvent) => void;
  onEnter: (row: number, col: number) => void;
  onDouble: (row: number, col: number) => void;
  onEditChange: (text: string) => void;
  onEditKey: (e: KeyboardEvent<HTMLInputElement>) => void;
  onEditBlur: () => void;
}

const Cell = memo(function Cell(p: CellProps) {
  const isTitle = p.col < 0;
  const cls = `cell${isTitle ? ' cell-title' : ''}${p.inRange ? ' in-range' : ''}${p.active ? ' active' : ''}${p.invalid ? ' invalid' : ''}${p.excluded ? ' excluded' : ''}`;
  return (
    <div
      className={cls}
      id={`grid-cell-${p.row}-${p.col}`}
      role="gridcell"
      aria-colindex={p.col + 2}
      aria-selected={p.inRange}
      aria-invalid={p.invalid || undefined}
      title={p.excluded ? `Excluded${p.reason ? `: ${p.reason}` : ''} (kept in the table, not used)` : undefined}
      style={{ width: p.width }}
      onMouseDown={(e) => p.onDown(p.row, p.col, e)}
      onMouseEnter={() => p.onEnter(p.row, p.col)}
      onDoubleClick={() => p.onDouble(p.row, p.col)}
    >
      {p.editing ? (
        <input
          className="cell-input"
          autoFocus
          value={p.editing.text}
          onChange={(e) => p.onEditChange(e.target.value)}
          onKeyDown={p.onEditKey}
          onBlur={p.onEditBlur}
          aria-label={isTitle ? `Row title, row ${p.row + 1}` : `Row ${p.row + 1}`}
        />
      ) : (
        p.text
      )}
    </div>
  );
});

/** What each kind of table calls its parts, for the toolbar, the header and the hint under the grid. */
const KIND_TEXT: Record<TableKind, { label: string; noun: string; add: string; leadName: string; columnName: string; hint: string; tags: { lead: [string, string]; rest: [string, string] } | null }> = {
  column: { label: 'Column table', noun: 'groups', add: '+ Add group', leadName: 'Group name', columnName: 'Group name', hint: '', tags: null },
  xy: { label: 'XY table', noun: 'Y series', add: '+ Add Y series', leadName: 'X column name', columnName: 'Series name', hint: 'First column = X (numbers), every other column is a Y series. ', tags: { lead: ['X', 'The X values'], rest: ['Y', 'A Y series'] } },
  grouped: { label: 'Grouped table', noun: 'groups', add: '+ Add group', leadName: 'Group name', columnName: 'Group name', hint: 'Each row is a category: type its name in the Row title column. Each group of columns is a series. ', tags: null },
  contingency: { label: 'Contingency table', noun: 'outcomes', add: '+ Add outcome', leadName: 'Outcome name', columnName: 'Outcome name', hint: 'Each row is a group of subjects (its name in the Row title column); each column is an outcome; the cells are counts. ', tags: null },
  survival: { label: 'Survival table', noun: 'groups', add: '+ Add group', leadName: 'Time column name', columnName: 'Group name', hint: 'One row per subject: the time in the first column, then 1 (event) or 0 (censored) in the column of the subject\'s group. ', tags: { lead: ['T', 'The time of each subject'], rest: ['G', 'A group: 1 = event, 0 = censored'] } },
};

export function DataTableView({ table }: { table: DataTable }) {
  const { run, tableZoom: z, settings, setView } = useApp();
  // Tables other than the column table group their columns into series; XY and survival tables lead with X / time.
  const isSeries = usesSeriesBlocks(table.kind);
  const lead = leadingColumns(table.kind);
  // An XY table whose series have sub-columns (replicates, or values already calculated) gets a second header row
  // that holds the series name above its sub-columns.
  const layout = layoutOf(table);
  const blockWidth = tableSeriesWidth(table);
  const blocks = isSeries && blockWidth > 1;
  const subs = subLabels(layout);
  const seriesList = isSeries ? xySeries(table) : [];
  const kindText = KIND_TEXT[table.kind];
  const ROW_H = BASE_ROW_H * z;
  const COL_W = BASE_COL_W * z;
  const ROWNUM_W = BASE_ROWNUM_W * z;
  const TITLE_W = BASE_TITLE_W * z;
  const STICKY_W = ROWNUM_W + TITLE_W;
  const HEADER_H = BASE_HEADER_H * z * (blocks ? 2 : 1);
  const [sel, setSel] = useState<Sel>({ ar: 0, ac: 0, fr: 0, fc: 0 });
  const [editing, setEditing] = useState<Editing | null>(null);
  const editRef = useRef<Editing | null>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  const [scroll, setScroll] = useState({ top: 0, height: 600 });
  const scrollerRef = useRef<HTMLDivElement>(null);
  const csvRef = useRef<HTMLInputElement>(null);
  const [dialog, setDialog] = useState<'append' | 'exportCsv' | null>(null);
  // A picked file waits here, read but not imported, while the preview dialog is open.
  const [pendingCsv, setPendingCsv] = useState<{ name: string; text: string } | null>(null);
  const dragging = useRef(false);

  const nRows = table.rowCount;
  const nCols = table.groups.length;

  // Keep selection inside the table (e.g. after undoing a group removal).
  useEffect(() => {
    setSel((s) => ({
      ar: Math.min(s.ar, nRows - 1),
      fr: Math.min(s.fr, nRows - 1),
      ac: Math.max(-1, Math.min(s.ac, nCols - 1)),
      fc: Math.max(-1, Math.min(s.fc, nCols - 1)),
    }));
  }, [nRows, nCols]);

  useEffect(() => {
    const up = () => (dragging.current = false);
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const measure = () => setScroll((s) => ({ ...s, height: el.clientHeight }));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Wheel scrolling is applied here: the browser's smooth scrolling over the virtualised rows made the
  // grid flicker and blank out. Vertical wheel moves through the rows; Shift+wheel moves sideways.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return; // browser zoom
      const unit = e.deltaMode === 1 ? ROW_H : e.deltaMode === 2 ? el.clientHeight - HEADER_H : 1;
      const dy = e.deltaY * unit;
      const dx = e.deltaX * unit;
      e.preventDefault();
      if (e.shiftKey && dx === 0) el.scrollLeft += dy;
      else {
        el.scrollTop += dy;
        el.scrollLeft += dx;
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [ROW_H, HEADER_H]);

  const setEdit = (e: Editing | null) => {
    editRef.current = e;
    setEditing(e);
  };

  const ensureVisible = useCallback((row: number, col: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    const rowTop = row * ROW_H;
    if (rowTop < el.scrollTop) el.scrollTop = rowTop;
    else if (rowTop + ROW_H > el.scrollTop + el.clientHeight - HEADER_H) el.scrollTop = rowTop + ROW_H - (el.clientHeight - HEADER_H);
    if (col < 0) {
      el.scrollLeft = 0;
      return;
    }
    const colLeft = col * COL_W;
    if (colLeft < el.scrollLeft) el.scrollLeft = colLeft;
    else if (colLeft + COL_W > el.scrollLeft + el.clientWidth - STICKY_W) el.scrollLeft = colLeft + COL_W - (el.clientWidth - STICKY_W);
  }, [ROW_H, COL_W, HEADER_H, STICKY_W]);

  const moveTo = useCallback(
    (row: number, col: number, extend: boolean) => {
      const r = Math.max(0, Math.min(nRows - 1, row));
      const c = Math.max(-1, Math.min(nCols - 1, col));
      setSel((s) => (extend ? { ...s, fr: r, fc: c } : { ar: r, ac: c, fr: r, fc: c }));
      ensureVisible(r, c);
    },
    [nRows, nCols, ensureVisible],
  );

  const focusGrid = () => scrollerRef.current?.focus({ preventScroll: true });

  // ---- editing
  const finishEdit = (mode: 'enter' | 'tab' | 'shift-tab' | 'shift-enter' | 'blur') => {
    const ed = editRef.current;
    if (!ed) return;
    if (ed.col < 0) {
      // Row titles are free text: no numeric validation.
      setEdit(null);
      setMessage(null);
      if (sanitizeRowTitle(ed.text) !== rowTitleAt(table, ed.row)) {
        run('Edit row title', setRowTitles(table.id, [{ row: ed.row, title: ed.text }]));
      }
    } else {
      const parsed = parseCell(ed.text, settings.decimalSeparator);
      if (!parsed.ok) {
        setMessage({ kind: 'error', text: `Row ${ed.row + 1}, ${table.groups[ed.col]?.name ?? 'column'}: ${parsed.message}. Enter a number or leave the cell empty.` });
        if (mode === 'blur') {
          setEdit(null);
        }
        return; // keep editing so the user can correct the value
      }
      setEdit(null);
      setMessage(null);
      const group = table.groups[ed.col];
      if (group && group.observations[ed.row]?.value !== parsed.value) {
        run('Edit cell', setCells(table.id, [{ row: ed.row, col: ed.col, value: parsed.value }]));
      }
    }
    if (mode !== 'blur') {
      focusGrid();
      if (mode === 'enter') moveTo(ed.row + 1, ed.col, false);
      else if (mode === 'shift-enter') moveTo(ed.row - 1, ed.col, false);
      else if (mode === 'tab') moveTo(ed.row, ed.col + 1, false);
      else moveTo(ed.row, ed.col - 1, false);
    }
  };

  const startEdit = (row: number, col: number, text?: string) => {
    setMessage(null);
    setEdit({ row, col, text: text ?? editText(table, row, col, settings.decimalSeparator) });
  };

  const onEditKeyImpl = (e: KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    // Enter or Tab while an IME composition is open belongs to the IME.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      finishEdit(e.shiftKey ? 'shift-enter' : 'enter');
    } else if (e.key === 'Tab') {
      e.preventDefault();
      finishEdit(e.shiftKey ? 'shift-tab' : 'tab');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEdit(null);
      setMessage(null);
      focusGrid();
    }
  };

  // ---- mouse
  const onDown = useCallback(
    (row: number, col: number, e: MouseEvent) => {
      if (e.button !== 0) return;
      if (editRef.current && editRef.current.col >= 0 && (editRef.current.row !== row || editRef.current.col !== col)) {
        // Clicking elsewhere commits (or rejects) the current edit first. Title edits have nothing to reject.
        const parsed = parseCell(editRef.current.text, settings.decimalSeparator);
        if (!parsed.ok) {
          e.preventDefault();
          return;
        }
      }
      if (editRef.current && editRef.current.row === row && editRef.current.col === col) return;
      dragging.current = true;
      setSel((s) => (e.shiftKey ? { ...s, fr: row, fc: col } : { ar: row, ac: col, fr: row, fc: col }));
    },
    [],
  );
  const onEnter = useCallback((row: number, col: number) => {
    if (dragging.current) setSel((s) => ({ ...s, fr: row, fc: col }));
  }, []);
  const selRef = useRef(sel);
  selRef.current = sel;
  const tableRef = useRef(table);
  tableRef.current = table;
  const separatorRef = useRef(settings.decimalSeparator);
  separatorRef.current = settings.decimalSeparator;
  const onDouble = useCallback((row: number, col: number) => {
    setMessage(null);
    const ed = { row, col, text: editText(tableRef.current, row, col, separatorRef.current) };
    editRef.current = ed;
    setEditing(ed);
  }, []);
  const onEditChange = useCallback((text: string) => {
    if (editRef.current) {
      editRef.current = { ...editRef.current, text };
      setEditing(editRef.current);
    }
  }, []);
  // Stable wrappers keep the memoised cells from re-rendering on every state change.
  const impl = useRef({ key: onEditKeyImpl, blur: () => finishEdit('blur') });
  impl.current = { key: onEditKeyImpl, blur: () => finishEdit('blur') };
  const onEditKey = useCallback((e: KeyboardEvent<HTMLInputElement>) => impl.current.key(e), []);
  const onEditBlur = useCallback(() => impl.current.blur(), []);

  // ---- selection helpers
  const selectionText = () => {
    const { titles, matrix } = selectionStrings(table, bounds(sel));
    return blockToText(titles, matrix, settings.decimalSeparator);
  };

  // One history entry: the selected row titles are emptied and the selected values cleared.
  const clearSelection = () => {
    const { r0, r1, c0, c1 } = bounds(sel);
    const rows = Array.from({ length: r1 - r0 + 1 }, (_, i) => r0 + i);
    const edits: CellEdit[] = [];
    for (const r of rows) for (let c = Math.max(0, c0); c <= c1; c++) edits.push({ row: r, col: c, value: null });
    if (c0 < 0) {
      const clearTitles = setRowTitles(table.id, rows.map((row) => ({ row, title: '' })));
      if (c1 < 0) run('Clear row titles', clearTitles);
      else run('Clear cells', composeCommands(clearTitles, setCells(table.id, edits)));
    } else run('Clear cells', setCells(table.id, edits));
  };

  // ---- excluding values: kept in the table, left out of every chart and calculation
  const selectedCells = () => {
    const { r0, r1, c0, c1 } = bounds(sel);
    const cells: Array<{ row: number; col: number }> = [];
    for (let r = r0; r <= r1; r++) for (let c = Math.max(0, c0); c <= c1; c++) cells.push({ row: r, col: c });
    return cells;
  };
  const excludeSelection = (excluded: boolean) => {
    const cells = selectedCells();
    if (cells.length === 0) return;
    run(excluded ? 'Exclude values' : 'Include values', setExcluded(table.id, cells, excluded));
    setMessage({ kind: 'info', text: excluded ? 'Excluded the selected values: they stay in the table but no chart or calculation uses them.' : 'Included the selected values again.' });
  };

  // ---- CSV
  const exportCsv = (mode: CsvExportMode = 'entered') => {
    setDialog(null);
    downloadBlob(new Blob([tableToCsv(table, settings.decimalSeparator, mode)], { type: 'text/csv;charset=utf-8' }), exportFileName(table.name, 'csv', settings.timestampExports));
    setMessage({ kind: 'info', text: `Exported ${table.name} as CSV.` });
  };
  const pickFile = async (file: File) => {
    if (!isCsvFile(file)) {
      setMessage({ kind: 'error', text: `${file.name} is not a CSV file. Choose a .csv or .tsv file.` });
      return;
    }
    // The file is read and shown in a dialog; nothing changes until the user confirms there.
    setPendingCsv({ name: file.name, text: await file.text() });
  };
  // A table of series blocks needs whole blocks: the leading column(s), then k series of the same width.
  const checkCsvShape = (data: CsvImportData): string | null =>
    isSeries && (data.names.length < lead + blockWidth || (data.names.length - lead) % blockWidth !== 0)
      ? `It has ${data.names.length} columns, but this ${kindText.label.toLowerCase()} needs ${lead > 0 ? `${lead} leading column${lead === 1 ? '' : 's'} plus ` : ''}a whole number of series of ${blockWidth} column${blockWidth === 1 ? '' : 's'} each.`
      : null;
  const importData = (data: CsvImportData, fileName: string) => {
    setPendingCsv(null);
    run('Import CSV', replaceTableData(table.id, data));
    setSel({ ar: 0, ac: 0, fr: 0, fc: 0 });
    setMessage({ kind: 'info', text: `Imported ${data.values.length} rows × ${data.names.length} groups from ${fileName}.` });
  };

  // ---- rows: each operation is one undo step; afterwards the selection sits on the new rows, or near the removed ones
  const rowsOfSelection = () => {
    const { r0, r1 } = bounds(sel);
    return { r0, r1, count: r1 - r0 + 1 };
  };
  const selectRows = (from: number, to: number) => setSel((s) => ({ ...s, ar: from, fr: to }));
  const noRoom = (need: number) => {
    if (need <= rowRoom(table)) return false;
    setMessage({ kind: 'error', text: `A table holds at most ${MAX_TABLE_ROWS.toLocaleString('en-US')} rows; this one has room for ${rowRoom(table).toLocaleString('en-US')} more.` });
    return true;
  };
  const insertRow = (where: 'above' | 'below') => {
    if (noRoom(1)) return;
    const { r0, r1 } = rowsOfSelection();
    const at = where === 'above' ? r0 : r1 + 1;
    run('Insert row', insertRows(table.id, at, 1));
    selectRows(at, at);
    setMessage({ kind: 'info', text: `Inserted an empty row ${where} row ${where === 'above' ? r0 + 1 : r1 + 1}.` });
    focusGrid();
  };
  const duplicateSelectedRows = () => {
    const { r0, r1, count } = rowsOfSelection();
    if (noRoom(count)) return;
    run(count === 1 ? 'Duplicate row' : 'Duplicate rows', duplicateRows(table.id, Array.from({ length: count }, (_, i) => r0 + i)));
    selectRows(r1 + 1, r1 + count);
    setMessage({ kind: 'info', text: `Duplicated ${count} row${count === 1 ? '' : 's'}: the copies are below, with their titles, values and exclusions.` });
    requestAnimationFrame(() => ensureVisible(r1 + count, selRef.current.fc));
    focusGrid();
  };
  const deleteSelectedRows = () => {
    const { r0, count } = rowsOfSelection();
    if (count >= nRows) {
      setMessage({ kind: 'error', text: 'A table needs at least one row: select fewer rows to delete.' });
      return;
    }
    run(count === 1 ? 'Delete row' : 'Delete rows', deleteRows(table.id, Array.from({ length: count }, (_, i) => r0 + i)));
    const next = Math.min(r0, nRows - count - 1);
    selectRows(next, next);
    setMessage({ kind: 'info', text: `Deleted ${count} row${count === 1 ? '' : 's'}; their values no longer appear in graphs or results that use this table.` });
    focusGrid();
  };
  const appendCount = (count: number) => {
    setDialog(null);
    const before = nRows;
    const added = Math.min(count, rowRoom(table));
    if (added < 1) {
      setMessage({ kind: 'error', text: `A table holds at most ${MAX_TABLE_ROWS.toLocaleString('en-US')} rows.` });
      return;
    }
    run('Append rows', appendRows(table.id, count));
    selectRows(before, before);
    setMessage({ kind: 'info', text: `Added ${added.toLocaleString('en-US')} empty row${added === 1 ? '' : 's'} at the end (${(before + added).toLocaleString('en-US')} in all).` });
    requestAnimationFrame(() => ensureVisible(before, selRef.current.fc));
  };

  // Ctrl+D and Ctrl+R: fill the selection from its first row or column (the row above or column to the left for one row or column); one history entry.
  const fillSelection = (direction: 'down' | 'right') => {
    const plan = planFill(table, bounds(sel), direction);
    if (!plan.ok) {
      setMessage({ kind: 'error', text: plan.message });
      return;
    }
    const values = setCells(table.id, plan.edits);
    run(plan.label, plan.titles.length > 0 ? composeCommands(setRowTitles(table.id, plan.titles), values) : values);
    setMessage({ kind: 'info', text: plan.message });
  };

  // ---- clipboard
  const fromInput = (e: { target: EventTarget }) => e.target instanceof HTMLInputElement;
  const onCopy = (e: ClipboardEvent) => {
    if (editRef.current || fromInput(e)) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', selectionText());
  };
  const onCut = (e: ClipboardEvent) => {
    if (editRef.current || fromInput(e)) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', selectionText());
    clearSelection();
  };
  const pasteText = (text: string) => {
    const plan = planPaste(text, bounds(sel), settings.decimalSeparator);
    if (!plan.ok) {
      setMessage({ kind: 'error', text: plan.message });
      return;
    }
    run(plan.label, pasteMatrix(table.id, plan.row0, plan.col0, plan.matrix, plan.titles ?? undefined));
    setSel(plan.sel);
    setMessage({ kind: 'info', text: plan.message });
  };
  const onPaste = (e: ClipboardEvent) => {
    if (editRef.current || fromInput(e)) return;
    e.preventDefault();
    pasteText(e.clipboardData.getData('text/plain'));
  };
  // Browsers do not reliably send a paste event to a focused element that is not a text field (a selected cell is
  // not one), so Ctrl+V hands focus to this hidden textarea first; the paste then lands there and is applied to the cells.
  const catcherRef = useRef<HTMLTextAreaElement>(null);
  const onCatcherPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    e.stopPropagation();
    pasteText(e.clipboardData.getData('text/plain'));
    focusGrid();
  };

  // ---- keyboard (grid, not editing)
  const onKeyDown = (e: KeyboardEvent) => {
    if (editRef.current || fromInput(e)) return;
    const mod = e.ctrlKey || e.metaKey;
    const f = { r: sel.fr, c: sel.fc };
    if (mod && !e.altKey && !e.shiftKey && e.code === 'KeyV') {
      catcherRef.current?.focus({ preventScroll: true });
      // If no paste arrives (empty clipboard, blocked), the grid takes focus back.
      setTimeout(() => {
        if (document.activeElement === catcherRef.current) focusGrid();
      }, 400);
      return; // no preventDefault: the browser's paste goes to the textarea
    }
    // Browsers do not fire a copy event for a focused grid that has no text selected, so Ctrl+C/X are handled here.
    if (mod && !e.altKey && !e.shiftKey && (e.code === 'KeyC' || e.code === 'KeyX')) {
      e.preventDefault();
      const cut = e.code === 'KeyX';
      const text = selectionText();
      void copyText(text).then((ok) => {
        if (!ok) setMessage({ kind: 'error', text: 'The browser did not allow copying to the clipboard.' });
        else {
          setMessage({ kind: 'info', text: cut ? 'Cut to the clipboard.' : 'Copied to the clipboard.' });
          if (cut) clearSelection();
        }
      });
      return;
    }
    // Fill down and right, as in a spreadsheet. Ctrl+D and Ctrl+R belong to the browser (bookmark, reload) only when the grid is not focused.
    if (mod && !e.altKey && !e.shiftKey && (e.code === 'KeyD' || e.code === 'KeyR')) {
      e.preventDefault();
      fillSelection(e.code === 'KeyD' ? 'down' : 'right');
      return;
    }
    // Row operations. Alt combinations are free: browser zoom uses Ctrl, and typing a character ignores Alt.
    if (e.altKey && !mod) {
      const act = e.shiftKey
        ? e.key === 'ArrowUp' ? () => insertRow('above') : e.key === 'ArrowDown' ? () => insertRow('below') : e.code === 'KeyD' ? duplicateSelectedRows : null
        : e.key === 'Delete' || e.key === 'Backspace' ? deleteSelectedRows : null;
      if (act) {
        e.preventDefault();
        act();
        return;
      }
    }
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); moveTo(f.r + 1, f.c, e.shiftKey); return;
      case 'ArrowUp': e.preventDefault(); moveTo(f.r - 1, f.c, e.shiftKey); return;
      case 'ArrowLeft': e.preventDefault(); moveTo(f.r, f.c - 1, e.shiftKey); return;
      case 'ArrowRight': e.preventDefault(); moveTo(f.r, f.c + 1, e.shiftKey); return;
      case 'Enter': e.preventDefault(); moveTo(sel.ar + (e.shiftKey ? -1 : 1), sel.ac, false); return;
      case 'Tab': {
        // Tab walks the cells (to the next row at the end of one); from the last cell (Shift+Tab: the first) it leaves the grid.
        const lastCol = nCols - 1;
        const [r, c] = [sel.ar, sel.ac];
        if (e.shiftKey ? r === 0 && c <= -1 : r === nRows - 1 && c === lastCol) return;
        e.preventDefault();
        if (e.shiftKey) moveTo(c <= -1 ? r - 1 : r, c <= -1 ? lastCol : c - 1, false);
        else moveTo(c === lastCol ? r + 1 : r, c === lastCol ? -1 : c + 1, false);
        return;
      }
      case 'F2': e.preventDefault(); startEdit(sel.fr, sel.fc); return;
      case 'Delete':
      case 'Backspace': e.preventDefault(); clearSelection(); return;
      case 'PageDown': e.preventDefault(); moveTo(f.r + 15, f.c, e.shiftKey); return;
      case 'PageUp': e.preventDefault(); moveTo(f.r - 15, f.c, e.shiftKey); return;
      default:
    }
    if (mod && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      setSel({ ar: 0, ac: 0, fr: nRows - 1, fc: nCols - 1 });
      return;
    }
    if (!mod && !e.altKey && e.key.length === 1) {
      e.preventDefault();
      startEdit(sel.fr, sel.fc, e.key);
      setSel({ ar: sel.fr, ac: sel.fc, fr: sel.fr, fc: sel.fc });
    }
  };

  const { r0, r1, c0, c1 } = bounds(sel);
  const first = Math.max(0, Math.floor(scroll.top / ROW_H) - OVERSCAN);
  const last = Math.min(nRows, Math.ceil((scroll.top + scroll.height) / ROW_H) + OVERSCAN);
  const rowIdx = useMemo(() => Array.from({ length: Math.max(0, last - first) }, (_, i) => first + i), [first, last]);
  const invalidCell = message?.kind === 'error' && editing ? editing : null;

  const commitName = (groupId: string, el: HTMLInputElement, previous: string) => {
    const v = el.value;
    if (v === previous) return;
    if (v.trim() === '') {
      el.value = previous;
      setMessage({ kind: 'error', text: 'A group name cannot be empty.' });
      return;
    }
    setMessage(null);
    run('Rename group', renameGroup(table.id, groupId, v.trim()));
  };

  // A curve fit of this table is added to the Results (a line to start with: the model is changed there) and opened.
  const fitCurve = () => {
    const id = newId('analysis');
    run('New curve fit', addAnalysis(id, table.id, 'curvefit'));
    setView({ kind: 'analysis', id });
  };

  return (
    <div className="table-view">
      <div className="toolbar">
        <button className="icon-text" onClick={() => run(kindText.add.replace('+ ', ''), addGroup(table.id))} title={kindText.add.replace('+ ', '')}>
          <AddColumnIcon /> {kindText.add.replace('+ ', '')}
        </button>
        <RowsMenu
          label="Rows"
          icon={<AddManyRowsIcon />}
          title="Rows: insert, duplicate, delete or append rows. Each is one Undo step."
          items={[
            { label: 'Insert row above', shortcut: 'Alt+Shift+↑', onSelect: () => insertRow('above') },
            { label: 'Insert row below', shortcut: 'Alt+Shift+↓', onSelect: () => insertRow('below') },
            { label: 'Duplicate selected rows', shortcut: 'Alt+Shift+D', onSelect: duplicateSelectedRows },
            { label: 'Delete selected rows', shortcut: 'Alt+Delete', onSelect: deleteSelectedRows },
            { label: 'Append 1000 rows', onSelect: () => appendCount(1000) },
            { label: 'Append rows…', onSelect: () => setDialog('append') },
          ]}
        />
        <span className="sep" />
        <button className="icon-text" onClick={() => excludeSelection(true)} title="Exclude: keep the selected values in the table but leave them out of every chart and calculation">
          <ExcludeIcon /> Exclude
        </button>
        <button className="icon-text" onClick={() => excludeSelection(false)} title="Include: use the selected values again">
          <IncludeIcon /> Include
        </button>
        <span className="sep" />
        <button className="icon-text" onClick={() => csvRef.current?.click()} title="Import CSV: choose a .csv or .tsv file, check what it will become, then replace this table with it (Undo restores it)">
          <ImportIcon /> Import CSV
        </button>
        <button className="icon-text" onClick={() => (excludedCount(table) > 0 ? setDialog('exportCsv') : exportCsv())} title="Export CSV: download this table as a .csv file (a table with excluded values asks how to write them)">
          <ExportIcon /> Export CSV
        </button>
        {table.kind === 'xy' && (
          <>
            <span className="sep" />
            <button className="icon-text" onClick={fitCurve} title="Fit curve: a line, a curve or a dose-response model for the Y series; the results go to the Results section">
              <FitCurveIcon /> Fit curve
            </button>
          </>
        )}
        <input
          ref={csvRef}
          type="file"
          accept=".csv,.tsv,text/csv,text/tab-separated-values"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void pickFile(f);
          }}
        />
      </div>
      <div
        className="grid-scroller"
        style={{ '--z': z } as CSSProperties}
        ref={scrollerRef}
        tabIndex={0}
        onScroll={(e) => {
          // Read it now: React clears currentTarget before a state updater function runs.
          const top = e.currentTarget.scrollTop;
          setScroll((s) => ({ ...s, top }));
        }}
        onKeyDown={onKeyDown}
        onCopy={onCopy}
        onCut={onCut}
        onPaste={onPaste}
        role="grid"
        aria-label="Data table"
        aria-rowcount={nRows + 1}
        aria-colcount={nCols + 2}
        aria-activedescendant={`grid-cell-${sel.fr}-${sel.fc}`}
      >
        <textarea
          ref={catcherRef}
          className="paste-catcher"
          tabIndex={-1}
          aria-hidden="true"
          onPaste={onCatcherPaste}
        />
        <div className="grid-inner" style={{ width: STICKY_W + nCols * COL_W, height: HEADER_H + nRows * ROW_H }}>
          <div className="grid-header" style={{ height: HEADER_H }} role="row" aria-rowindex={1}>
            <div className="corner" style={{ width: ROWNUM_W }} onClick={() => setSel({ ar: 0, ac: 0, fr: nRows - 1, fc: nCols - 1 })} title="Select all" />
            <div
              className="title-head"
              role="columnheader"
              aria-colindex={1}
              style={{ width: TITLE_W, lineHeight: `${HEADER_H}px` }}
              onClick={() => setSel({ ar: 0, ac: -1, fr: nRows - 1, fc: -1 })}
              title="Select the Row title column"
            >
              Row title
            </div>
            {table.groups.map((g, c) => {
              const k = c - lead;
              const series = blocks && c >= lead && k % blockWidth === 0 ? seriesList[k / blockWidth] : undefined;
              if (blocks && c >= lead) {
                return (
                  <div className="col-head two-row" style={{ width: COL_W }} key={g.id} role="columnheader" aria-colindex={c + 2}>
                    {series && (
                      <div className="series-head" style={{ width: COL_W * blockWidth }}>
                        <span className="axis-tag" title="A Y series">Y</span>
                        <input
                          key={series.name}
                          className="head-input head-name"
                          defaultValue={series.name}
                          aria-label="Series name"
                          onBlur={(e) => {
                            const v = e.currentTarget.value.trim();
                            if (v === series.name) return;
                            if (v === '') {
                              e.currentTarget.value = series.name;
                              setMessage({ kind: 'error', text: 'A series name cannot be empty.' });
                              return;
                            }
                            setMessage(null);
                            run('Rename series', renameSeries(table.id, series.id, v));
                          }}
                          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                        />
                        <button className="icon-btn" title={`Remove ${series.name}`} aria-label={`Remove ${series.name}`} onClick={() => run('Remove series', removeSeries(table.id, series.id))} disabled={seriesList.length <= 1}>
                          ×
                        </button>
                      </div>
                    )}
                    <div className="sub-head">{subs[k % blockWidth]}</div>
                  </div>
                );
              }
              return (
              <div className={`col-head${blocks ? ' two-row' : ''}`} style={{ width: COL_W }} key={g.id} role="columnheader" aria-colindex={c + 2}>
                <div className="col-head-top">
                  {kindText.tags && <span className="axis-tag" title={c < lead ? kindText.tags.lead[1] : kindText.tags.rest[1]}>{c < lead ? kindText.tags.lead[0] : kindText.tags.rest[0]}</span>}
                  <input
                    key={g.name}
                    className="head-input head-name"
                    defaultValue={g.name}
                    aria-label={c < lead ? kindText.leadName : kindText.columnName}
                    onBlur={(e) => commitName(g.id, e.currentTarget, g.name)}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  />
                  <button
                    className="icon-btn"
                    title={`Remove ${g.name}`}
                    aria-label={`Remove ${g.name}`}
                    onClick={() => run('Remove group', removeGroup(table.id, g.id))}
                    disabled={nCols <= 1 || (isSeries && (c < lead || nCols <= lead + 1))}
                    hidden={c < lead}
                  >
                    ×
                  </button>
                </div>
              </div>
              );
            })}
          </div>
          <div className="grid-rows" style={{ top: HEADER_H + first * ROW_H }}>
          {rowIdx.map((r) => (
            <div className="grid-row" style={{ height: ROW_H }} key={r} role="row" aria-rowindex={r + 2}>
              <div
                role="rowheader"
                className={`rownum${r >= r0 && r <= r1 ? ' in-range' : ''}`}
                style={{ width: ROWNUM_W }}
                onClick={() => setSel({ ar: r, ac: 0, fr: r, fc: nCols - 1 })}
              >
                {r + 1}
              </div>
              <Cell
                key="row-title"
                row={r}
                col={-1}
                width={TITLE_W}
                text={rowTitleAt(table, r)}
                inRange={r >= r0 && r <= r1 && c0 < 0}
                active={r === sel.fr && sel.fc === -1}
                editing={editing && editing.row === r && editing.col === -1 ? editing : null}
                invalid={false}
                onDown={onDown}
                onEnter={onEnter}
                onDouble={onDouble}
                onEditChange={onEditChange}
                onEditKey={onEditKey}
                onEditBlur={onEditBlur}
              />
              {table.groups.map((g, c) => {
                const isEditing = editing && editing.row === r && editing.col === c ? editing : null;
                return (
                  <Cell
                    key={g.id}
                    row={r}
                    col={c}
                    width={COL_W}
                    text={formatCell(g.observations[r].value, settings.decimalSeparator)}
                    inRange={r >= r0 && r <= r1 && c >= c0 && c <= c1}
                    active={r === sel.fr && c === sel.fc}
                    editing={isEditing}
                    invalid={!!(invalidCell && invalidCell.row === r && invalidCell.col === c)}
                    excluded={g.observations[r].excluded === true}
                    reason={g.observations[r].excludedReason}
                    onDown={onDown}
                    onEnter={onEnter}
                    onDouble={onDouble}
                    onEditChange={onEditChange}
                    onEditKey={onEditKey}
                    onEditBlur={onEditBlur}
                  />
                );
              })}
            </div>
          ))}
          </div>
        </div>
      </div>
      {dialog === 'exportCsv' && <ExportCsvDialog excluded={excludedCount(table)} onExport={exportCsv} onClose={() => setDialog(null)} />}
      {dialog === 'append' && <AppendRowsDialog room={rowRoom(table)} limit={MAX_TABLE_ROWS} onAppend={appendCount} onClose={() => setDialog(null)} />}
      {pendingCsv && (
        <ImportCsvDialog
          fileName={pendingCsv.name}
          text={pendingCsv.text}
          defaultSeparator={settings.decimalSeparator}
          check={checkCsvShape}
          onImport={(data) => importData(data, pendingCsv.name)}
          onClose={() => setPendingCsv(null)}
        />
      )}
      <div className={`table-status${message?.kind === 'error' ? ' error' : ''}`} role="status">
        {message ? message.text : kindText.hint + 'Click a cell, type to edit. Enter ↓, Tab →. Paste tab-separated values from Excel (Ctrl+V); pasting at the Row title column fills titles first, then the value columns.'}
      </div>
    </div>
  );
}
