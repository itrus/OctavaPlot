import { useState } from 'react';
import { MAX_REPLICATES, MIN_REPLICATES, SUMMARY_FORMATS, subLabels } from '../model/tableLayout';
import type { ReplicateLayout, SummaryFormat, TableKind } from '../model/types';
import type { NewTableOptions } from '../state/commands';
import { Modal } from './NewItemDialogs';

type FormatId = 'xy' | 'column' | 'grouped' | 'contingency' | 'survival';

interface Format {
  id: FormatId;
  label: string;
  /** The kind of table it creates; null while the format is not available yet. */
  kind: TableKind | null;
  blurb: string;
}

/** The table formats, as in the top menu of the dialog. */
const FORMATS: readonly Format[] = [
  { id: 'xy', label: 'XY', kind: 'xy', blurb: 'A numeric X column and one or more Y series: how Y changes with X.' },
  { id: 'column', label: 'Column', kind: 'column', blurb: 'One column per group, with its replicate values in the rows: comparing groups.' },
  { id: 'grouped', label: 'Grouped', kind: 'grouped', blurb: 'Two category levels with replicates in subcolumns, for example Male / Female by Control / Treated.' },
  { id: 'contingency', label: 'Contingency', kind: 'contingency', blurb: 'Counts of subjects in each outcome: groups of subjects in the rows, outcomes in the columns.' },
  { id: 'survival', label: 'Survival', kind: 'survival', blurb: 'Time to an event, with censoring, for each group: one row per subject.' },
];

interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
  /** Header cells are shaded. */
  head?: boolean;
  muted?: boolean;
}

const W = 230;
const ROW = 17;

