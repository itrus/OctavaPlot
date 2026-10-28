/** Stand-ins for the fit worker, for tests: the worker's own message handler run in this process, and an engine the test steers by hand. */
import { handleFitMessage, abortError, type CalculationEngine, type FitAnswer, type FitMessage, type FitReply, type FitRequest, type WorkerLike } from '../stats/fitEngine';

/**
 * A worker that runs `handleFitMessage` (what fitWorker.ts runs) in this process, one macrotask later. Messages are cloned with the
 * structured clone both ways, so only what can cross a real worker boundary gets through (a function would throw).
 */
export class InProcessWorker implements WorkerLike {
  onmessage: ((e: { data: FitAnswer }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  terminated = false;
  received: FitMessage[] = [];
  constructor(private readonly crashOn?: (m: FitMessage) => boolean) {}

  postMessage(message: FitMessage, transfer: Transferable[] = []): void {
    const cloned = structuredClone(message, { transfer });
    this.received.push(cloned);
    setTimeout(() => {
      if (this.terminated) return;
      if (this.crashOn?.(cloned)) {
        this.onerror?.(new Error('crash'));
        return;
      }
      this.onmessage?.({ data: structuredClone(handleFitMessage(cloned)) });
    }, 0);
  }

  terminate(): void {
    this.terminated = true;
  }
}

/** An engine whose requests wait until the test answers them (in any order) or the caller aborts them. */
export class ManualEngine implements CalculationEngine {
  readonly requests: Array<{ request: FitRequest; resolve: (r: FitReply) => void; reject: (e: unknown) => void; aborted: boolean }> = [];

  fit(request: FitRequest, signal?: AbortSignal): Promise<FitReply> {
    return new Promise((resolve, reject) => {
      const entry = { request, resolve, reject, aborted: false };
      this.requests.push(entry);
      signal?.addEventListener('abort', () => {
        entry.aborted = true;
        reject(abortError());
      });
    });
  }
}
