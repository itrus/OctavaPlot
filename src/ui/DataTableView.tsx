import { memo, useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent, type MouseEvent } from 'react';
import type { DataTable } from '../model/types';
import { useApp } from '../state/AppContext';
import { rowTitleAt, sanitizeRowTitle } from '../model/rows';
import { addGroup, addRows, composeCommands, pasteMatrix, removeGroup, renameGroup, setCells, setGroupTitle, setRowTitles, type CellEdit } from '../state/commands';
import { blockToText, formatCell, parseCell, planPaste, selectionStrings } from './cellText';

const ROW_H = 24;
const COL_W = 112;
const ROWNUM_W = 52;
const TITLE_W = 120;
/** Width of the sticky left part: row number plus Row title. */
const STICKY_W = ROWNUM_W + TITLE_W;
const HEADER_H = 58;
const OVERSCAN = 6;

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
      style={{ width: isTitle ? TITLE_W : COL_W }}
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
  const { run, undo, redo, canUndo, canRedo } = useApp();
  const [sel, setSel] = useState<Sel>({ ar: 0, ac: 0, fr: 0, fc: 0 });
  const [editing, setEditing] = useState<Editing | null>(null);
  const editRef = useRef<Editing | null>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  const [scroll, setScroll] = useState({ top: 0, height: 600 });
  const scrollerRef = useRef<HTMLDivElement>(null);
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
  }, []);

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
  const onPaste = (e: ClipboardEvent) => {
    if (editRef.current || fromInput(e)) return;
    e.preventDefault();
    const plan = planPaste(e.clipboardData.getData('text/plain'), bounds(sel));
    if (!plan.ok) {
      setMessage({ kind: 'error', text: plan.message });
      return;
    }
    run(plan.label, pasteMatrix(table.id, plan.row0, plan.col0, plan.matrix, plan.titles ?? undefined));
    setSel(plan.sel);
    setMessage({ kind: 'info', text: plan.message });
  };

  // ---- keyboard (grid, not editing)
  const onKeyDown = (e: KeyboardEvent) => {
    if (editRef.current || fromInput(e)) return;
    const mod = e.ctrlKey || e.metaKey;
    const f = { r: sel.fr, c: sel.fc };
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

  const commitHeader = (kind: 'name' | 'title', groupId: string, el: HTMLInputElement, previous: string) => {
    const v = el.value;
    if (v === previous) return;
    if (kind === 'name' && v.trim() === '') {
      el.value = previous;
      setMessage({ kind: 'error', text: 'A group name cannot be empty.' });
      return;
    }
    setMessage(null);
    run(kind === 'name' ? 'Rename group' : 'Edit column title', kind === 'name' ? renameGroup(table.id, groupId, v.trim()) : setGroupTitle(table.id, groupId, v));
  };

  return (
    <div className="table-view">
      <div className="toolbar">
        <button onClick={() => run('Add group', addGroup(table.id))}>+ Add group</button>
        <button onClick={() => run('Add rows', addRows(table.id, 20))}>+ Add 20 rows</button>
        <span className="sep" />
        <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">Undo</button>
        <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)">Redo</button>
        <span className="toolbar-info">{nCols} groups × {nRows} rows · empty cell = missing value</span>
      </div>
      <div
        className="grid-scroller"
        ref={scrollerRef}
        tabIndex={0}
        onScroll={(e) => setScroll((s) => ({ ...s, top: e.currentTarget.scrollTop }))}
        onKeyDown={onKeyDown}
        onCopy={onCopy}
        onCut={onCut}
        onPaste={onPaste}
        aria-label="Data table"
      >
        <div className="grid-inner" style={{ width: STICKY_W + nCols * COL_W }}>
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
                    onBlur={(e) => commitHeader('name', g.id, e.currentTarget, g.name)}
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
                <input
                  key={`t-${g.title}`}
                  className="head-input head-title"
                  placeholder="Title"
                  defaultValue={g.title}
                  aria-label={`Column title for ${g.name}`}
                  onBlur={(e) => commitHeader('title', g.id, e.currentTarget, g.title)}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                />
              </div>
            ))}
          </div>
          <div style={{ height: first * ROW_H }} />
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
          <div style={{ height: Math.max(0, nRows - last) * ROW_H }} />
        </div>
      </div>
      <div className={`table-status${message?.kind === 'error' ? ' error' : ''}`} role="status">
        {message ? message.text : 'Click a cell, type to edit. Enter ↓, Tab →. Paste tab-separated values from Excel (Ctrl+V).'}
      </div>
    </div>
  );
}
