import { useMemo, useState } from 'react';
import { layoutPngSize, layoutTextGroups, layoutToPdf, layoutToPngBlob, layoutToSvgString, type LayoutDrawing } from '../../chart/export/layoutExport';
import { buildExportReport } from '../../chart/export/exportReport';
import { FONT_FAMILY } from '../../model/defaults';
import type { Layout } from '../../model/types';
import { useApp } from '../../state/AppContext';
import { EXPORT_DPI_CHOICES, type ExportDpi } from '../../state/settings';
import { copyText, downloadBlob } from '../../util/download';
import { Field, SelectInput } from '../inspector/common/controls';
import { browserFontAvailable, browserHasGlyph } from './browserFonts';
import { ReportBody } from './ExportDialog';
import { exportStatusText } from './exportJob';
import { ExportButton, FORMATS, Tiles } from './ExportPanel';
import { useExportFileName } from './useExportFileName';
import { useExportJob } from './useExportJob';

/**
 * The export of a layout page, as a page of the inspector (as the graph has): the format, the resolution of a PNG (the one place a
 * resolution is chosen; both are remembered in Settings), the Export button, and the report of what the file will hold, which Copy
 * report puts on the clipboard as JSON.
 */
export function LayoutExportPanel({ layout, drawing }: { layout: Layout; drawing: LayoutDrawing }) {
  const { project, settings, updateSettings, setStatus } = useApp();
  const [copied, setCopied] = useState<string | null>(null);
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
        widthPx: (drawing.widthPt * 96) / 72,
        heightPx: (drawing.heightPt * 96) / 72,
        // The page's own font (labels and title), then those of the graphs on it.
        fontFamilies: [FONT_FAMILY, ...layout.panels.flatMap((id) => project.charts.find((c) => c.id === id)?.fontFamily ?? [])],
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
  const copy = async () => setCopied((await copyText(JSON.stringify(report, null, 2))) ? 'Report copied.' : 'The browser did not allow copying.');

  return (
    <div className="export-panel">
      <Tiles items={FORMATS} format={format} onPick={(f) => updateSettings({ exportFormat: f })} />

      <div className="insp-heading">Options</div>
      <div className="insp-card">
        <Field label="Resolution" hint={format === 'svg' ? 'SVG has no resolution.' : format === 'pdf' ? 'PDF has no resolution: it holds shapes and text, not a picture.' : 'Dots per inch of the A4 page. 600 dpi takes a few seconds.'}>
          <SelectInput<string>
            value={String(dpi)}
            disabled={format !== 'png'}
            options={EXPORT_DPI_CHOICES.map((d) => ({ value: String(d), label: `${d} dpi` }))}
            onChange={(v) => updateSettings({ exportDpi: Number(v) as ExportDpi })}
          />
        </Field>
      </div>

      <ExportButton fileName={fileName} disabled={blocked} onClick={start} />
      <div className="muted small" role="status">{job.busy ? exportStatusText(job.state) : (copied ?? '')}</div>
      {tooBig && <div className="warnings" role="alert">⚠ {report.raster?.width} × {report.raster?.height} px is more than the browser can make. Lower the resolution, or choose SVG.</div>}
      {job.state.phase === 'failed' && job.state.error && <div className="warnings" role="alert">⚠ {job.state.error}</div>}

      <div className="insp-heading">Report</div>
      <div className="insp-card">
        <ReportBody report={report} page="A4" />
        <button onClick={() => void copy()} title="Copy the report above as JSON text">Copy report</button>
      </div>
    </div>
  );
}
