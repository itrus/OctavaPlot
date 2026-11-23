import { fitsCanvas, exportPixels } from '../../chart/export/pngDpi';
import { useEffect, useRef, useState } from 'react';
import type { Chart, DataTable, FitSettings } from '../../model/types';
import { downloadBlob } from '../../util/download';
import type { ExportFormat } from '../../state/settings';
import { usePreferences } from '../../state/AppContext';
import { exportFileName } from '../../util/fileName';

/** Where an export is: the three busy phases are loading the renderer, drawing the pixels, and encoding and saving the file. */
type ExportPhase = 'idle' | 'preparing' | 'rasterizing' | 'encoding' | 'done' | 'failed';

export interface ExportState {
  phase: ExportPhase;
  /** What is being exported, e.g. "PNG"; empty when idle. */
  label: string;
  /** The message of a failed or refused export. */
  error: string | null;
}

/** One export: its size in pixels (null for a vector file), the message for a size that is too large, and the work. */
export interface ExportJob {
  label: string;
  pixels: { width: number; height: number } | null;
  tooBigMessage: string;
  work: (phase: (next: 'preparing' | 'rasterizing' | 'encoding') => void) => Promise<string>;
}

/** ran: finished (the result is its status line); failed and refused carry a message; ignored: another export was active. */
export type ExportOutcome = { kind: 'ran'; message: string } | { kind: 'failed' | 'refused'; message: string } | { kind: 'ignored' };

const IDLE: ExportState = { phase: 'idle', label: '', error: null };

export const isBusy = (s: ExportState): boolean => s.phase === 'preparing' || s.phase === 'rasterizing' || s.phase === 'encoding';

/** A short line saying what an active export is doing; empty when none is. */
export function exportStatusText(s: ExportState): string {
  if (s.phase === 'preparing') return `Preparing ${s.label} export…`;
  if (s.phase === 'rasterizing') return `Drawing ${s.label}…`;
  if (s.phase === 'encoding') return `Saving ${s.label}…`;
  return '';
}

/**
 * The export state machine, free of React and the DOM. Only one export runs at a time: a start while one is active is
 * ignored, not queued. A finished or failed export leaves the controls free for the next one. The browser's toBlob cannot
 * be aborted, so there is no cancel.
 */
export function createExportController(onChange: (s: ExportState) => void) {
  let state = IDLE;
  const set = (s: ExportState) => {
    state = s;
    onChange(s);
  };
  return {
    state: () => state,
    async start(job: ExportJob): Promise<ExportOutcome> {
      if (isBusy(state)) return { kind: 'ignored' };
      // A canvas that is too large is refused before anything is allocated.
      if (job.pixels && !fitsCanvas(job.pixels.width, job.pixels.height)) {
        set({ phase: 'failed', label: job.label, error: job.tooBigMessage });
        return { kind: 'refused', message: job.tooBigMessage };
      }
      set({ phase: 'preparing', label: job.label, error: null });
      try {
        const message = await job.work((phase) => set({ phase, label: job.label, error: null }));
        set({ phase: 'done', label: job.label, error: null });
        return { kind: 'ran', message };
      } catch (err) {
        const message = `${job.label} export failed: ${err instanceof Error ? err.message : String(err)}`;
        set({ phase: 'failed', label: job.label, error: message });
        return { kind: 'failed', message };
      }
    },
  };
}

/** The export controller of a view: its state, whether an export is active, and a start that reports the outcome in the status line. */
export function useExportJob(setStatus: (message: string) => void) {
  const [state, setState] = useState<ExportState>(IDLE);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  // One controller for the life of the view; its state is copied into React only while the view is on screen.
  const controller = useRef<ReturnType<typeof createExportController>>(undefined);
  controller.current ??= createExportController((s) => live.current && setState(s));
  const status = useRef(setStatus);
  status.current = setStatus;
  const start = async (job: ExportJob): Promise<ExportOutcome> => {
    const outcome = await controller.current!.start(job);
    if (outcome.kind !== 'ignored') status.current(outcome.message);
    return outcome;
  };
  return { state, busy: isBusy(state), start };
}

/** What the file of each format is made from: the SVG text, the PDF, the PNG at a resolution and its size in pixels (for the canvas check). */
export interface FileRenderers {
  svg: () => Promise<string>;
  pdf: () => Promise<{ blob: Blob; notes: string[] }>;
  png: (dpi: number) => Promise<Blob>;
  pixels: (dpi: number) => { width: number; height: number };
}

/** The files of a graph. The export code is loaded on first use, not at startup. */
export const graphFiles = (chart: Chart, table: DataTable, curve: FitSettings | undefined): FileRenderers => ({
  svg: async () => (await import('../../chart/export/export')).chartToSvgString(chart, table, curve, { metadata: true }),
  pdf: async () => (await import('../../chart/export/export')).chartToPdf(chart, table, curve),
  png: async (dpi) => (await import('../../chart/export/export')).chartToPngBlob(chart, table, curve, dpi),
  pixels: (dpi) => exportPixels(chart, dpi),
});

/** The size of the file as it would be written, in bytes (for the size line of the export page). */
export const measureFile = async (format: ExportFormat, dpi: number, files: FileRenderers): Promise<number> =>
  format === 'svg' ? new Blob([await files.svg()]).size : format === 'pdf' ? (await files.pdf()).blob.size : (await files.png(dpi)).size;

/** The export of one file (`fileName`, with its extension) as a job for the export controller; `dpi` is the resolution of a PNG. */
export function fileExportJob(format: ExportFormat, fileName: string, dpi: number, files: FileRenderers): ExportJob {
  if (format === 'svg') {
    return {
      label: 'SVG',
      pixels: null,
      tooBigMessage: '',
      work: async (phase) => {
        const text = await files.svg();
        phase('encoding');
        downloadBlob(new Blob([text], { type: 'image/svg+xml' }), fileName);
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
        phase('encoding');
        const { blob, notes } = await files.pdf();
        downloadBlob(blob, fileName);
        return notes.length > 0 ? `Exported PDF. ${notes.join(' ')}` : 'Exported PDF.';
      },
    };
  }
  // A PNG has the pixels the resolution gives it (for a graph, 96 dpi would be its size on screen).
  const { width: pw, height: ph } = files.pixels(dpi);
  return {
    label: 'PNG',
    pixels: { width: pw, height: ph },
    // Browsers limit the size of a canvas; a size above the limit fails or comes out blank.
    tooBigMessage: `PNG export at ${dpi} dpi needs ${pw} × ${ph} px, more than the browser can make. Choose a lower resolution, or export SVG.`,
    work: async (phase) => {
      phase('rasterizing');
      const blob = await files.png(dpi);
      phase('encoding');
      downloadBlob(blob, fileName);
      return `Exported PNG, ${pw} × ${ph} px (${dpi} dpi).`;
    },
  };
}

/**
 * The name the file of an export will have: the safe name of what is exported, the date and time when Settings says so, and the
 * extension. It is the name the Export button shows and the name the file is written with, so the two are the same. The time moves
 * on with the clock (at each change of the minute) only while a time is part of the name.
 */
export function useExportFileName(base: string, ext: string): string {
  const { settings } = usePreferences();
  const stamped = settings.timestampExports;
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!stamped) return;
    // Just after the next change of the minute: the stamp has minutes, so nothing changes sooner.
    const id = setTimeout(() => setNow(new Date()), 60_000 - (Date.now() % 60_000) + 20);
    return () => clearTimeout(id);
  }, [stamped, now]);
  return exportFileName(base, ext, stamped, now);
}
