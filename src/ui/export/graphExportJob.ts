import { exportPixels } from '../../chart/export/pngDpi';
import type { Chart, DataTable, FitSettings } from '../../model/types';
import { downloadBlob, exportFileName } from '../../util/download';
import type { ExportFormat } from '../../state/settings';
import type { ExportJob } from './exportJob';

/** What one export of a graph needs besides the graph: the format, the resolution of a PNG, the base of the file name and whether a date stamp is added. */
export interface GraphExportRequest {
  format: ExportFormat;
  pngDpi: number;
  baseName: string;
  stamped: boolean;
}

/** The export of a graph as a job for the export controller. The renderer (react-dom/server) is loaded on first use, not at startup. */
export function graphExportJob(chart: Chart, table: DataTable, curve: FitSettings | undefined, req: GraphExportRequest): ExportJob {
  const { format, baseName, stamped } = req;
  if (format === 'svg') {
    return {
      label: 'SVG',
      pixels: null,
      tooBigMessage: '',
      work: async (phase) => {
        const { chartToSvgString } = await import('../../chart/export/export');
        phase('encoding');
        downloadBlob(new Blob([chartToSvgString(chart, table, curve, { metadata: true })], { type: 'image/svg+xml' }), exportFileName(baseName, 'svg', stamped));
        return 'Exported SVG.';
      },
    };
  }
  // A PDF is vector shapes and text: it has no resolution and no canvas limit.
  if (format === 'pdf') {
    return {
      label: 'PDF',
      pixels: null,
      tooBigMessage: '',
      work: async (phase) => {
        const { chartToPdf } = await import('../../chart/export/export');
        phase('encoding');
        const { blob, notes } = await chartToPdf(chart, table, curve);
        downloadBlob(blob, exportFileName(baseName, 'pdf', stamped));
        return notes.length > 0 ? `Exported PDF. ${notes.join(' ')}` : 'Exported PDF.';
      },
    };
  }
  const dpi = req.pngDpi;
  const { width: pw, height: ph } = exportPixels(chart, dpi);
  return {
    label: 'PNG',
    pixels: { width: pw, height: ph },
    // Browsers limit the size of a canvas; a size above the limit fails or comes out blank.
    tooBigMessage: `PNG export at ${dpi} dpi needs ${pw} × ${ph} px, more than the browser can make. Make the chart smaller, lower the resolution, or export SVG.`,
    work: async (phase) => {
      const { chartToPngBlob } = await import('../../chart/export/export');
      phase('rasterizing');
      const blob = await chartToPngBlob(chart, table, dpi, curve);
      phase('encoding');
      downloadBlob(blob, exportFileName(baseName, 'png', stamped));
      return `Exported PNG, ${pw} × ${ph} px (${dpi} dpi).`;
    },
  };
}
