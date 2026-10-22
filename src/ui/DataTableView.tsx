import { memo, useCallback, type CSSProperties, useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent, type MouseEvent } from 'react';
import type { DataTable } from '../model/types';
import { useApp } from '../state/AppContext';
import { rowTitleAt, sanitizeRowTitle } from '../model/rows';
import { addGroup, addRows, composeCommands, pasteMatrix, removeGroup, renameGroup, replaceTableData, setCells, setRowTitles, type CellEdit } from '../state/commands';
import { copyText, downloadBlob, exportFileName } from '../util/download';
import { ExportIcon, ImportIcon } from './icons';
import { importCsv, isCsvFile, tableToCsv } from './csv';
import { UndoRedo } from './UndoRedo';
import { blockToText, formatCell, parseCell, planPaste, selectionStrings } from './cellText';

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
const editText = (table: DataTable, row: number, col: number) =>
  col < 0 ? rowTitleAt(table, row) : formatCell(table.groups[col]?.observations[row]?.value ?? null);

const bounds = (s: Sel) => ({
  r0: Math.min(s.ar, s.fr),
  r1: Math.max(s.ar, s.fr),
  c0: Math.min(s.ac, s.fc),
  c1: Math.max(s.ac, s.fc),
});

interface CellProps {
  row: number;
  col: number;
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
  const cls = `cell${isTitle ? ' cell-title' : ''}${p.inRange ? ' in-range' : ''}${p.active ? ' active' : ''}${p.invalid ? ' invalid' : ''}`;
  return (
    <div
      className={cls}
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

export function DataTableView({ table }: { table: DataTable }) {
  const { run, tableZoom: z, settings } = useApp();
  const ROW_H = BASE_ROW_H * z;
  const COL_W = BASE_COL_W * z;
  const ROWNUM_W = BASE_ROWNUM_W * z;
  const TITLE_W = BASE_TITLE_W * z;
  const STICKY_W = ROWNUM_W + TITLE_W;
  const HEADER_H = BASE_HEADER_H * z;
  const [sel, setSel] = useState<Sel>({ ar: 0, ac: 0, fr: 0, fc: 0 });
  const [editing, setEditing] = useState<Editing | null>(null);
  const editRef = useRef<Editing | null>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  const [scroll, setScroll] = useState({ top: 0, height: 600 });
  const scrollerRef = useRef<HTMLDivElement>(null);
  const csvRef = useRef<HTMLInputElement>(null);
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
      const parsed = parseCell(ed.text);
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
    setEdit({ row, col, text: text ?? editText(table, row, col) });
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
        const parsed = parseCell(editRef.current.text);
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
  const onDouble = useCallback((row: number, col: number) => {
    setMessage(null);
    const ed = { row, col, text: editText(tableRef.current, row, col) };
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
    return blockToText(titles, matrix);
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

  // ---- CSV
  const exportCsv = () => {
    downloadBlob(new Blob([tableToCsv(table)], { type: 'text/csv;charset=utf-8' }), exportFileName(table.name, 'csv', settings.timestampExports));
    setMessage({ kind: 'info', text: `Exported ${table.name} as CSV.` });
  };
  const importFile = async (file: File) => {
    if (!isCsvFile(file)) {
      setMessage({ kind: 'error', text: `${file.name} is not a CSV file. Choose a .csv file.` });
      return;
    }
    const result = importCsv(await file.text());
    if (!result.ok) {
      setMessage({ kind: 'error', text: `Could not import ${file.name}: ${result.message}` });
      return;
    }
    const { data } = result;
    run('Import CSV', replaceTableData(table.id, data));
    setSel({ ar: 0, ac: 0, fr: 0, fc: 0 });
    setMessage({ kind: 'info', text: `Imported ${data.values.length} rows × ${data.names.length} groups from ${file.name}.` });
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
    const plan = planPaste(text, bounds(sel));
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
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); moveTo(f.r + 1, f.c, e.shiftKey); return;
      case 'ArrowUp': e.preventDefault(); moveTo(f.r - 1, f.c, e.shiftKey); return;
      case 'ArrowLeft': e.preventDefault(); moveTo(f.r, f.c - 1, e.shiftKey); return;
      case 'ArrowRight': e.preventDefault(); moveTo(f.r, f.c + 1, e.shiftKey); return;
      case 'Enter': e.preventDefault(); moveTo(sel.ar + (e.shiftKey ? -1 : 1), sel.ac, false); return;
      case 'Tab': e.preventDefault(); moveTo(sel.ar, sel.ac + (e.shiftKey ? -1 : 1), false); return;
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

  return (
    <div className="table-view">
      <div className="toolbar">
        <button onClick={() => run('Add group', addGroup(table.id))}>+ Add group</button>
        <button onClick={() => run('Add rows', addRows(table.id, 20))}>+ Add 20 rows</button>
        <span className="sep" />
        <UndoRedo />
        <span className="sep" />
        <button className="icon-text" onClick={() => csvRef.current?.click()} title="Replace this table with the contents of a .csv file (Undo restores it)">
          <ImportIcon /> Import CSV
        </button>
        <button className="icon-text" onClick={exportCsv} title="Download this table as a .csv file">
          <ExportIcon /> Export CSV
        </button>
        <input
          ref={csvRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void importFile(f);
          }}
        />
        <span className="toolbar-info">{nCols} groups × {nRows} rows · empty cell = missing value</span>
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
        aria-label="Data table"
      >
        <textarea
          ref={catcherRef}
          className="paste-catcher"
          tabIndex={-1}
          aria-hidden="true"
          onPaste={onCatcherPaste}
        />
        <div className="grid-inner" style={{ width: STICKY_W + nCols * COL_W, height: HEADER_H + nRows * ROW_H }}>
          <div className="grid-header" style={{ height: HEADER_H }}>
            <div className="corner" style={{ width: ROWNUM_W }} onClick={() => setSel({ ar: 0, ac: 0, fr: nRows - 1, fc: nCols - 1 })} title="Select all" />
            <div
              className="title-head"
              style={{ width: TITLE_W }}
              onClick={() => setSel({ ar: 0, ac: -1, fr: nRows - 1, fc: -1 })}
              title="Select the Row title column"
            >
              Row title
            </div>
            {table.groups.map((g) => (
              <div className="col-head" style={{ width: COL_W }} key={g.id}>
                <div className="col-head-top">
                  <input
                    key={g.name}
                    className="head-input head-name"
                    defaultValue={g.name}
                    aria-label="Group name"
                    onBlur={(e) => commitName(g.id, e.currentTarget, g.name)}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  />
                  <button
                    className="icon-btn"
                    title={`Remove ${g.name}`}
                    aria-label={`Remove ${g.name}`}
                    onClick={() => run('Remove group', removeGroup(table.id, g.id))}
                    disabled={nCols <= 1}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="grid-rows" style={{ top: HEADER_H + first * ROW_H }}>
          {rowIdx.map((r) => (
            <div className="grid-row" style={{ height: ROW_H }} key={r}>
              <div
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
                    text={formatCell(g.observations[r].value)}
                    inRange={r >= r0 && r <= r1 && c >= c0 && c <= c1}
                    active={r === sel.fr && c === sel.fc}
                    editing={isEditing}
                    invalid={!!(invalidCell && invalidCell.row === r && invalidCell.col === c)}
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
      <div className={`table-status${message?.kind === 'error' ? ' error' : ''}`} role="status">
        {message ? message.text : 'Click a cell, type to edit. Enter ↓, Tab →. Paste tab-separated values from Excel (Ctrl+V); pasting at the Row title column fills titles first, then the value columns.'}
      </div>
    </div>
  );
}
