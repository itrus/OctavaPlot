import { fitsCanvas } from '../../chart/export/pngDpi';

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

export const IDLE: ExportState = { phase: 'idle', label: '', error: null };

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
