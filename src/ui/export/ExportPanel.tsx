import { useMemo, useState } from 'react';
import { buildAnyModelCached, chartTexts, fitsPendingOf } from '../../chart/anyModel';
import { buildExportReport } from '../../chart/export/exportReport';
import { printSizeWarnings } from '../../chart/export/printSize';
import { resolveFit } from '../../model/options/fitOptions';
import { analysesOf } from '../../model/project/analysis';
import type { Chart, DataTable } from '../../model/types';
import { useApp } from '../../state/AppContext';
import { PNG_DPI_CHOICES, type ExportFormat, type PngDpi } from '../../state/settings';
import { copyText } from '../../util/download';
import { useFitsVersion } from '../components/useFitsVersion';
import { Field, FieldInput, SelectInput } from '../inspector/common/controls';
import { browserFontAvailable, browserHasGlyph } from './browserFonts';
import { ReportBody } from './ExportDialog';
import { exportStatusText } from './exportJob';
import { graphExportJob } from './graphExportJob';
import { useExportJob } from './useExportJob';

const FORMATS: ReadonlyArray<readonly [ExportFormat, string, string, string]> = [
  ['png', 'PNG', '.png', 'A bitmap, at the resolution below'],
  ['svg', 'SVG', '.svg', 'Vector: shapes and text'],
  ['pdf', 'PDF', '.pdf', 'Vector: shapes and text'],
];

function Tiles({ items, format, onPick }: { items: typeof FORMATS; format: ExportFormat; onPick: (f: ExportFormat) => void }) {
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

/** The export of the graph, as a page of the inspector: the format, the options, the Export button, and the report of what the file will hold. */
export function ExportPanel({ chart, table }: { chart: Chart; table: DataTable }) {
  const { project, settings, updateSettings, setStatus } = useApp();
  const [fileName, setFileName] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const job = useExportJob(setStatus);
  const curve = useMemo(() => resolveFit(chart.fit, analysesOf(project), table.id), [chart.fit, project.analyses, table.id]);
  const fitsVersion = useFitsVersion();
  const any = useMemo(() => buildAnyModelCached(chart, table, curve, { deferFits: true }), [chart, table, curve, fitsVersion]);
  const fitsPending = fitsPendingOf(any);
  const format = settings.exportFormat;
  const dpi = settings.pngDpi;
  const report = buildExportReport({
    name: chart.name,
    widthPx: chart.widthPx,
    heightPx: chart.heightPx,
    format,
    dpi,
    fontFamilies: [chart.fontFamily],
    texts: chartTexts(chart, any),
    warnings: any.model.warnings,
    printWidthMm: chart.printWidthMm ?? null,
    printWarnings: printSizeWarnings(chart),
    isFontAvailable: browserFontAvailable,
    hasGlyph: browserHasGlyph,
  });
  const tooBig = report.raster?.exceedsCanvasLimit === true;
  const blocked = job.busy || fitsPending > 0 || tooBig;
  const base = fileName.trim() === '' ? chart.name : fileName.trim();

  const start = () => void job.start(graphExportJob(chart, table, curve, { format, pngDpi: dpi, baseName: base, stamped: settings.timestampExports }));
  const copy = async () => setCopied((await copyText(JSON.stringify(report, null, 2))) ? 'Report copied.' : 'The browser did not allow copying.');

  return (
    <div className="export-panel">
      <Tiles items={FORMATS} format={format} onPick={(f) => updateSettings({ exportFormat: f })} />

      <div className="insp-heading">Options</div>
      <div className="insp-card">
        <Field label="Filename" hint="Without the extension. Empty: the name of the graph. A date and time are added when Settings says so.">
          <FieldInput value={fileName} placeholder={chart.name} onChange={(e) => setFileName(e.target.value)} />
        </Field>
        {format === 'png' ? (
          <Field label="Resolution (DPI)" hint="96 dpi is the size of the graph on screen.">
            <SelectInput<string> value={String(dpi)} options={PNG_DPI_CHOICES.map((d) => ({ value: String(d), label: `${d} DPI` }))} onChange={(v) => updateSettings({ pngDpi: Number(v) as PngDpi })} />
          </Field>
        ) : (
          <div className="muted small">{format === 'svg' ? 'SVG is vector: it has no pixels and no resolution.' : 'PDF holds shapes and text, not a picture: it has no resolution.'}</div>
        )}
      </div>

      <button className="primary export-go" disabled={blocked} onClick={start} title={fitsPending > 0 ? 'The curve is still being fitted: export when it is done, so that the file holds the final fit' : undefined}>
        Export .{format}
      </button>
      <div className="muted small" role="status">
        {fitsPending > 0 ? 'Fitting the curve…' : job.busy ? exportStatusText(job.state) : (copied ?? '')}
      </div>
      {tooBig && <div className="warnings" role="alert">⚠ {report.raster?.width} × {report.raster?.height} px is more than the browser can make. Lower the resolution, make the graph smaller, or choose SVG.</div>}
      {job.state.phase === 'failed' && job.state.error && <div className="warnings" role="alert">⚠ {job.state.error}</div>}

      <div className="insp-heading">Report</div>
      <div className="insp-card">
        <ReportBody report={report} />
        <button onClick={() => void copy()} title="Copy the report above as JSON text">Copy report</button>
      </div>
    </div>
  );
}
