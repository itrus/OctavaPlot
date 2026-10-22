import { useMemo } from 'react';
import { analysesOf, analysisApplies, analysisColumns, analysisTypeInfo } from '../model/analysis';
import { describeValues, descriptiveRows, formatResult } from '../stats/descriptive';
import { useApp } from '../state/AppContext';
import { patchAnalysis, removeAnalysis } from '../state/commands';
import { copyText, downloadBlob, exportFileName } from '../util/download';
import { ExportIcon } from './icons';
import { UndoRedo } from './UndoRedo';

const LEVELS = [0.9, 0.95, 0.99] as const;

const quote = (s: string) => (/["\t\r\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/**
 * The results sheet of an analysis: one row per statistic, one column per column of the table. The numbers are
 * calculated from the table every time it is drawn, so they are always current and are never stored.
 */
export function AnalysisView({ analysisId }: { analysisId: string }) {
  const { project, run, setView, setStatus, settings } = useApp();
  const analysis = analysesOf(project).find((a) => a.id === analysisId);
  const table = analysis ? project.dataTables.find((t) => t.id === analysis.dataTableId) : undefined;
  const columns = useMemo(() => (table ? analysisColumns(table) : []), [table]);
  const level = analysis?.level ?? 0.95;
  const stats = useMemo(() => columns.map((c) => describeValues(c.values, level)), [columns, level]);
  const rows = useMemo(() => descriptiveRows(level), [level]);

  if (!analysis) return <div className="empty">This analysis no longer exists.</div>;
  if (!table || !analysisApplies(table.kind)) {
    return <div className="empty">The table of this analysis is gone, or is of a kind this analysis does not apply to.</div>;
  }

  const lines = (sep: string) => [
    [analysisTypeInfo(analysis.kind).label, ...columns.map((c) => c.label)],
    ...rows.map((r) => [r.label, ...stats.map((d) => (r.value ? formatResult(r.value(d), r.format) : ''))]),
  ].map((cells) => cells.map(sep === ',' ? quote : (c) => c.replace(/[\t\r\n]+/g, ' ')).join(sep));

  const exportCsv = () => {
    downloadBlob(new Blob([lines(',').join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' }), exportFileName(analysis.name, 'csv', settings.timestampExports));
    setStatus(`Exported ${analysis.name} as CSV.`);
  };
  const copy = async () => setStatus((await copyText(lines('\t').join('\n'))) ? 'Results copied to the clipboard.' : 'The browser did not allow copying to the clipboard.');

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
        <label className="inline-label">
          Confidence level
          <select value={level} onChange={(e) => run('Change confidence level', patchAnalysis(analysis.id, { level: Number(e.target.value) }))} aria-label="Confidence level">
            {LEVELS.map((l) => (
              <option key={l} value={l}>{l * 100}%</option>
            ))}
          </select>
        </label>
        <span className="sep" />
        <button className="icon-text" onClick={exportCsv} title="Download these results as a .csv file">
          <ExportIcon /> Export CSV
        </button>
        <button onClick={() => void copy()} title="Copy the results as tab-separated text">Copy</button>
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
      <div className="results-scroller">
        {columns.length === 0 ? (
          <div className="empty">The table has no columns to analyse.</div>
        ) : (
          <table className="results-table">
            <thead>
              <tr>
                <th className="results-corner">{analysisTypeInfo(analysis.kind).label}</th>
                {columns.map((c) => (
                  <th key={c.id}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) =>
                r.blank ? (
                  <tr key={r.key} className="results-spacer" aria-hidden="true">
                    <td colSpan={columns.length + 1} />
                  </tr>
                ) : (
                  <tr key={r.key}>
                    <th scope="row" className={r.indent ? 'results-indent' : ''}>{r.label}</th>
                    {stats.map((d, i) => (
                      <td key={columns[i].id}>{r.value ? formatResult(r.value(d), r.format) : ''}</td>
                    ))}
                  </tr>
                ),
              )}
            </tbody>
          </table>
        )}
        <p className="muted small results-note">
          Missing cells are left out, not counted as zero. A statistic that cannot be calculated from the values (too few values, or a geometric mean of values that are not all positive) is left empty. Percentiles are the (n + 1) p kind; the median interval is the exact order-statistic one and shows the coverage it actually reaches.
        </p>
      </div>
    </div>
  );
}
