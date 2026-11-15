import { exportPixels } from '../../chart/export/pngDpi';
import type { Chart, DataTable, FitSettings } from '../../model/types';
import { downloadBlob } from '../../util/download';
import type { ExportFormat } from '../../state/settings';
import type { ExportJob } from './exportJob';

/** What one export of a graph needs besides the graph: the format and the name of the file. */
interface GraphExportRequest {
  format: ExportFormat;
  /** The whole name of the file, with its extension and the date and time when Settings says so (see useExportFileName). */
  fileName: string;
  /** The resolution of a PNG (SVG and PDF have none). */
  dpi: number;
}

/** The export of a graph as a job for the export controller. The export code is loaded on first use, not at startup. */
export function graphExportJob(chart: Chart, table: DataTable, curve: FitSettings | undefined, req: GraphExportRequest): ExportJob {
  const { format, fileName, dpi } = req;
  if (format === 'svg') {
    return {
      label: 'SVG',
      pixels: null,
      tooBigMessage: '',
      work: async (phase) => {
        const { chartToSvgString } = await import('../../chart/export/export');
        phase('encoding');
        downloadBlob(new Blob([chartToSvgString(chart, table, curve, { metadata: true })], { type: 'image/svg+xml' }), fileName);
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
        downloadBlob(blob, fileName);
        return notes.length > 0 ? `Exported PDF. ${notes.join(' ')}` : 'Exported PDF.';
      },
    };
  }
  // A PNG has the pixels the resolution gives the graph (96 dpi would be its size on screen).
  const { width: pw, height: ph } = exportPixels(chart, dpi);
  return {
    label: 'PNG',
    pixels: { width: pw, height: ph },
    // Browsers limit the size of a canvas; a size above the limit fails or comes out blank.
    tooBigMessage: `PNG export at ${dpi} dpi needs ${pw} × ${ph} px, more than the browser can make. Choose a lower resolution, or export SVG.`,
    work: async (phase) => {
      const { chartToPngBlob } = await import('../../chart/export/export');
      phase('rasterizing');
      const blob = await chartToPngBlob(chart, table, curve, dpi);
      phase('encoding');
      downloadBlob(blob, fileName);
      return `Exported PNG, ${pw} × ${ph} px (${dpi} dpi).`;
    },
  };
}
