import { useMemo } from 'react';
import { layoutPngSize, layoutTextGroups, layoutToPdf, layoutToPngBlob, layoutToSvgString, type LayoutDrawing } from '../../chart/export/layoutExport';
import { buildExportReport } from '../../chart/export/exportReport';
import { FONT_FAMILY } from '../../model/defaults';
import type { Layout } from '../../model/types';
import { useCommands, usePreferences, useProject } from '../../state/AppContext';
import { ptToPx } from '../../model/units';
import { downloadBlob } from '../../util/download';
import { browserFontAvailable, browserHasGlyph } from './browserFonts';
import { ReportBody } from './ReportBody';
import { exportStatusText } from './exportJob';
import { ExportButton, FORMATS, ResolutionOptions, Tiles } from './ExportPanel';
import { useExportFileName } from './useExportFileName';
import { useExportJob } from './useExportJob';
import { FileSizeLine } from './FileSizeLine';

/**
 * The export of a layout page, as a page of the inspector (as the graph has): the format, the resolution of a PNG (the one place a
 * resolution is chosen; both are remembered in Settings), the Export button, and the report of what the file will hold.
 */
export function LayoutExportPanel({ layout, drawing }: { layout: Layout; drawing: LayoutDrawing }) {
  const { project } = useProject();
  const { settings, updateSettings } = usePreferences();
  const { setStatus } = useCommands();
  // One export at a time: while one runs the Export button is disabled, and a second start is ignored.
  const job = useExportJob(setStatus);
  const format = settings.exportFormat;
  const dpi = settings.exportDpi;
  // The file is named after the layout (a date and time are added when Settings says so); the button shows the name it will have.
  const fileName = useExportFileName(layout.name, format);
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
  const tooBig = report.raster?.exceedsCanvasLimit === true;
  const blocked = job.busy || tooBig;
  // The file as it would be written, measured for the size line.
  const measure = useMemo(
    () => (tooBig ? null : async () => (format === 'svg' ? new Blob([layoutToSvgString(layout, project)]).size : format === 'pdf' ? (await layoutToPdf(layout, project)).blob.size : (await layoutToPngBlob(layout, project, dpi)).size)),
    [layout, project, format, dpi, tooBig],
  );

  const exportSvg = () =>
    job.start({
      label: 'SVG',
      pixels: null,
      tooBigMessage: '',
      work: async (phase) => {
        phase('encoding');
        downloadBlob(new Blob([layoutToSvgString(layout, project)], { type: 'image/svg+xml' }), fileName);
        return 'Exported SVG.';
      },
    });
  // A PDF is vector shapes and text: it has no resolution and no canvas limit.
  const exportPdf = () =>
    job.start({
      label: 'PDF',
      pixels: null,
      tooBigMessage: '',
      work: async (phase) => {
        phase('encoding');
        const { blob, notes } = await layoutToPdf(layout, project);
        downloadBlob(blob, fileName);
        return notes.length > 0 ? `Exported PDF. ${notes.join(' ')}` : 'Exported PDF.';
      },
    });
  const exportRaster = () => {
    const { width, height } = layoutPngSize(layout, dpi);
    return job.start({
      label: 'PNG',
      pixels: { width, height },
      tooBigMessage: `PNG export at ${dpi} dpi needs ${width} × ${height} px, more than the browser can make. Choose a lower resolution, or export SVG.`,
      work: async (phase) => {
        phase('rasterizing');
        const blob = await layoutToPngBlob(layout, project, dpi);
        phase('encoding');
        downloadBlob(blob, fileName);
        return `Exported PNG, ${width} × ${height} px (${dpi} dpi).`;
      },
    });
  };
  const start = () => void (format === 'svg' ? exportSvg() : format === 'pdf' ? exportPdf() : exportRaster());

  return (
    <div className="export-panel">
      <Tiles items={FORMATS} format={format} onPick={(f) => updateSettings({ exportFormat: f })} />

      <ResolutionOptions format={format} dpi={dpi} what="page" onChange={(d) => updateSettings({ exportDpi: d })} />

      <div className="insp-heading">Size</div>
      <div className="insp-card export-size">
        <ReportBody report={report} page="A4" compact />
        <FileSizeLine measure={measure} />
      </div>

      <ExportButton fileName={fileName} disabled={blocked} onClick={start} />
      <div className="muted small" role="status">{job.busy ? exportStatusText(job.state) : ''}</div>
      {tooBig && <div className="warnings" role="alert">⚠ {report.raster?.width} × {report.raster?.height} px is more than the browser can make. Lower the resolution, or choose SVG.</div>}
      {job.state.phase === 'failed' && job.state.error && <div className="warnings" role="alert">⚠ {job.state.error}</div>}
    </div>
  );
}
