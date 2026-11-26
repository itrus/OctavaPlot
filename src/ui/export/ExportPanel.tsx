import { useMemo } from 'react';
import { buildAnyModelCached, chartTexts, fitsPendingOf } from '../../chart/anyModel';
import { buildExportReport, type ExportReport } from '../../chart/export/exportReport';
import { layoutPngSize, layoutTextGroups, layoutToPdf, layoutToPngBlob, layoutToSvgString, type LayoutDrawing } from '../../chart/export/layoutExport';
import { FONT_FAMILY } from '../../model/defaults';
import { resolveFit } from '../../model/options/fitOptions';
import { analysesOf } from '../../model/project/analysis';
import type { Chart, DataTable, Layout } from '../../model/types';
import { ptToPx } from '../../model/units';
import { useCommands, usePreferences, useProject } from '../../state/AppContext';
import { EXPORT_DPI_CHOICES, type ExportDpi, type ExportFormat } from '../../state/settings';
import { Field, SelectInput } from '../inspector/common/controls';
import { useFitsVersion } from '../components/hooks';
import { browserFontAvailable, browserHasGlyph } from './browserFonts';
import { FileSizeLine, ReportBody } from './ReportBody';
import { exportStatusText, fileExportJob, graphFiles, measureFile, useExportFileName, useExportJob, type FileRenderers } from './exportJob';

const FORMATS: ReadonlyArray<readonly [ExportFormat, string, string, string]> = [
  ['png', 'PNG', '.png', 'A bitmap, at the size of the graph on screen'],
  ['svg', 'SVG', '.svg', 'Vector: shapes and text'],
  ['pdf', 'PDF', '.pdf', 'Vector: shapes and text'],
];

/**
 * The export page of the inspector, for a graph or a layout page: the format and the resolution of a PNG (both remembered in Settings),
 * the size of what will be written, and the Export button, which names the file. `waiting` holds the export back and says why.
 */
function ExportPage({ name, what, report, files, waiting }: { name: string; what: 'graph' | 'page'; report: ExportReport; files: FileRenderers; waiting?: { status: string; title: string } }) {
  const { settings, updateSettings } = usePreferences();
  const { setStatus } = useCommands();
  // One export at a time: while one runs the Export button is disabled, and a second start is ignored.
  const job = useExportJob(setStatus);
  const format = settings.exportFormat;
  const dpi = settings.exportDpi;
  // The file is named after the graph or the layout (a date and time are added when Settings says so).
  const fileName = useExportFileName(name, format);
  const tooBig = report.raster?.exceedsCanvasLimit === true;
  // The file as it would be written, measured for the size line.
  const measure = useMemo(() => (tooBig || waiting ? null : () => measureFile(format, dpi, files)), [files, format, dpi, tooBig, waiting]);
  return (
    <div className="export-panel">
      <div className="format-tiles" role="group">
        {FORMATS.map(([value, label, ext, about]) => (
          <button key={value} title={about} className={`format-tile${format === value ? ' on' : ''}`} aria-pressed={format === value} onClick={() => updateSettings({ exportFormat: value })}>
            <strong>{label}</strong>
            <span>{ext}</span>
          </button>
        ))}
      </div>

      <div className="insp-heading">Options</div>
      <div className="insp-card">
        <Field label="Resolution" hint={format === 'svg' ? 'SVG has no resolution.' : format === 'pdf' ? 'PDF has no resolution: it holds shapes and text, not a picture.' : `Dots per inch of the ${what === 'page' ? 'A4 page' : 'graph (96 dpi is its size on screen)'}. 1200 dpi takes a few seconds. The starting value is in Settings.`}>
          <SelectInput<string> value={String(dpi)} disabled={format !== 'png'} options={EXPORT_DPI_CHOICES.map((d) => ({ value: String(d), label: `${d} dpi` }))} onChange={(v) => updateSettings({ exportDpi: Number(v) as ExportDpi })} />
        </Field>
      </div>

      <div className="insp-heading">Size</div>
      <div className="insp-card export-size">
        <ReportBody report={report} compact {...(what === 'page' ? { page: 'A4' as const } : {})} />
        <FileSizeLine measure={measure} />
      </div>

      {/* The action on one line and, under it, the name of the file it will write, set apart in a box so that it is read (a long name wraps). */}
      <button className="primary export-go" disabled={job.busy || tooBig || waiting !== undefined} onClick={() => void job.start(fileExportJob(format, fileName, dpi, files))} title={waiting?.title}>
        <span>Export</span>{' '}
        <span className="export-go-file">{fileName}</span>
      </button>
      <div className="muted small" role="status">{waiting ? waiting.status : job.busy ? exportStatusText(job.state) : ''}</div>
      {tooBig && <div className="warnings" role="alert">⚠ {report.raster?.width} × {report.raster?.height} px is more than the browser can make. Lower the resolution, or choose SVG.</div>}
      {job.state.phase === 'failed' && job.state.error && <div className="warnings" role="alert">⚠ {job.state.error}</div>}
    </div>
  );
}