/** Draw a table sketch from cells; the width of the drawing is fixed, the height follows the rows. */
function Sketch({ cells, rows }: { cells: Cell[]; rows: number }) {
  const h = rows * ROW + 2;
  return (
    <svg className="table-sketch" width={W + 2} height={h} viewBox={`-1 -1 ${W + 2} ${h}`} fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true">
      {cells.map((c, i) => (
        <g key={i}>
          <rect x={c.x} y={c.y} width={c.w} height={c.h} fill={c.head ? 'currentColor' : 'none'} fillOpacity={c.head ? 0.1 : 0} strokeOpacity={0.55} />
          {c.text && (
            <text x={c.x + c.w / 2} y={c.y + c.h / 2 + 3.4} textAnchor="middle" fontSize="9.5" fill="currentColor" stroke="none" fontWeight={c.head ? 700 : 400} fillOpacity={c.muted ? 0.55 : 1}>
              {c.text}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

/** Row-number cells down the left, as in the table itself. */
const rowNumbers = (from: number, count: number, y0: number): Cell[] => Array.from({ length: count }, (_, i) => ({ x: 0, y: y0 + i * ROW, w: 22, h: ROW, text: String(from + i), muted: true }));

function XySketch({ layout }: { layout: ReplicateLayout }) {
  const subs = subLabels(layout);
  const w = subs.length;
  const seriesCount = layout.kind === 'single' ? 3 : w <= 3 ? 2 : 1;
  const nCols = 1 + seriesCount * w;
  const cw = (W - 22) / nCols;
  const cells: Cell[] = [];
  const headerRows = layout.kind === 'single' ? 1 : 2;
  const dataRows = 2;
  cells.push({ x: 0, y: 0, w: 22, h: headerRows * ROW, head: true });
  cells.push({ x: 22, y: 0, w: cw, h: headerRows * ROW, text: 'X', head: true });
  for (let s = 0; s < seriesCount; s++) {
    const name = String.fromCharCode(65 + s);
    for (let k = 0; k < w; k++) {
      const x = 22 + cw * (1 + s * w + k);
      if (layout.kind === 'single') cells.push({ x, y: 0, w: cw, h: ROW, text: `Y${s + 1}`, head: true });
      else cells.push({ x, y: ROW, w: cw, h: ROW, text: subs[k].length > 5 ? subs[k].slice(0, 5) : subs[k], head: true });
    }
    if (layout.kind !== 'single') cells.push({ x: 22 + cw * (1 + s * w), y: 0, w: cw * w, h: ROW, text: `Series ${name}`, head: true });
  }
  for (let r = 0; r < dataRows; r++) for (let c = 0; c <= nCols; c++) cells.push({ x: c === 0 ? 0 : 22 + cw * (c - 1), y: (headerRows + r) * ROW, w: c === 0 ? 22 : cw, h: ROW, text: c === 0 ? String(r + 1) : undefined, muted: true });
  return <Sketch cells={cells} rows={headerRows + dataRows} />;
}

function ColumnSketch() {
  const cw = (W - 22) / 4;
  const cells: Cell[] = [{ x: 0, y: 0, w: 22, h: ROW, head: true }];
  ['Group A', 'Group B', 'Group C', 'Group D'].forEach((t, i) => cells.push({ x: 22 + i * cw, y: 0, w: cw, h: ROW, text: t, head: true }));
  cells.push(...rowNumbers(1, 3, ROW));
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) cells.push({ x: 22 + c * cw, y: (r + 1) * ROW, w: cw, h: ROW });
  return <Sketch cells={cells} rows={4} />;
}

function GroupedSketch({ layout }: { layout: ReplicateLayout }) {
  const subs = subLabels(layout);
  const w = subs.length;
  const label = 52;
  const seriesCount = w <= 3 ? 2 : 1;
  const nCols = seriesCount * w;
  const cw = (W - label) / nCols;
  const headerRows = layout.kind === 'single' ? 1 : 2;
  const cells: Cell[] = [{ x: 0, y: 0, w: label, h: headerRows * ROW, head: true, text: 'Category' }];
  for (let s = 0; s < seriesCount; s++) {
    const name = `Group ${String.fromCharCode(65 + s)}`;
    if (layout.kind === 'single') cells.push({ x: label + s * cw, y: 0, w: cw, h: ROW, text: name, head: true });
    else {
      cells.push({ x: label + s * w * cw, y: 0, w: w * cw, h: ROW, text: name, head: true });
      subs.forEach((t, k) => cells.push({ x: label + (s * w + k) * cw, y: ROW, w: cw, h: ROW, text: t.length > 5 ? t.slice(0, 5) : t, head: true }));
    }
  }
  ['Male', 'Female'].forEach((t, r) => {
    cells.push({ x: 0, y: (headerRows + r) * ROW, w: label, h: ROW, text: t });
    for (let c = 0; c < nCols; c++) cells.push({ x: label + c * cw, y: (headerRows + r) * ROW, w: cw, h: ROW });
  });
  return <Sketch cells={cells} rows={headerRows + 2} />;
}

function ContingencySketch() {
  const label = 62;
  // The outcomes only: a Total column would count every subject twice if it were plotted with the others.
  const cw = (W - label) / 2;
  const cells: Cell[] = [{ x: 0, y: 0, w: label, h: ROW, head: true }];
  ['Cured', 'Not cured'].forEach((t, i) => cells.push({ x: label + i * cw, y: 0, w: cw, h: ROW, text: t, head: true }));
  ['Treated', 'Control'].forEach((t, r) => {
    cells.push({ x: 0, y: (1 + r) * ROW, w: label, h: ROW, text: t });
    (r === 0 ? ['38', '12'] : ['21', '29']).forEach((v, c) => cells.push({ x: label + c * cw, y: (1 + r) * ROW, w: cw, h: ROW, text: v, muted: true }));
  });
  return <Sketch cells={cells} rows={3} />;
}

function SurvivalSketch() {
  const cw = (W - 22) / 3;
  const cells: Cell[] = [{ x: 0, y: 0, w: 22, h: ROW, head: true }];
  // One column per group: a 1 (event) or 0 (censored) in the column of the group the subject belongs to, the other left empty.
  ['Time (days)', 'Control', 'Treated'].forEach((t, i) => cells.push({ x: 22 + i * cw, y: 0, w: cw, h: ROW, text: t, head: true }));
  cells.push(...rowNumbers(1, 3, ROW));
  [['12', '1', ''], ['25', '0', ''], ['31', '', '1']].forEach((row, r) => row.forEach((v, c) => cells.push({ x: 22 + c * cw, y: (r + 1) * ROW, w: cw, h: ROW, text: v, muted: true })));
  return <Sketch cells={cells} rows={4} />;
}

function FormatSketch({ id, layout }: { id: FormatId; layout: ReplicateLayout }) {
  switch (id) {
    case 'xy':
      return <XySketch layout={layout} />;
    case 'column':
      return <ColumnSketch />;
    case 'grouped':
      return <GroupedSketch layout={layout} />;
    case 'contingency':
      return <ContingencySketch />;
    case 'survival':
      return <SurvivalSketch />;
  }
}

type XyMode = 'single' | 'replicates' | 'summary';

/**
 * New data table. The format is chosen in the menu along the top (XY, Column, Grouped, Contingency and
 * Survival), then whether to start empty or with sample data, then how the values are entered.
 */
export function NewTableDialog({ defaultSample, onCreate, onClose }: { defaultSample: boolean; onCreate: (kind: TableKind, options: NewTableOptions) => void; onClose: () => void }) {
  const [formatId, setFormatId] = useState<FormatId>('xy');
  const [sample, setSample] = useState(defaultSample);
  const [mode, setMode] = useState<XyMode>('single');
  const [n, setN] = useState(3);
  const [format, setFormat] = useState<SummaryFormat>('mean-sd-n');
  const current = FORMATS.find((f) => f.id === formatId) ?? FORMATS[0];
  // XY and grouped tables let you choose how each series is entered; the others have one way.
  const hasLayoutOptions = formatId === 'xy' || formatId === 'grouped';
  const layout: ReplicateLayout = !hasLayoutOptions || mode === 'single' ? { kind: 'single' } : mode === 'replicates' ? { kind: 'replicates', n } : { kind: 'summary', format };
  const create = () => {
    if (current.kind) onCreate(current.kind, { sample, layout });
  };
  const nValid = Number.isInteger(n) && n >= MIN_REPLICATES && n <= MAX_REPLICATES;
  return (
    <Modal title="New data table" confirmLabel="Create table" onConfirm={() => (!hasLayoutOptions || mode !== 'replicates' || nValid) && create()} onClose={onClose} confirmDisabled={current.kind === null || (mode === 'replicates' && hasLayoutOptions && !nValid)}>
      <div className="format-tabs" role="tablist" aria-label="Table format">
        {FORMATS.map((f) => (
          <button
            key={f.id}
            role="tab"
            aria-selected={formatId === f.id}
            className={`format-tab${formatId === f.id ? ' active' : ''}`}
            title={f.blurb}
            onClick={() => setFormatId(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="format-preview">
        <FormatSketch id={formatId} layout={layout} />
        <p className="muted">{current.blurb}</p>
      </div>

      <fieldset className="dlg-group">
        <legend>Data table</legend>
        <label className="dlg-radio">
          <input type="radio" name="sample" checked={!sample} onChange={() => setSample(false)} /> Enter or import data into a new table
        </label>
        <label className="dlg-radio">
          <input type="radio" name="sample" checked={sample} onChange={() => setSample(true)} /> Start with sample data
        </label>
      </fieldset>

      <fieldset className="dlg-group">
        <legend>Options</legend>
        {hasLayoutOptions ? (
          <>
            <label className="dlg-radio">
              <input type="radio" name="mode" checked={mode === 'single'} onChange={() => setMode('single')} /> {formatId === 'xy' ? 'Enter and plot a single Y value for each point' : 'Enter and plot a single value for each cell'}
            </label>
            <label className="dlg-radio">
              <input type="radio" name="mode" checked={mode === 'replicates'} onChange={() => setMode('replicates')} /> Enter
              <input
                className="dlg-number"
                type="number"
                min={MIN_REPLICATES}
                max={MAX_REPLICATES}
                value={n}
                aria-label="Number of replicate values"
                onFocus={() => setMode('replicates')}
                onChange={(e) => setN(Number(e.target.value))}
              />
              replicate values in side-by-side subcolumns
            </label>
            <label className="dlg-radio">
              <input type="radio" name="mode" checked={mode === 'summary'} onChange={() => setMode('summary')} /> Enter and plot error values already calculated elsewhere
            </label>
            {mode === 'summary' && (
              <div className="dlg-indent">
                Enter:{' '}
                <select value={format} onChange={(e) => setFormat(e.target.value as SummaryFormat)} aria-label="Values entered">
                  {SUMMARY_FORMATS.map((f) => (
                    <option key={f.id} value={f.id}>{f.label}</option>
                  ))}
                </select>
              </div>
            )}
            {mode === 'replicates' && !nValid && <div className="field-error">Enter a whole number from {MIN_REPLICATES} to {MAX_REPLICATES}.</div>}
          </>
        ) : (
          <div className="muted">
            {formatId === 'column' && 'Enter the replicate values of each group down its column.'}
            {formatId === 'contingency' && 'Enter the number of subjects in each outcome, one row per group of subjects.'}
            {formatId === 'survival' && 'Enter one subject per row: the time, then 1 (event) or 0 (censored) in the column of the subject\'s group.'}
            {' '}This table type needs no further options.
          </div>
        )}
      </fieldset>
    </Modal>
  );
}
