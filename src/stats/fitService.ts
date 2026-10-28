/**
 * Fits that are made off the main thread, and what the screen knows of them. A result goes into the calculation cache under its
 * identity (roadmap rule 4), exactly where the synchronous path keeps its results, so the screen, the export and the Results sheet
 * all find the one fit, and an export that asks for a fit not yet done simply calculates it itself.
 *
 * Who is waiting is a *slot*: the place on the screen that wants a fit (one series of one graph). A slot wants one identity at a time;
 * when it asks for another, the job nobody else wants any more is cancelled and its result, if it still arrives, is dropped and never
 * kept. A result that arrives is found by the identity asked for, never by "the latest", so an older fit can not be shown for newer data.
 */
import { calcKey, peekCalc, storeCalc, type CalcIdentity } from './calcCache';
import { fitCurve, fitFromSolution, isFailure, type FitFailure, type FitResult } from './fit';
import { defaultFitEngine, isAbort, type CalculationEngine, type FitProvenance, type FitRequest } from './fitEngine';

type Done = FitResult | FitFailure;

interface Job {
  key: string;
  id: CalcIdentity;
  request: FitRequest;
  slots: Set<string>;
  abort: AbortController;
}

/** Counts, for the tests and for finding out what the screen did. */
export const fitJobStats = { started: 0, completed: 0, cancelled: 0, dropped: 0, fellBack: 0 };

let engine: CalculationEngine | null = null;
/** After the engine fails once the main thread does the work, as it did before there was a worker. */
let engineFailed = false;
const jobs = new Map<string, Job>();
const slotKey = new Map<string, string>();
const provenance = new Map<string, FitProvenance>();
let version = 0;
const listeners = new Set<() => void>();

const bump = (): void => {
  version++;
  for (const l of [...listeners]) l();
};

/** Changes whenever a deferred fit has finished (or has had to be calculated again): what a view subscribes to. */
export const fitsVersion = (): number => version;
export function subscribeFits(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** How many fits are being calculated or waiting. */
export const pendingFitCount = (): number => jobs.size;

/** Where and how the fit of an identity was made, if it was made by an engine and is still remembered. */
export const fitProvenance = (id: CalcIdentity): FitProvenance | undefined => provenance.get(calcKey(id));

/** Use another engine (a test; or null for the default, which is created when first needed). */
export function setFitEngine(e: CalculationEngine | null): void {
  engine = e;
  engineFailed = false;
}

/** Forget every job and every slot, cancelling what runs; for the tests. */
export function resetFitService(): void {
  for (const j of jobs.values()) j.abort.abort();
  jobs.clear();
  slotKey.clear();
  provenance.clear();
  Object.assign(fitJobStats, { started: 0, completed: 0, cancelled: 0, dropped: 0, fellBack: 0 });
  engine = null;
  engineFailed = false;
}

/** The slot gives up the identity it was waiting for; a job nobody waits for is cancelled. */
function release(slot: string): void {
  const key = slotKey.get(slot);
  if (key === undefined) return;
  slotKey.delete(slot);
  const job = jobs.get(key);
  if (!job) return;
  job.slots.delete(slot);
  if (job.slots.size === 0) {
    jobs.delete(key);
    fitJobStats.cancelled++;
    job.abort.abort();
  }
}

/**
 * The fit of an identity if there is one, else undefined and the fit is started (once, however many ask). `slot` is who is waiting;
 * a later call of the same slot for another identity cancels this one. `request` is made only when a job has to be started.
 */
export function deferredFitResult(id: CalcIdentity, slot: string, request: () => FitRequest): Done | undefined {
  const key = calcKey(id);
  const found = peekCalc<Done>(id);
  if (found !== undefined) {
    release(slot);
    return found;
  }
  if (slotKey.get(slot) !== key) release(slot);
  slotKey.set(slot, key);
  const existing = jobs.get(key);
  if (existing) {
    existing.slots.add(slot);
    return undefined;
  }
  const req = request();
  if (engineFailed) {
    // No worker: calculate here, as the synchronous path does, and say it is done.
    fitJobStats.fellBack++;
    const done = calculateHere(req);
    storeCalc(id, done);
    slotKey.delete(slot);
    return done;
  }
  const job: Job = { key, id, request: req, slots: new Set([slot]), abort: new AbortController() };
  jobs.set(key, job);
  fitJobStats.started++;
  engine ??= defaultFitEngine();
  void engine.fit(req, job.abort.signal).then(
    (reply) => {
      // Dropped: nobody waits for it now (its slots moved on), so it is not kept.
      if (jobs.get(key) !== job) {
        fitJobStats.dropped++;
        return;
      }
      // An export or a Results sheet may have calculated it meanwhile: that result stands (it is the same number).
      if (peekCalc(id) === undefined) storeCalc(id, isFailure(reply.outcome) ? reply.outcome : fitFromSolution(reply.outcome));
      provenance.set(key, reply.provenance);
      if (provenance.size > 200) provenance.delete(provenance.keys().next().value as string);
      finish(job);
      fitJobStats.completed++;
      bump();
    },
    (error: unknown) => {
      if (isAbort(error) || jobs.get(key) !== job) return;
      // The worker could not do it (blocked, crashed): the main thread does, once and for every fit after.
      engineFailed = true;
      fitJobStats.fellBack++;
      if (peekCalc(id) === undefined) storeCalc(id, calculateHere(req));
      finish(job);
      bump();
    },
  );
  return undefined;
}

function finish(job: Job): void {
  jobs.delete(job.key);
  for (const s of job.slots) if (slotKey.get(s) === job.key) slotKey.delete(s);
}

/** The same numerical work on the calling thread, from a flat request. */
function calculateHere(req: FitRequest): Done {
  const points = Array.from({ length: req.data.length >> 1 }, (_, i) => ({ x: req.data[2 * i], y: req.data[2 * i + 1] }));
  return fitCurve(points, { model: req.model, degree: req.degree, level: req.level });
}