/** The export of the graph, as a page of the inspector: the format, the Export button, and the report of what the file will hold. */
export function ExportPanel({ chart, table }: { chart: Chart; table: DataTable }) {
  const { project } = useProject();
  const { settings } = usePreferences();
  const curve = useMemo(() => resolveFit(chart.fit, analysesOf(project), table.id), [chart.fit, project.analyses, table.id]);
  const fitsVersion = useFitsVersion();
  const any = useMemo(() => buildAnyModelCached(chart, table, curve, { deferFits: true }), [chart, table, curve, fitsVersion]);
  const fitsPending = fitsPendingOf(any);
  const { exportFormat: format, exportDpi: dpi } = settings;
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
  const files = useMemo(() => graphFiles(chart, table, curve), [chart, table, curve]);
  // While a curve is being fitted the file would not hold the final fit.
  const waiting = fitsPending > 0 ? { status: 'Fitting the curve…', title: 'The curve is still being fitted: export when it is done, so that the file holds the final fit' } : undefined;
  return <ExportPage name={chart.name} what="graph" report={report} files={files} waiting={waiting} />;
}

/** The export of a layout page, as a page of its inspector (as the graph has). */
export function LayoutExportPanel({ layout, drawing }: { layout: Layout; drawing: LayoutDrawing }) {
  const { project } = useProject();
  const { settings } = usePreferences();
  const { exportFormat: format, exportDpi: dpi } = settings;
  // The texts of the page, by font, for the check of characters; made again only when the page changes.
  const textGroups = useMemo(() => layoutTextGroups(layout, project, FONT_FAMILY), [layout, project]);
  const report = useMemo(
    () =>
      buildExportReport({
        name: layout.name,
        widthPx: ptToPx(drawing.widthPt),
        heightPx: ptToPx(drawing.heightPt),
        // The page's own font (labels and title), then those of the graphs on it.
        fontFamilies: [FONT_FAMILY, ...layout.panels.flatMap((id) => { const c = project.charts.find((x) => x.id === id); return c ? [c.fontFamily, ...c.annotations.flatMap((a) => (a.fontFamily ? [a.fontFamily] : []))] : []; }), ...(layout.annotations ?? []).flatMap((a) => (a.fontFamily ? [a.fontFamily] : []))],
        textGroups,
        warnings: drawing.notices,
        format,
        dpi,
        isFontAvailable: browserFontAvailable,
        hasGlyph: browserHasGlyph,
      }),
    [layout, project, drawing, textGroups, format, dpi],
  );
  const files = useMemo<FileRenderers>(
    () => ({ svg: async () => layoutToSvgString(layout, project), pdf: () => layoutToPdf(layout, project), png: (d) => layoutToPngBlob(layout, project, d), pixels: (d) => layoutPngSize(layout, d) }),
    [layout, project],
  );
  return <ExportPage name={layout.name} what="page" report={report} files={files} />;
}
