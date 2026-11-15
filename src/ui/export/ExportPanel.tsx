import { useMemo } from 'react';
import { buildAnyModelCached, chartTexts, fitsPendingOf } from '../../chart/anyModel';
import { buildExportReport } from '../../chart/export/exportReport';
import { resolveFit } from '../../model/options/fitOptions';
import { analysesOf } from '../../model/project/analysis';
import type { Chart, DataTable } from '../../model/types';
import { useCommands, usePreferences, useProject } from '../../state/AppContext';
import { EXPORT_DPI_CHOICES, type ExportDpi, type ExportFormat } from '../../state/settings';
import { Field, SelectInput } from '../inspector/common/controls';
import { useFitsVersion } from '../components/useFitsVersion';
import { browserFontAvailable, browserHasGlyph } from './browserFonts';
import { FileSizeLine } from './FileSizeLine';
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

/** The Options of a PNG export: its resolution (the one place it is chosen; the choice is remembered in Settings). SVG and PDF have none. */
export function ResolutionOptions({ format, dpi, what, onChange }: { format: ExportFormat; dpi: number; what: 'page' | 'graph'; onChange: (dpi: ExportDpi) => void }) {
  return (
    <>
      <div className="insp-heading">Options</div>
      <div className="insp-card">
        <Field label="Resolution" hint={format === 'svg' ? 'SVG has no resolution.' : format === 'pdf' ? 'PDF has no resolution: it holds shapes and text, not a picture.' : `Dots per inch of the ${what === 'page' ? 'A4 page' : 'graph (96 dpi is its size on screen)'}. 600 dpi takes a few seconds. The starting value is in Settings.`}>
          <SelectInput<string>
            value={String(dpi)}
            disabled={format !== 'png'}
            options={EXPORT_DPI_CHOICES.map((d) => ({ value: String(d), label: `${d} dpi` }))}
            onChange={(v) => onChange(Number(v) as ExportDpi)}
          />
        </Field>
      </div>
    </>
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
  const { project } = useProject();
  const { settings, updateSettings } = usePreferences();
  const { setStatus } = useCommands();
  const job = useExportJob(setStatus);
  const curve = useMemo(() => resolveFit(chart.fit, analysesOf(project), table.id), [chart.fit, project.analyses, table.id]);
  const fitsVersion = useFitsVersion();
  const any = useMemo(() => buildAnyModelCached(chart, table, curve, { deferFits: true }), [chart, table, curve, fitsVersion]);
  const fitsPending = fitsPendingOf(any);
  const format = settings.exportFormat;
  const dpi = settings.exportDpi;
  // Rebuilding the report draws the graph again (chartTexts): only when the graph or the format changes.
  const report = useMemo(
    () =>
      buildExportReport({
        name: chart.name,
        widthPx: chart.widthPx,
        heightPx: chart.heightPx,
        format,
        dpi,
        fontFamilies: [...new Set([chart.fontFamily, ...chart.annotations.flatMap((a) => (a.fontFamily ? [a.fontFamily] : []))])],
        texts: chartTexts(chart, any),
        warnings: any.model.warnings,
        isFontAvailable: browserFontAvailable,
        hasGlyph: browserHasGlyph,
      }),
    [chart, any, format, dpi],
  );
  const tooBig = report.raster?.exceedsCanvasLimit === true;
  const blocked = job.busy || fitsPending > 0 || tooBig;

  // The file is named after the graph (a date and time are added when Settings says so); the button shows the name it will have.
  const fileName = useExportFileName(chart.name, format);
  const start = () => void job.start(graphExportJob(chart, table, curve, { format, fileName, dpi }));
  // The file as it would be written, measured for the size line (not while the curve is still being fitted).
  const measure = useMemo(
    () =>
      tooBig || fitsPending > 0
        ? null
        : async () => {
            const x = await import('../../chart/export/export');
            return format === 'svg' ? new Blob([x.chartToSvgString(chart, table, curve, { metadata: true })]).size : format === 'pdf' ? (await x.chartToPdf(chart, table, curve)).blob.size : (await x.chartToPngBlob(chart, table, curve, dpi)).size;
          },
    [chart, table, curve, format, dpi, tooBig, fitsPending],
  );

  return (
    <div className="export-panel">
      <Tiles items={FORMATS} format={format} onPick={(f) => updateSettings({ exportFormat: f })} />

      <ResolutionOptions format={format} dpi={dpi} what="graph" onChange={(d) => updateSettings({ exportDpi: d })} />

      <div className="insp-heading">Size</div>
      <div className="insp-card export-size">
        <ReportBody report={report} compact />
        <FileSizeLine measure={measure} />
      </div>

      <ExportButton fileName={fileName} disabled={blocked} onClick={start} title={fitsPending > 0 ? 'The curve is still being fitted: export when it is done, so that the file holds the final fit' : undefined} />
      <div className="muted small" role="status">
        {fitsPending > 0 ? 'Fitting the curve…' : job.busy ? exportStatusText(job.state) : ''}
      </div>
      {tooBig && <div className="warnings" role="alert">⚠ {report.raster?.width} × {report.raster?.height} px is more than the browser can make. Lower the resolution, or choose SVG.</div>}
      {job.state.phase === 'failed' && job.state.error && <div className="warnings" role="alert">⚠ {job.state.error}</div>}
    </div>
  );
}
