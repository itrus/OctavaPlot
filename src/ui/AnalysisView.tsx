import { useMemo } from 'react';
import { analysesOf, analysisKindApplies, analysisColumns, analysisTypeInfo } from '../model/analysis';
import { curveFitSheet, type Sheet } from '../model/curveFit';
import { FIT_LIMITS } from '../model/fitOptions';
import { newId } from '../model/ids';
import type { Analysis } from '../model/types';
import { describeValues, descriptiveRows, formatResult } from '../stats/descriptive';
import { FIT_MODELS, fitModelById, type FitModelId } from '../stats/fit';
import { useApp } from '../state/AppContext';
import { addChart, composeCommands, patchAnalysis, patchLook, removeAnalysis } from '../state/commands';
import { copyText, downloadBlob, exportFileName } from '../util/download';
import { NumField } from './inspector/controls';
import { ExportIcon } from './icons';
import { SheetTable, sheetText, useSheetSelection } from './ResultsSheet';
import { UndoRedo } from './UndoRedo';

const LEVELS = [0.9, 0.95, 0.99] as const;

/** The descriptive statistics of every column of the table as a sheet: one row per statistic, one column per column. */
function descriptiveSheet(analysis: Analysis, table: Parameters<typeof analysisColumns>[0]): Sheet {
  const columns = analysisColumns(table);
  const stats = columns.map((c) => describeValues(c.values, analysis.level));
  return {
    corner: analysisTypeInfo(analysis.kind).label,
    columns: columns.map((c) => ({ id: c.id, label: c.label })),
    rows: descriptiveRows(analysis.level).map((r) => ({
      key: r.key,
      label: r.label,
      blank: r.blank,
      indent: r.indent,
      cells: stats.map((d) => (r.value ? formatResult(r.value(d), r.format) : '')),
      exact: stats.map((d) => {
        const v = r.value?.(d);
        return v === null || v === undefined || !Number.isFinite(v) ? '' : r.format === 'percent' ? `${v}%` : String(v);
      }),
    })),
  };
}

/**
 * The results sheet of an analysis. The numbers are calculated from the table every time it is drawn, so they are
 * always current and are never stored. The cells can be selected and copied like those of a data table.
 */
export function AnalysisView({ analysisId }: { analysisId: string }) {
  const { project, run, setView, setStatus, settings } = useApp();
  const analysis = analysesOf(project).find((a) => a.id === analysisId);
  const table = analysis ? project.dataTables.find((t) => t.id === analysis.dataTableId) : undefined;
  const sheet = useMemo<Sheet | null>(() => {
    if (!analysis || !table || !analysisKindApplies(analysis.kind, table.kind)) return null;
    return analysis.kind === 'curvefit' ? curveFitSheet(table, analysis) : descriptiveSheet(analysis, table);
  }, [analysis, table]);
  const selection = useSheetSelection(sheet ?? { corner: '', columns: [], rows: [] }, setStatus);

  if (!analysis) return <div className="empty">This analysis no longer exists.</div>;
  if (!table || !sheet) {
    return <div className="empty">The table of this analysis is gone, or is of a kind this analysis does not apply to.</div>;
  }
  const curveFit = analysis.kind === 'curvefit';
  const model = fitModelById(analysis.model ?? 'linear');

  const exportCsv = () => {
    downloadBlob(new Blob([sheetText(sheet, ',') + '\r\n'], { type: 'text/csv;charset=utf-8' }), exportFileName(analysis.name, 'csv', settings.timestampExports));
    setStatus(`Exported ${analysis.name} as CSV.`);
  };
  const copy = async () => {
    setStatus((await copyText(selection.hasSelection ? selection.selectedText() : sheetText(sheet, '\t'))) ? 'Results copied to the clipboard.' : 'The browser did not allow copying to the clipboard.');
  };
  // A graph of the table that draws this curve fit.
  const makeGraph = () => {
    const id = newId('chart');
    run('New graph', composeCommands(addChart(id, table.id, { widthPx: settings.defaultChartWidthPx, heightPx: settings.defaultChartHeightPx }, 'xyScatter'), patchLook(id, { fit: { analysisId: analysis.id, band: 'confidence', extend: false, showParameters: false } })));
    setView({ kind: 'chart', id });
  };

  return (
    <div className="analysis-view">
      <div className="toolbar">
        <UndoRedo />
        <span className="sep" />
        <input
          className="analysis-name"
          type="text"
          value={analysis.name}
          aria-label="Analysis name"
          onChange={(e) => run('Rename analysis', patchAnalysis(analysis.id, { name: e.target.value }), `analysis:${analysis.id}:name`)}
        />
        {curveFit && (
          <>
            <label className="inline-label">
              Model
              <select value={model.id} onChange={(e) => run('Change model', patchAnalysis(analysis.id, { model: e.target.value as FitModelId }))} aria-label="Model" title={model.formula}>
                {FIT_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </label>
            {model.id === 'polynomial' && (
              <NumField label="Degree" value={analysis.degree ?? 2} min={FIT_LIMITS.degree.min} max={FIT_LIMITS.degree.max} step={1} slider={false} onCommit={(v) => run('Polynomial degree', patchAnalysis(analysis.id, { degree: v }), `analysis:${analysis.id}:degree`)} />
            )}
          </>
        )}
        <label className="inline-label">
          Confidence level
          <select value={analysis.level} onChange={(e) => run('Change confidence level', patchAnalysis(analysis.id, { level: Number(e.target.value) }))} aria-label="Confidence level">
            {LEVELS.map((l) => (
              <option key={l} value={l}>{l * 100}%</option>
            ))}
          </select>
        </label>
        <span className="sep" />
        <button className="icon-text" onClick={exportCsv} title="Download these results as a .csv file">
          <ExportIcon /> Export CSV
        </button>
        <button onClick={() => void copy()} title="Copy the selected cells, or all the results, as tab-separated text">Copy</button>
        {curveFit && <button onClick={makeGraph} title="Make a graph of the table that draws this curve and its band">Make graph</button>}
        <button
          onClick={() => {
            run('Delete analysis', removeAnalysis(analysis.id));
            setView({ kind: 'table', id: table.id });
          }}
          title="Delete this analysis (Undo brings it back)"
        >
          Delete
        </button>
        <span className="toolbar-info">of {table.name} · recalculated when the data change</span>
      </div>
      <div className="results-scroller" tabIndex={0} onKeyDown={selection.onKeyDown} onCopy={selection.onCopy} onMouseUp={selection.release} onMouseLeave={selection.release} aria-label="Results: select cells and press Ctrl+C to copy">
        {sheet.columns.length === 0 ? (
          <div className="empty">{curveFit ? 'The table has no Y series to fit.' : 'The table has no columns to analyse.'}</div>
        ) : (
          <SheetTable sheet={sheet} selection={selection} />
        )}
        <p className="muted small results-note">
          {curveFit
            ? 'Every replicate is a point of the fit; a series entered as means is fitted to the means. Rows with a missing X or Y are left out. The error and the intervals come from the covariance of the parameters (a linear approximation for the curved models), with t-based intervals; they are empty when the points leave no degrees of freedom. A fit that does not settle says so under Notes.'
            : 'Missing cells are left out, not counted as zero. A statistic that cannot be calculated from the values (too few values, or a geometric mean of values that are not all positive) is left empty. Percentiles are the (n + 1) p kind; the median interval is the exact order-statistic one and shows the coverage it actually reaches.'}
        </p>
      </div>
    </div>
  );
}
