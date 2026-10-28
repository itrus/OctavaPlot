/**
 * The calculation interface for curve fits (roadmap decision "Calculation interface"): a request goes in, a reply with the outcome,
 * its diagnostics and its provenance comes out. `CalculationEngine` is the small replaceable seam; there are two implementations of
 * it here, the main thread (`mainThreadEngine`, the reference, also what the tests compare the worker against) and a Web Worker
 * (`WorkerFitEngine`). Both run the same `solveFit`, so a fit is the same number wherever it is made.
 *
 * Nothing here is a function in what travels between threads: a request is flat numbers, a reply is a `FitSolution` (plain data) or
 * a failure. The `FitResult` with its curve and band is made from the solution by `fitFromSolution` on the receiving side.
 */
import { FIT_ALGORITHM_VERSION, isFailure, solveFit, type FitFailure, type FitModelId, type FitSolution } from './fit';

export interface FitRequest {
  /** The points as x0, y0, x1, y1 ... */
  data: Float64Array;
  model: FitModelId;
  degree?: number;
  level: number;
}

/** Where and how a result was made: kept beside it so a number can be traced (the algorithm version is part of its identity). */
export interface FitProvenance {
  algorithm: number;
  engine: 'main' | 'worker';
  model: FitModelId;
  /** Points handed over (before the fit leaves out those it cannot use). */
  points: number;
  level: number;
  /** Time taken by the numerical part, in ms, where it ran. */
  ms: number;
}

export interface FitReply {
  outcome: FitSolution | FitFailure;
  provenance: FitProvenance;
  /** What the fit says about itself (did not settle, ill-conditioned, points left out); empty when all is well. */
  diagnostics: string[];
}

export interface CalculationEngine {
  /** Calculate one fit. An aborted request rejects with an AbortError; an engine that cannot work rejects with an Error. */
  fit(request: FitRequest, signal?: AbortSignal): Promise<FitReply>;
}

/** The numerical part, shared by every engine and by the worker's message handler. */
export function runFitRequest(request: FitRequest, engine: FitProvenance['engine']): FitReply {
  const t0 = performance.now();
  const points = Array.from({ length: request.data.length >> 1 }, (_, i) => ({ x: request.data[2 * i], y: request.data[2 * i + 1] }));
  const outcome = solveFit(points, { model: request.model, degree: request.degree, level: request.level });
  const diagnostics = isFailure(outcome) ? [outcome.message] : outcome.message ? [outcome.message] : [];
  return { outcome, diagnostics, provenance: { algorithm: FIT_ALGORITHM_VERSION, engine, model: request.model, points: points.length, level: request.level, ms: performance.now() - t0 } };
}

/** The reference engine: the fit is made on the calling thread (a promise only so that it can stand where the worker does). */
export const mainThreadEngine: CalculationEngine = {
  fit: (request, signal) => (signal?.aborted ? Promise.reject(abortError()) : Promise.resolve(runFitRequest(request, 'main'))),
};

export const abortError = (): Error => Object.assign(new Error('The fit was cancelled.'), { name: 'AbortError' });
export const isAbort = (e: unknown): boolean => e instanceof Error && e.name === 'AbortError';

// --- the message protocol of the worker ---------------------------------------------------------------------------

export interface FitMessage {
  id: number;
  request: FitRequest;
}
export interface FitAnswer {
  id: number;
  reply: FitReply;
}

/** What the worker does with one message. The worker file only calls this, so tests run exactly the worker's code in-process. */
export const handleFitMessage = (m: FitMessage): FitAnswer => ({ id: m.id, reply: runFitRequest(m.request, 'worker') });

/** The part of a Worker the engine uses; a test can stand in for it. */
export interface WorkerLike {
  postMessage(message: FitMessage, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((e: { data: FitAnswer }) => void) | null;
  onerror: ((e: unknown) => void) | null;
}

interface QueuedFit {
  id: number;
  request: FitRequest;
  resolve: (r: FitReply) => void;
  reject: (e: unknown) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
}

/**
 * One worker, one fit at a time, in the order asked. A request that is aborted while it waits is dropped; one that is aborted
 * while it runs ends the worker (a fit cannot be interrupted from outside) and a new one is started for the next request.
 * Any error of the worker rejects what was waiting, so the caller can calculate on the main thread instead.
 */
export class WorkerFitEngine implements CalculationEngine {
  private worker: WorkerLike | null = null;
  private running: QueuedFit | null = null;
  private readonly queue: QueuedFit[] = [];
  private nextId = 1;

