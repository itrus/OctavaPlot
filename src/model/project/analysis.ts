import { withoutExcluded } from '../table/exclusion';
import { layoutOf, subLabels, tableSeriesWidth, xySeries } from '../table/tableLayout';
import { leadingColumns } from '../graph/chartTypes';
import type { Analysis, AnalysisKind, DataTable, Id, Project, TableKind } from '../types';

interface AnalysisTypeInfo {
  kind: AnalysisKind;
  label: string;
  description: string;
}

/** The analyses that can be added; each belongs to the Results section of the project. */
export const ANALYSIS_TYPES: readonly AnalysisTypeInfo[] = [
  {
    kind: 'descriptive',
    label: 'Descriptive statistics',
    description: 'Number of values, quartiles and percentiles, mean, SD, SEM, coefficient of variation, geometric mean, skewness, kurtosis and confidence intervals, for each column of the table.',
  },
  {
    kind: 'survival',
    label: 'Survival summary',
    description: 'For each group of a survival table: the number of subjects, events and censored, and the median survival time from the Kaplan-Meier estimate (or "Not reached").',
  },
  {
    kind: 'curvefit',
    label: 'Curve fit',
    description: 'Fits a line, a polynomial, an exponential, a peak or a dose-response (logistic) curve to each Y series of an XY table, with the parameters, their errors and confidence intervals, and the goodness of fit. A graph of the table can draw the curve and its band.',
  },
];

export const analysisTypeInfo = (kind: AnalysisKind): AnalysisTypeInfo => ANALYSIS_TYPES.find((a) => a.kind === kind) ?? ANALYSIS_TYPES[0];

/** Table types a column analysis applies to: those whose columns hold measured values. Counts and 1/0 flags are not. */
export const analysisApplies = (kind: TableKind): boolean => kind === 'column' || kind === 'xy' || kind === 'grouped';

/** Whether an analysis of this kind can be made of a table of this type: a curve fit needs the X and Y of an XY table, a survival summary a survival table. */
export const analysisKindApplies = (analysis: AnalysisKind, table: TableKind): boolean => (analysis === 'curvefit' ? table === 'xy' : analysis === 'survival' ? table === 'survival' : analysisApplies(table));

export const analysesOf = (p: Pick<Project, 'analyses'>): Analysis[] => p.analyses ?? [];

/** One column of a table as analysed: its label and its values (null = empty cell). */
interface AnalysisColumn {
  id: Id;
  label: string;
  values: Array<number | null>;
}

/**
 * The columns a column analysis covers: every data column of a column table; the X column and every Y column of an XY
 * table; every column of a grouped table. With sub-columns each is analysed on its own and labelled with its series.
 */
export function analysisColumns(source: DataTable): AnalysisColumn[] {
  const table = withoutExcluded(source);
  if (!analysisApplies(table.kind)) return [];
  const col = (g: DataTable['groups'][number], label: string): AnalysisColumn => ({ id: g.id, label, values: g.observations.map((o) => o.value) });
  if (table.kind === 'column') return table.groups.map((g) => col(g, g.name));
  const out: AnalysisColumn[] = table.groups.slice(0, leadingColumns(table.kind)).map((g) => col(g, g.name));
  const width = tableSeriesWidth(table);
  const subs = subLabels(layoutOf(table));
  for (const s of xySeries(table)) {
    s.columns.forEach((g, k) => out.push(col(g, width > 1 ? `${s.name} ${subs[k] ?? g.name}` : s.name)));
  }
  return out;
}
