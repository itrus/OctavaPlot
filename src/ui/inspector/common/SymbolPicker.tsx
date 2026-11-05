import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { symbolPath } from '../../../chart/shared/parts/symbols';
import { SYMBOL_SHAPES } from '../../../model/graph/look';
import type { SymbolShape } from '../../../model/types';

/** One cell of the picker: a shape, drawn filled or open (open = no fill, only the border). */
interface Cell {
  shape: SymbolShape;
  open: boolean;
}

const row = (shapes: SymbolShape[], open: boolean): Cell[] => shapes.map((shape) => ({ shape, open }));
const SOLID: SymbolShape[] = ['circle', 'square', 'triangle', 'triangleDown', 'diamond', 'star'];
const HALVES: SymbolShape[] = ['halfCircleLeft', 'halfCircleRight', 'halfCircleUp', 'halfCircleDown', 'triangleLeft', 'triangleRight'];
const POLYGONS: SymbolShape[] = ['hexagon', 'pentagon', 'octagon'];

/**
 * The rows of the picker, six to a row and with no gaps: the usual shapes, the half discs and the triangles that point sideways, each solid
 * and then open; the polygons solid and open on one row; then the bars and the marks that are lines and the marks inside shapes (seen when
 * open), from the simplest to the most complicated.
 */
const ROWS: Cell[][] = [
  row(SOLID, false),
  row(SOLID, true),
  row(HALVES, false),
  row(HALVES, true),
  [...row(POLYGONS, false), ...row(POLYGONS, true)],
  [...row(['verticalBar', 'horizontalBar'], false), ...row(['plus', 'cross', 'asterisk', 'hash'], true)],
  row(['target', 'squareDot', 'hexagonDot', 'circlePlus', 'squarePlus', 'circleCross'], true),
  row(['squareCross'], true),
];

const labelOf = (shape: SymbolShape): string => SYMBOL_SHAPES.find((o) => o.value === shape)?.label ?? shape;

/** A small drawing of a shape, in the current text colour. */
function SymbolGlyph({ shape, open }: { shape: SymbolShape; open: boolean }) {
  return (
    <svg width="20" height="20" viewBox="-10 -10 20 20" aria-hidden="true">
      <path d={symbolPath(shape, 0, 0, 12, 1.4)} fill={open ? 'none' : 'currentColor'} stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round" />
    </svg>
  );
}

/** The grid of the shapes, as a radio group. */
export function SymbolGrid({ shape, open, onPick }: { shape: SymbolShape; open: boolean; onPick: (c: Cell) => void }) {
  return (
    <div className="symbol-grid" role="radiogroup" aria-label="Symbol shape">
      {ROWS.map((cells, r) => (
        <div className="symbol-row" key={r}>
          {cells.map((c) => {
            const on = c.shape === shape && c.open === open;
            return (
              <button key={`${c.shape}-${c.open}`} role="radio" aria-checked={on} className={`symbol-cell${on ? ' on' : ''}`} title={`${labelOf(c.shape)}${c.open ? ', open' : ''}`} onClick={() => onPick(c)}>
                <SymbolGlyph shape={c.shape} open={c.open} />
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/**
 * The shape of a symbol, chosen from a grid. A shape drawn open is the same shape with a fill opacity of 0 (only the border shows),
 * so choosing it sets both; the marks inside a shape and the lines are only seen when the fill is clear.
 */
export function SymbolPicker({ shape, fillOpacity, disabled, onChange }: { shape: SymbolShape; fillOpacity: number; disabled?: boolean; onChange: (patch: { symbolShape: SymbolShape; symbolFillOpacity?: number }) => void }) {
  const [menu, setMenu] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const open = fillOpacity === 0;
  // The menu is set in the page, not in the panel (which scrolls and would cut it off): its right edge at the button's, so it opens to the left, below the button or above it when there is no room.
  useLayoutEffect(() => {
    if (!menu || !root.current || !pop.current) return setAt(null);
    const b = root.current.getBoundingClientRect();
    const { width, height } = pop.current.getBoundingClientRect();
    const below = b.bottom + 4;
    const top = below + height <= window.innerHeight - 4 ? below : Math.max(4, b.top - 4 - height);
    setAt({ top, left: Math.max(4, Math.min(b.right - width, window.innerWidth - width - 4)) });
  }, [menu]);
  useEffect(() => {
    if (!menu) return;
    const away = (e: PointerEvent) => !root.current?.contains(e.target as Node) && !pop.current?.contains(e.target as Node) && setMenu(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [menu]);
  return (
    <div className="symbol-picker" ref={root}>
      <button className="symbol-trigger" disabled={disabled} aria-haspopup="true" aria-expanded={menu} onClick={() => setMenu(!menu)}>
        <SymbolGlyph shape={shape} open={open} />
        <span>{labelOf(shape)}{open ? ' (open)' : ''}</span>
      </button>
      {menu &&
        createPortal(
        <div className="symbol-pop" ref={pop} style={at ? { top: at.top, left: at.left } : { visibility: 'hidden' }}>
          <SymbolGrid
            shape={shape}
            open={open}
            onPick={(c) => {
              // Open: clear the fill. Solid: bring the fill back if it was clear.
              onChange({ symbolShape: c.shape, ...(c.open ? { symbolFillOpacity: 0 } : open ? { symbolFillOpacity: 1 } : {}) });
              setMenu(false);
            }}
          />
        </div>,
        document.body,
      )}
    </div>
  );
}
