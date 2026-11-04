import { MAX_REPLICATES, MIN_REPLICATES, SUMMARY_FORMATS } from '../../model/table/tableLayout';
import type { ReplicateLayout, SummaryFormat } from '../../model/types';

/** How the Y series of an XY or a grouped table are entered: the choices of the "Options" of a new table and of a table whose type is changed. */
export type LayoutMode = 'single' | 'replicates' | 'summary' | 'sized' | 'xerror';

export interface LayoutChoice {
  mode: LayoutMode;
  /** The number of replicate subcolumns. */
  n: number;
  /** The format of values already calculated. */
  format: SummaryFormat;
}

export const isValidReplicates = (n: number): boolean => Number.isInteger(n) && n >= MIN_REPLICATES && n <= MAX_REPLICATES;

/** The layout a choice stands for; only XY and grouped tables have one. */
export function layoutOfChoice(choice: LayoutChoice, hasLayout: boolean): ReplicateLayout {
  if (!hasLayout || choice.mode === 'single') return { kind: 'single' };
  if (choice.mode === 'replicates') return { kind: 'replicates', n: choice.n };
  if (choice.mode === 'sized') return { kind: 'sized' };
  if (choice.mode === 'xerror') return { kind: 'xerror' };
  return { kind: 'summary', format: choice.format };
}

/** The choice that shows a layout (the one a table has). */
export function choiceOfLayout(layout: ReplicateLayout | undefined): LayoutChoice {
  const base: LayoutChoice = { mode: 'single', n: 3, format: 'mean-sd-n' };
  if (!layout || layout.kind === 'single') return base;
  if (layout.kind === 'replicates') return { ...base, mode: 'replicates', n: layout.n };
  if (layout.kind === 'summary') return { ...base, mode: 'summary', format: layout.format };
  return { ...base, mode: layout.kind };
}

/** The radio buttons for the layout of the series. `xy` adds the layouts that exist for XY tables only. */
export function TableLayoutOptions({ xy, choice, onChoice }: { xy: boolean; choice: LayoutChoice; onChoice: (c: LayoutChoice) => void }) {
  const { mode, n, format } = choice;
  const setMode = (m: LayoutMode) => onChoice({ ...choice, mode: m });
  const setN = (v: number) => onChoice({ ...choice, n: v });
  const setFormat = (v: SummaryFormat) => onChoice({ ...choice, mode: 'summary', format: v });
  const formatId = xy ? 'xy' : 'grouped';
  const nValid = isValidReplicates(n);
  return (
    <>
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
            <input type="radio" name="mode" checked={mode === 'single'} onChange={() => setMode('single')} /> {formatId === 'xy' ? 'Enter and plot a single Y value for each point' : 'Enter and plot a single value for each cell'}
          </label>
          <label className="dlg-radio">
            <input type="radio" name="mode" checked={mode === 'summary'} onChange={() => setMode('summary')} /> Enter and plot error values already calculated elsewhere
          </label>
          <div className="dlg-indent">
            Enter:{' '}
            <select
              value={format}
              onFocus={() => setMode('summary')}
              onChange={(e) => {
                setMode('summary');
                setFormat(e.target.value as SummaryFormat);
              }}
              aria-label="Values entered"
            >
              {SUMMARY_FORMATS.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          </div>
          {formatId === 'xy' && (
            <label className="dlg-radio">
              <input type="radio" name="mode" checked={mode === 'sized'} onChange={() => setMode('sized')} /> Enter a Y and a size for each point (bubbles)
            </label>
          )}
          {formatId === 'xy' && (
            <label className="dlg-radio">
              <input type="radio" name="mode" checked={mode === 'xerror'} onChange={() => setMode('xerror')} /> Enter a Y, an error of Y and an error of X for each point (error bars along both axes)
            </label>
          )}
          {mode === 'replicates' && !nValid && <div className="field-error">Enter a whole number from {MIN_REPLICATES} to {MAX_REPLICATES}.</div>}
    </>
  );
}
