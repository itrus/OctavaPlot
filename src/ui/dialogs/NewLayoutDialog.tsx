import { useState } from 'react';
import { useRoving } from '../inspector/common/roving';
import { GRID_MAX, pageMm, slotRects, standardArrangements } from '../../model/project/layout';
import type { Chart, Id, LayoutArrangement, PageOrientation } from '../../model/types';
import { Modal } from './NewItemDialogs';

export interface NewLayoutOptions {
  orientation: PageOrientation;
  background: string | null;
  showTitle: boolean;
  arrangement: LayoutArrangement;
}

/** A thumbnail of an arrangement: the panels drawn on a page of the chosen orientation. */
function ArrangementSketch({ arrangement, orientation }: { arrangement: LayoutArrangement; orientation: PageOrientation }) {
  const mm = pageMm(orientation);
  const rects = slotRects({ orientation, marginMm: 14, showTitle: false, arrangement, gapMm: 8 });
  const scale = 44 / Math.max(mm.width, mm.height);
  const [w, h] = [mm.width * scale, mm.height * scale];
  // The panels are in pt on the page; the sketch is in px.
  const k = w / ((mm.width * 72) / 25.4);
  return (
    <svg width={w + 2} height={h + 2} viewBox={`-1 -1 ${w + 2} ${h + 2}`} fill="none" stroke="currentColor" strokeWidth={1.2} aria-hidden="true">
      <rect x={0} y={0} width={w} height={h} rx={1.5} />
      {rects.map((r, i) => (
        <rect key={i} x={r.x * k} y={r.y * k} width={r.w * k} height={r.h * k} rx={1} />
      ))}
    </svg>
  );
}

/** A new layout: the page (A4, portrait or landscape), the arrangement of the panels, and whether graphs are put in now. */
export function NewLayoutDialog({ charts, initialChartId, onCreate, onClose }: { charts: Chart[]; initialChartId: Id | undefined; onCreate: (options: NewLayoutOptions, fillFrom?: Id) => void; onClose: () => void }) {
  const [orientation, setOrientation] = useState<PageOrientation>('landscape');
  const [transparent, setTransparent] = useState(false);
  const [background, setBackground] = useState('#ffffff');
  const [showTitle, setShowTitle] = useState(false);
  const [mode, setMode] = useState<'standard' | 'array'>('standard');
  const [standardId, setStandardId] = useState('two');
  const [cols, setCols] = useState(2);
  const [rows, setRows] = useState(1);
  const [fill, setFill] = useState(true);
  const [first, setFirst] = useState<Id>(charts.find((c) => c.id === initialChartId)?.id ?? charts[0]?.id ?? '');

  // Two and three graphs go side by side on a landscape page and one above the other on a portrait page.
  const standards = standardArrangements(orientation);
  const arrangement: LayoutArrangement = mode === 'array' ? { kind: 'grid', cols, rows } : (standards.find((s) => s.id === standardId) ?? standards[0]).arrangement;
  const create = () => onCreate({ orientation, background: transparent ? null : background, showTitle, arrangement }, fill && first !== '' ? first : undefined);
  const counts = Array.from({ length: GRID_MAX }, (_, i) => i + 1);
  const orientations = ['landscape', 'portrait'] as const;
  const rovingOrientation = useRoving(orientations.map(() => true), orientations.indexOf(orientation), (i) => setOrientation(orientations[i]));
  const rovingArrangement = useRoving(standards.map(() => true), mode === 'standard' ? standards.findIndex((s) => s.id === standardId) : -1, (i) => { setMode('standard'); setStandardId(standards[i].id); }, 'both');

  return (
    <Modal title="New layout" confirmLabel="Create layout" onConfirm={create} onClose={onClose} wide>
      <p className="muted">A layout is an A4 page of graphs, exported as one SVG or PNG. Graphs are scaled together, so their fonts and lines match.</p>
      <fieldset className="layout-fieldset">
        <legend>Page</legend>
        <span className="switch-group" role="radiogroup" aria-label="Orientation" {...rovingOrientation.groupProps}>
          {orientations.map((o, i) => (
            <button key={o} role="radio" aria-checked={orientation === o} {...rovingOrientation.itemProps(i)} className={`switch${orientation === o ? ' on' : ''}`} onClick={() => setOrientation(o)}>
              {o === 'landscape' ? 'Landscape' : 'Portrait'}
            </button>
          ))}
        </span>
        <label className="choice-label">
          <input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} /> Transparent background
        </label>
        {!transparent && (
          <label className="choice-label">
            <span>Background colour</span>
            <input type="color" value={background} onChange={(e) => setBackground(e.target.value)} aria-label="Background colour" />
          </label>
        )}
        <label className="choice-label">
          <input type="checkbox" checked={showTitle} onChange={(e) => setShowTitle(e.target.checked)} /> Title on top of the page
        </label>
      </fieldset>
      <fieldset className="layout-fieldset">
        <legend>Arrangement of graphs</legend>
        <div className="choice-grid layout-choices" role="radiogroup" aria-label="Arrangement" {...rovingArrangement.groupProps}>
          {standards.map((s, i) => (
            <button key={s.id} role="radio" aria-checked={mode === 'standard' && standardId === s.id} {...rovingArrangement.itemProps(i)} className={`choice-card${mode === 'standard' && standardId === s.id ? ' selected' : ''}`} onClick={() => { setMode('standard'); setStandardId(s.id); }}>
              <ArrangementSketch arrangement={s.arrangement} orientation={orientation} />
              <span>{s.label}</span>
            </button>
          ))}
        </div>
        <div className="layout-array">
          <label>
            <input type="radio" name="layout-mode" checked={mode === 'array'} onChange={() => setMode('array')} /> Array of graphs:
          </label>
          <select value={cols} onChange={(e) => { setCols(Number(e.target.value)); setMode('array'); }} aria-label="Graphs across">
            {counts.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          across by
          <select value={rows} onChange={(e) => { setRows(Number(e.target.value)); setMode('array'); }} aria-label="Graphs down">
            {counts.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          down
        </div>
      </fieldset>
      <fieldset className="layout-fieldset">
        <legend>Graphs or placeholders</legend>
        <label className="choice-label">
          <input type="radio" name="layout-fill" checked={!fill} onChange={() => setFill(false)} /> Placeholders only. Add graphs later, one at a time.
        </label>
        <label className="choice-label">
          <input type="radio" name="layout-fill" checked={fill} disabled={charts.length === 0} onChange={() => setFill(true)} /> Fill the layout with graphs, starting with:
        </label>
        <select value={first} onChange={(e) => setFirst(e.target.value)} disabled={!fill || charts.length === 0} aria-label="First graph">
          {charts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </fieldset>
    </Modal>
  );
}
