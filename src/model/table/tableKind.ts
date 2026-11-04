import { chartTypeInfo } from '../graph/chartTypes';
import { analysisKindApplies, analysesOf } from '../project/analysis';
import type { Analysis, Chart, Id, Project, TableKind } from '../types';

/** What changing the type of a table does besides the table: the graphs of it whose type does not belong to the new one, and the calculations that do not apply to it. */
export function kindChangeEffects(p: Project, tableId: Id, kind: TableKind): { charts: Chart[]; analyses: Analysis[] } {
  return {
    charts: p.charts.filter((c) => c.dataTableId === tableId && chartTypeInfo(c.type)?.tableKind !== kind),
    analyses: analysesOf(p).filter((a) => a.dataTableId === tableId && !analysisKindApplies(a.kind, kind)),
  };
}
