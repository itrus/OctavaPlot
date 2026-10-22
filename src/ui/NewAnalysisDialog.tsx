import { useState } from 'react';
import { ANALYSIS_TYPES, analysisApplies, analysisTypeInfo } from '../model/analysis';
import { tableTypeInfo } from '../model/chartTypes';
import type { AnalysisKind, DataTable, Id } from '../model/types';
import { Modal } from './NewItemDialogs';

/** A new analysis: which analysis, and of which table. Only tables of a kind the analysis applies to are offered. */
export function NewAnalysisDialog({ tables, initialTableId, onCreate, onClose }: { tables: DataTable[]; initialTableId: Id; onCreate: (tableId: Id, kind: AnalysisKind) => void; onClose: () => void }) {
  const applicable = tables.filter((t) => analysisApplies(t.kind));
  const [kind, setKind] = useState<AnalysisKind>('descriptive');
  const [tableId, setTableId] = useState<Id>(applicable.find((t) => t.id === initialTableId)?.id ?? applicable[0]?.id ?? '');
  const info = analysisTypeInfo(kind);
  return (
    <Modal title="New analysis" confirmLabel="Create analysis" onConfirm={() => tableId && onCreate(tableId, kind)} onClose={onClose} confirmDisabled={!tableId}>
      <p className="muted">Choose the analysis and the table it is made from. The results are calculated from the data, so they stay current as the data change.</p>
      <div className="choice-grid" role="radiogroup" aria-label="Analysis">
        {ANALYSIS_TYPES.map((a) => (
          <button key={a.kind} className={`choice-card${kind === a.kind ? ' selected' : ''}`} role="radio" aria-checked={kind === a.kind} onClick={() => setKind(a.kind)}>
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
      {applicable.length === 0 && <div className="field-error">There is no table this analysis applies to. It needs a column, XY or grouped table.</div>}
      {tables.length > applicable.length && applicable.length > 0 && <p className="muted small">Contingency and survival tables hold counts and event flags, so {info.label.toLowerCase()} does not apply to them.</p>}
    </Modal>
  );
}