  constructor(private readonly make: () => WorkerLike) {}

  fit(request: FitRequest, signal?: AbortSignal): Promise<FitReply> {
    if (signal?.aborted) return Promise.reject(abortError());
    return new Promise<FitReply>((resolve, reject) => {
      const job: QueuedFit = { id: this.nextId++, request, resolve, reject, signal };
      job.onAbort = () => this.abort(job);
      signal?.addEventListener('abort', job.onAbort, { once: true });
      this.queue.push(job);
      this.pump();
    });
  }

  /** Ends the worker; for the page closing and for the tests. */
  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.failAll(new Error('The fit engine was shut down.'));
  }

  private pump(): void {
    if (this.running || this.queue.length === 0) return;
    const job = this.queue.shift() as QueuedFit;
    try {
      if (!this.worker) {
        const w = this.make();
        w.onmessage = (e) => this.answered(e.data);
        w.onerror = (e) => this.broke(e);
        this.worker = w;
      }
      this.running = job;
      // The data is copied for the worker: the cache still needs the points of this request to key the result.
      const copy = new Float64Array(job.request.data);
      this.worker.postMessage({ id: job.id, request: { ...job.request, data: copy } }, [copy.buffer]);
    } catch (e) {
      this.running = null;
      this.settle(job, undefined, e);
      this.broke(e);
    }
  }

  private answered(a: FitAnswer): void {
    const job = this.running;
    // An answer to a job that was already abandoned (its worker was ended) never gets here, but one with another id is ignored.
    if (!job || job.id !== a.id) return;
    this.running = null;
    this.settle(job, a.reply);
    this.pump();
  }

  private abort(job: QueuedFit): void {
    const at = this.queue.indexOf(job);
    if (at >= 0) {
      this.queue.splice(at, 1);
      this.settle(job, undefined, abortError());
    } else if (this.running === job) {
      this.running = null;
      this.worker?.terminate();
      this.worker = null;
      this.settle(job, undefined, abortError());
      this.pump();
    }
  }

  private broke(e: unknown): void {
    this.worker?.terminate();
    this.worker = null;
    this.failAll(e instanceof Error ? e : new Error('The fit worker failed.'));
  }

  private failAll(e: Error): void {
    const all = [...(this.running ? [this.running] : []), ...this.queue.splice(0)];
    this.running = null;
    for (const job of all) this.settle(job, undefined, e);
  }

  private settle(job: QueuedFit, reply?: FitReply, error?: unknown): void {
    if (job.onAbort) job.signal?.removeEventListener('abort', job.onAbort);
    if (reply) job.resolve(reply);
    else job.reject(error);
  }
}

/** The engine the app uses: a worker where the browser has them, else the main thread. */
export function defaultFitEngine(): CalculationEngine {
  if (typeof Worker === 'undefined') return mainThreadEngine;
  return new WorkerFitEngine(() => new Worker(new URL('./fitWorker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike);
}

/**
 * Whether a fit is worth sending away, by what it is expected to cost on the main thread. The costs are measured (node, 11th Gen
 * Intel Core i7-1185G7): milliseconds for each point, rounded up. The two-phase exponential is always sent away: its time depends
 * on the data far more than on n (10 ms to 430 ms for 16 to 60 points). The limit is half a frame at 60 fps.
 */
const MS_PER_POINT: Record<FitModelId, number> = {
  linear: 0.001,
  polynomial: 0.0015,
  exp_decay: 0.007,
  exp_association: 0.007,
  exp_two_phase: Infinity,
  gaussian_peak: 0.007,
  hyperbola: 0.007,
  hill_4pl: 0.012,
  asymmetric_5pl: 0.02,
};
export const DEFER_ABOVE_MS = 8;
export const shouldDeferFit = (model: FitModelId, points: number): boolean => MS_PER_POINT[model] * points > DEFER_ABOVE_MS;
