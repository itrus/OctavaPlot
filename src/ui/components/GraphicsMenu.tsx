import { useLayoutEffect, useRef, useState } from 'react';
import { useDismiss } from './useDismiss';
import { createPortal } from 'react-dom';
import { drawingGeometry } from '../../chart/shared/scene/drawings';
import { createDrawing, DRAWING_GROUPS, DRAWING_PRESETS, pointsOfDrag, type DrawingPreset } from '../../model/graph/drawingPresets';

/** A small drawing of a preset, made by the code that draws the objects (so the menu shows what is drawn), in the current text colour. */
function DrawingGlyph({ preset }: { preset: DrawingPreset }) {
  // The object as a drag across most of a 20 × 20 box would make it: a line straight across, a side bracket straight down, a shape corner to corner.
  const line = preset.shape === 'line' && preset.corners === 'drag';
  const [a, b] = pointsOfDrag(preset, preset.lock === 'down' ? { x: 10, y: 3 } : line ? { x: 3, y: 11 } : { x: 3, y: 4 }, preset.lock === 'down' ? { x: 10, y: 17 } : line ? { x: 17, y: 11 } : { x: 17, y: 16 });
  const d = createDrawing(preset, { xFrac: a.x / 20, yFrac: a.y / 20 }, { xFrac: b.x / 20, yFrac: b.y / 20 }, { color: 'currentColor', fontSizePt: 7 }, 'glyph');
  const g = drawingGeometry({ ...d, widthPt: 1.3, endSizePt: preset.endSizePt !== undefined ? Math.min(preset.endSizePt, 6) * 0.7 : 4, cornerPt: preset.cornerPt !== undefined ? 4 : undefined, text: d.text !== undefined ? '' : undefined }, a, b);
  // A line with a text shows a small square where the text goes.
  const mark = preset.group === 'text' && g.text ? { x: g.text.anchor === 'middle' ? g.text.x - 2 : g.text.anchor === 'end' ? g.text.x - 4 : g.text.x, y: g.text.y - 3.5 } : null;
  return (
    <svg width="22" height="22" viewBox="0 0 20 20" aria-hidden="true">
      <path d={g.d} fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round" />
      {g.caps && <path d={g.caps} fill="none" stroke="currentColor" strokeWidth={1.3} />}
      {g.heads && <path d={g.heads} fill="currentColor" />}
      {mark && <rect x={mark.x} y={mark.y} width={4} height={4} fill="currentColor" />}
    </svg>
  );
}

/**
 * The Graphics button of a toolbar: a menu of the shapes, lines and lines with text. Choosing one makes it the tool of the pointer: the
 * next drag on the chart or page draws it (a click places it at its own size). `active` is the preset being drawn, if any.
 */
export function GraphicsMenu({ active, onPick }: { active: string | null; onPick: (presetId: string) => void }) {
  const [menu, setMenu] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const current = active ? DRAWING_PRESETS.find((p) => p.id === active) : undefined;
  // Set in the page below the button (above it when there is no room), its left edge at the button's.
  useLayoutEffect(() => {
    if (!menu || !root.current || !pop.current) return setAt(null);
    const b = root.current.getBoundingClientRect();
    const { width, height } = pop.current.getBoundingClientRect();
    const below = b.bottom + 4;
    const top = below + height <= window.innerHeight - 4 ? below : Math.max(4, b.top - 4 - height);
    setAt({ top, left: Math.max(4, Math.min(b.left, window.innerWidth - width - 4)) });
  }, [menu]);
  useDismiss(menu, [root, pop], () => setMenu(false));
  return (
    <span className="graphics-menu" ref={root}>
      <button
        className={`switch icon-text${current ? ' on' : ''}`}
        aria-haspopup="true"
        aria-expanded={menu}
        aria-pressed={!!current}
        title={current ? `${current.label}: drag on the chart where it goes; a click places it at its own size (Escape cancels)` : 'Graphics: shapes, lines and lines with text to draw on the chart'}
        onClick={() => setMenu(!menu)}
      >
        {current ? <DrawingGlyph preset={current} /> : <DrawingGlyph preset={DRAWING_PRESETS.find((p) => p.id === 'ellipse')!} />}
        Graphics
        <span className="caret" aria-hidden="true">▾</span>
      </button>
      {menu &&
        createPortal(
          <div className="symbol-pop graphics-pop" ref={pop} role="menu" aria-label="Graphics" style={at ? { top: at.top, left: at.left } : { visibility: 'hidden' }}>
            {DRAWING_GROUPS.map((g) => (
              <div key={g.id} className="graphics-group">
                <div className="graphics-heading">{g.label}</div>
                <div className="graphics-grid">
                  {DRAWING_PRESETS.filter((p) => p.group === g.id).map((p) => (
                    <button
                      key={p.id}
                      role="menuitemradio"
                      aria-checked={p.id === active}
                      className={`symbol-cell${p.id === active ? ' on' : ''}`}
                      title={p.label}
                      aria-label={p.label}
                      onClick={() => {
                        onPick(p.id);
                        setMenu(false);
                      }}
                    >
                      <DrawingGlyph preset={p} />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </span>
  );
}
