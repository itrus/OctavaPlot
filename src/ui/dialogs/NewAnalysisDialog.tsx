import { useState } from 'react';
import { useRoving } from '../inspector/common/roving';
import { ANALYSIS_TYPES, analysisKindApplies, analysisTypeInfo } from '../../model/project/analysis';
import { tableTypeInfo } from '../../model/graph/chartTypes';
import type { AnalysisKind, DataTable, Id } from '../../model/types';
import { Modal } from './NewItemDialogs';

/** A new analysis: which analysis, and of which table. Only tables of a kind the analysis applies to are offered. */
export function NewAnalysisDialog({ tables, initialTableId, onCreate, onClose }: { tables: DataTable[]; initialTableId: Id; onCreate: (tableId: Id, kind: AnalysisKind) => void; onClose: () => void }) {
  // A curve fit is offered first for an XY table; otherwise descriptive statistics.
  const [kind, setKind] = useState<AnalysisKind>(tables.find((t) => t.id === initialTableId)?.kind === 'xy' ? 'curvefit' : 'descriptive');
  const applicable = tables.filter((t) => analysisKindApplies(kind, t.kind));
  const [chosen, setTableId] = useState<Id>(applicable.find((t) => t.id === initialTableId)?.id ?? applicable[0]?.id ?? '');
  // Changing the kind may leave the chosen table out (a curve fit needs an XY table): the first that suits is taken.
  const tableId = applicable.some((t) => t.id === chosen) ? chosen : (applicable[0]?.id ?? '');
  const info = analysisTypeInfo(kind);
  const roving = useRoving(ANALYSIS_TYPES.map(() => true), ANALYSIS_TYPES.findIndex((a) => a.kind === kind), (i) => setKind(ANALYSIS_TYPES[i].kind), 'both');
  return (
    <Modal title="New analysis" confirmLabel="Create analysis" onConfirm={() => tableId && onCreate(tableId, kind)} onClose={onClose} confirmDisabled={!tableId}>
      <p className="muted">Choose the analysis and the table it is made from. The results are calculated from the data, so they stay current as the data change.</p>
      <div className="choice-grid" role="radiogroup" aria-label="Analysis" {...roving.groupProps}>
        {ANALYSIS_TYPES.map((a, i) => (
          <button key={a.kind} className={`choice-card${kind === a.kind ? ' selected' : ''}`} role="radio" aria-checked={kind === a.kind} {...roving.itemProps(i)} onClick={() => setKind(a.kind)}>
            <strong>{a.label}</strong>
            <span className="muted">{a.description}</span>
          </button>
        ))}
      </div>
      <p className="muted small">More analyses are planned.</p>
      <label className="choice-label">
        <span>Of table</span>
        <select value={tableId} onChange={(e) => setTableId(e.target.value)} aria-label="Data table" disabled={applicable.length === 0}>
          {applicable.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({tableTypeInfo(t.kind).label})
            </option>
          ))}
        </select>
      </label>
      {applicable.length === 0 && <div className="field-error">{kind === 'curvefit' ? 'There is no XY table to fit a curve to.' : 'There is no table this analysis applies to. It needs a column, XY or grouped table.'}</div>}
      {tables.length > applicable.length && applicable.length > 0 && <p className="muted small">{kind === 'curvefit' ? 'A curve fit needs the X and Y values of an XY table.' : `Contingency and survival tables hold counts and event flags, so ${info.label.toLowerCase()} does not apply to them.`}</p>}
    </Modal>
  );
}
