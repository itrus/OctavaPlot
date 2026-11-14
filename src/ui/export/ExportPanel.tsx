import { useMemo, useState } from 'react';
import { buildAnyModelCached, chartTexts, fitsPendingOf } from '../../chart/anyModel';
import { buildExportReport } from '../../chart/export/exportReport';
import { resolveFit } from '../../model/options/fitOptions';
import { analysesOf } from '../../model/project/analysis';
import type { Chart, DataTable } from '../../model/types';
import { useApp } from '../../state/AppContext';
import type { ExportFormat } from '../../state/settings';
import { copyText } from '../../util/download';
import { useFitsVersion } from '../components/useFitsVersion';
import { browserFontAvailable, browserHasGlyph } from './browserFonts';
import { ReportBody } from './ReportBody';
import { exportStatusText } from './exportJob';
import { graphExportJob } from './graphExportJob';
import { useExportFileName } from './useExportFileName';
import { useExportJob } from './useExportJob';

export const FORMATS: ReadonlyArray<readonly [ExportFormat, string, string, string]> = [
  ['png', 'PNG', '.png', 'A bitmap, at the size of the graph on screen'],
  ['svg', 'SVG', '.svg', 'Vector: shapes and text'],
  ['pdf', 'PDF', '.pdf', 'Vector: shapes and text'],
];

export function Tiles({ items, format, onPick }: { items: typeof FORMATS; format: ExportFormat; onPick: (f: ExportFormat) => void }) {
  return (
    <div className="format-tiles" role="group">
      {items.map(([value, name, ext, what]) => (
        <button key={value} title={what} className={`format-tile${format === value ? ' on' : ''}`} aria-pressed={format === value} onClick={() => onPick(value)}>
          <strong>{name}</strong>
          <span>{ext}</span>
        </button>
      ))}
    </div>
  );
}

/** The button of an export: the action on one line and, under it, the name of the file it will write, set apart in a box so that it is read (a long name wraps). */
export function ExportButton({ fileName, disabled, onClick, title }: { fileName: string; disabled: boolean; onClick: () => void; title?: string }) {
  return (
    <button className="primary export-go" disabled={disabled} onClick={onClick} title={title}>
      <span>Export</span>{' '}
      <span className="export-go-file">{fileName}</span>
    </button>
  );
}

/** The export of the graph, as a page of the inspector: the format, the Export button, and the report of what the file will hold. */
export function ExportPanel({ chart, table }: { chart: Chart; table: DataTable }) {
  const { project, settings, updateSettings, setStatus } = useApp();
  const [copied, setCopied] = useState<string | null>(null);
  const job = useExportJob(setStatus);
  const curve = useMemo(() => resolveFit(chart.fit, analysesOf(project), table.id), [chart.fit, project.analyses, table.id]);
  const fitsVersion = useFitsVersion();
  const any = useMemo(() => buildAnyModelCached(chart, table, curve, { deferFits: true }), [chart, table, curve, fitsVersion]);
  const fitsPending = fitsPendingOf(any);
  const format = settings.exportFormat;
  // Rebuilding the report draws the graph again (chartTexts): only when the graph or the format changes.
  const report = useMemo(
    () =>
      buildExportReport({
        name: chart.name,
        widthPx: chart.widthPx,
        heightPx: chart.heightPx,
        format,
        fontFamilies: [...new Set([chart.fontFamily, ...chart.annotations.flatMap((a) => (a.fontFamily ? [a.fontFamily] : []))])],
        texts: chartTexts(chart, any),
        warnings: any.model.warnings,
        isFontAvailable: browserFontAvailable,
        hasGlyph: browserHasGlyph,
      }),
    [chart, any, format],
  );
  const tooBig = report.raster?.exceedsCanvasLimit === true;
  const blocked = job.busy || fitsPending > 0 || tooBig;

  // The file is named after the graph (a date and time are added when Settings says so); the button shows the name it will have.
  const fileName = useExportFileName(chart.name, format);
  const start = () => void job.start(graphExportJob(chart, table, curve, { format, fileName }));
  const copy = async () => setCopied((await copyText(JSON.stringify(report, null, 2))) ? 'Report copied.' : 'The browser did not allow copying.');

  return (
    <div className="export-panel">
      <Tiles items={FORMATS} format={format} onPick={(f) => updateSettings({ exportFormat: f })} />

      <ExportButton fileName={fileName} disabled={blocked} onClick={start} title={fitsPending > 0 ? 'The curve is still being fitted: export when it is done, so that the file holds the final fit' : undefined} />
      <div className="muted small" role="status">
        {fitsPending > 0 ? 'Fitting the curve…' : job.busy ? exportStatusText(job.state) : (copied ?? '')}
      </div>
      {tooBig && <div className="warnings" role="alert">⚠ {report.raster?.width} × {report.raster?.height} px is more than the browser can make. Make the graph smaller, or choose SVG.</div>}
      {job.state.phase === 'failed' && job.state.error && <div className="warnings" role="alert">⚠ {job.state.error}</div>}

      <div className="insp-heading">Report</div>
      <div className="insp-card">
        <ReportBody report={report} />
        <button onClick={() => void copy()} title="Copy the report above as JSON text">Copy report</button>
      </div>
    </div>
  );
}
