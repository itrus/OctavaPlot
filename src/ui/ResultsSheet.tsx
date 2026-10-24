import { useMemo, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import type { Sheet } from '../model/curveFit';
import { copyText } from '../util/download';

/** A cell of the sheet: row 0 and column 0 are the headings. */
type Cell = [number, number];

/** The sheet as a grid of text: the headings, then the rows that hold values (the gaps between groups are not cells). */
const gridOf = (sheet: Sheet, exact = false): string[][] => [[sheet.corner, ...sheet.columns.map((c) => c.label)], ...sheet.rows.filter((r) => !r.blank).map((r) => [r.label, ...(exact ? (r.exact ?? r.cells) : r.cells)])];

const quote = (s: string) => (/["\t\r\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const oneLine = (s: string) => s.replace(/[\t\r\n]+/g, ' ');

/** The cells as text: tab-separated for pasting into a spreadsheet, or as the lines of a CSV file. */
export const sheetText = (sheet: Sheet, separator: '\t' | ','): string => gridOf(sheet, true).map((cells) => cells.map(separator === ',' ? quote : oneLine).join(separator)).join(separator === ',' ? '\r\n' : '\n');

/**
 * Selecting cells of a results sheet like those of a data table: click or drag to select, Shift+click to extend, the
 * arrow keys to move, Ctrl+A for all, Ctrl+C to copy the selected cells as tab-separated text.
 */
export function useSheetSelection(sheet: Sheet, onStatus: (text: string) => void) {
  const grid = useMemo(() => gridOf(sheet), [sheet]);
  const exactGrid = useMemo(() => gridOf(sheet, true), [sheet]);
  const [sel, setSel] = useState<{ anchor: Cell; focus: Cell } | null>(null);
  const [dragging, setDragging] = useState(false);
  const rowsN = grid.length;
  const colsN = grid[0]?.length ?? 0;
  // A selection from an older sheet may lie outside this one (a column was removed): it is clamped.
  const range = sel && {
    r0: Math.min(sel.anchor[0], sel.focus[0]),
    r1: Math.min(rowsN - 1, Math.max(sel.anchor[0], sel.focus[0])),
    c0: Math.min(sel.anchor[1], sel.focus[1]),
    c1: Math.min(colsN - 1, Math.max(sel.anchor[1], sel.focus[1])),
  };
  const inRange = (r: number, c: number) => !!range && r >= range.r0 && r <= range.r1 && c >= range.c0 && c <= range.c1;
  const selectedText = () => (range ? exactGrid.slice(range.r0, range.r1 + 1).map((row) => row.slice(range.c0, range.c1 + 1).map(oneLine).join('\t')).join('\n') : '');

  const press = (r: number, c: number, extend: boolean) => {
    setDragging(true);
    setSel((cur) => (extend && cur ? { anchor: cur.anchor, focus: [r, c] } : { anchor: [r, c], focus: [r, c] }));
  };
  const over = (r: number, c: number) => dragging && setSel((cur) => (cur ? { anchor: cur.anchor, focus: [r, c] } : cur));
  const release = () => setDragging(false);

  const onCopy = (e: ClipboardEvent) => {
    if (!range) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', selectedText());
    onStatus('Copied to the clipboard.');
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && key === 'a') {
      e.preventDefault();
      if (rowsN > 0) setSel({ anchor: [0, 0], focus: [rowsN - 1, colsN - 1] });
    } else if (mod && key === 'c' && range) {
      // A focused sheet with no text selected fires no copy event in some browsers, so copying is done here too.
      e.preventDefault();
      void copyText(selectedText()).then((ok) => onStatus(ok ? 'Copied to the clipboard.' : 'The browser did not allow copying to the clipboard.'));
    } else if (e.key === 'Escape') setSel(null);
    else if (sel && e.key.startsWith('Arrow')) {
      e.preventDefault();
      const [r, c] = sel.focus;
      const next: Cell = [Math.max(0, Math.min(rowsN - 1, r + (e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0))), Math.max(0, Math.min(colsN - 1, c + (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0)))];
      setSel({ anchor: e.shiftKey ? sel.anchor : next, focus: next });
    }
  };
  return { inRange, press, over, release, onCopy, onKeyDown, hasSelection: !!range, selectedText };
}

/** The sheet drawn as a table whose cells can be selected. */
export function SheetTable({ sheet, selection }: { sheet: Sheet; selection: ReturnType<typeof useSheetSelection> }) {
  const { inRange, press, over } = selection;
  let g = 0;
  const cell = (r: number, c: number) => ({ className: inRange(r, c) ? 'picked' : undefined, onMouseDown: (e: { shiftKey: boolean }) => press(r, c, e.shiftKey), onMouseEnter: () => over(r, c) });
  return (
    <table className="results-table">
      <thead>
        <tr>
          <th {...cell(0, 0)} className={`results-corner${inRange(0, 0) ? ' picked' : ''}`}>{sheet.corner}</th>
          {sheet.columns.map((c, i) => (
            <th key={c.id} {...cell(0, i + 1)}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sheet.rows.map((r) => {
          if (r.blank) {
            return (
              <tr key={r.key} className="results-spacer" aria-hidden="true">
                <td colSpan={sheet.columns.length + 1} />
              </tr>
            );
          }
          const row = ++g;
          const head = cell(row, 0);
          return (
            <tr key={r.key}>
              <th scope="row" {...head} className={`${r.indent ? 'results-indent' : ''}${inRange(row, 0) ? ' picked' : ''}`}>{r.label}</th>
              {r.cells.map((text, i) => (
                <td key={sheet.columns[i]?.id ?? i} {...cell(row, i + 1)}>{text}</td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
