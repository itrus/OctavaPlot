import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InProcessWorker, ManualEngine } from '../testing/fitEngines';
import { clearCalcCache, peekCalc, type CalcIdentity } from './calcCache';
import { FIT_ALGORITHM_VERSION, fitCurve, isFailure, type FitFailure, type FitResult } from './fit';
import { WorkerFitEngine, runFitRequest, type FitReply, type FitRequest } from './fitEngine';
import { deferredFitResult, fitJobStats, fitProvenance, fitsVersion, pendingFitCount, resetFitService, setFitEngine, subscribeFits } from './fitService';

const pointsOf = (n: number, k = 0.7) => Array.from({ length: n }, (_, i) => ({ x: i * 0.5, y: 3 + 4 * Math.exp(-k * i * 0.5) + ((i * 7) % 5) * 0.02 }));
const identity = (n: number, level = 0.95, k = 0.7): { id: CalcIdentity; req: FitRequest } => {
  const data = pointsOf(n, k).flatMap((p) => [p.x, p.y]);
  return { id: { kind: 'fit', algorithm: FIT_ALGORITHM_VERSION, data, method: 'exp_decay', params: [null], level }, req: { data: Float64Array.from(data), model: 'exp_decay', level } };
};
const flush = () => new Promise<void>((r) => setTimeout(r, 5));

beforeEach(() => {
  clearCalcCache();
  resetFitService();
});
afterEach(() => resetFitService());

describe('fits made off the main thread', () => {
  it('are pending at first and found by their identity when done, and the views are told', async () => {
    setFitEngine(new WorkerFitEngine(() => new InProcessWorker()));
    const { id, req } = identity(12);
    const seen: number[] = [];
    const off = subscribeFits(() => seen.push(fitsVersion()));
    expect(deferredFitResult(id, 's1', () => req)).toBeUndefined();
    expect(pendingFitCount()).toBe(1);
    // Asking again, from a redraw, is not a second fit.
    expect(deferredFitResult(id, 's1', () => req)).toBeUndefined();
    expect(fitJobStats.started).toBe(1);
    await flush();
    off();
    expect(seen).toHaveLength(1);
    expect(pendingFitCount()).toBe(0);
    const got = deferredFitResult(id, 's1', () => req) as FitResult;
    expect(isFailure(got)).toBe(false);
    expect(got.predict(1)).toBe((fitCurve(pointsOf(12), { model: 'exp_decay', level: 0.95 }) as FitResult).predict(1));
    // The same result is in the shared cache: any other path (export, Results sheet) finds it without calculating.
    expect(peekCalc(id)).toBe(got);
    expect(fitProvenance(id)).toMatchObject({ engine: 'worker', model: 'exp_decay', points: 12 });
  });

  it('serve two places that want the same fit with one calculation', async () => {
    const engine = new ManualEngine();
    setFitEngine(engine);
    const { id, req } = identity(12);
    deferredFitResult(id, 'graph', () => req);
    deferredFitResult(id, 'thumbnail', () => req);
    expect(engine.requests).toHaveLength(1);
    engine.requests[0].resolve(runFitRequest(req, 'worker'));
    await flush();
    expect(isFailure(peekCalc(id) as FitResult | FitFailure)).toBe(false);
    expect(fitJobStats.completed).toBe(1);
  });

  it('drop the result of inputs that changed: a later fit is never overwritten by an earlier one that finishes after it', async () => {
    const engine = new ManualEngine();
    setFitEngine(engine);
    const a = identity(12, 0.95);
    const b = identity(12, 0.9);
    expect(deferredFitResult(a.id, 'series', () => a.req)).toBeUndefined();
    // The inputs change before the first is done: the slot now waits for b, and a is cancelled.
    expect(deferredFitResult(b.id, 'series', () => b.req)).toBeUndefined();
    expect(engine.requests[0].aborted).toBe(true);
    expect(fitJobStats.cancelled).toBe(1);
    // b finishes first, then a (an engine that could not stop it) finishes late.
    engine.requests[1].resolve(runFitRequest(b.req, 'worker'));
    await flush();
    engine.requests[0].resolve(runFitRequest(a.req, 'worker'));
    await flush();
    expect(peekCalc(b.id)).toBeDefined();
    expect(peekCalc(a.id)).toBeUndefined();
    const shown = deferredFitResult(b.id, 'series', () => b.req) as FitResult;
    expect(shown).toBe(peekCalc(b.id));
  });

  it('drop a result that arrives after its slot moved on, even from an engine that ignores the abort', async () => {
    const answers: Array<(r: FitReply) => void> = [];
    setFitEngine({ fit: (r) => new Promise((resolve) => answers.push(() => resolve(runFitRequest(r, 'worker')))) });
    const a = identity(12, 0.95);
    const b = identity(12, 0.9);
    deferredFitResult(a.id, 'series', () => a.req);
    deferredFitResult(b.id, 'series', () => b.req);
    answers[0]({} as FitReply);
    await flush();
    expect(peekCalc(a.id)).toBeUndefined();
    expect(fitJobStats.dropped).toBe(1);
    answers[1]({} as FitReply);
    await flush();
    expect(peekCalc(b.id)).toBeDefined();
  });

  it('keep a job that another slot still waits for when one slot moves on', async () => {
    const engine = new ManualEngine();
    setFitEngine(engine);
    const a = identity(12, 0.95);
    const b = identity(12, 0.9);
    deferredFitResult(a.id, 'graph', () => a.req);
    deferredFitResult(a.id, 'thumbnail', () => a.req);
    deferredFitResult(b.id, 'graph', () => b.req);
    expect(engine.requests[0].aborted).toBe(false);
    engine.requests[0].resolve(runFitRequest(a.req, 'worker'));
    await flush();
    expect(peekCalc(a.id)).toBeDefined();
  });

  it('keep a failed fit as a failure, with its reason, and no numbers', async () => {
    setFitEngine(new WorkerFitEngine(() => new InProcessWorker()));
    const data = [0, 1, 1, 2];
    const id: CalcIdentity = { kind: 'fit', algorithm: FIT_ALGORITHM_VERSION, data, method: 'hill_4pl', params: [null], level: 0.95 };
    deferredFitResult(id, 's', () => ({ data: Float64Array.from(data), model: 'hill_4pl', level: 0.95 }));
    await flush();
    const got = deferredFitResult(id, 's', () => ({ data: Float64Array.from(data), model: 'hill_4pl', level: 0.95 })) as FitFailure;
    expect(isFailure(got)).toBe(true);
    expect(got.message).toMatch(/needs at least/);
    expect('params' in got).toBe(false);
  });

  it('are calculated on the main thread when the worker fails, once, and later fits do not try the worker again', async () => {
    setFitEngine({ fit: () => Promise.reject(new Error('worker blocked')) });
    const a = identity(12, 0.95);
    const b = identity(12, 0.9);
    expect(deferredFitResult(a.id, 's', () => a.req)).toBeUndefined();
    await flush();
    expect(isFailure(peekCalc(a.id) as FitResult | FitFailure)).toBe(false);
    expect(fitJobStats.fellBack).toBe(1);
    // After a failure there is no waiting: the result is there at once.
    expect(deferredFitResult(b.id, 's', () => b.req)).toBeDefined();
    expect(fitJobStats.fellBack).toBe(2);
  });

  it('are found again for the same data after the inputs come back (undo), with no second calculation', async () => {
    setFitEngine(new WorkerFitEngine(() => new InProcessWorker()));
    const a = identity(12, 0.95);
    const b = identity(12, 0.9);
    deferredFitResult(a.id, 's', () => a.req);
    await flush();
    deferredFitResult(b.id, 's', () => b.req);
    await flush();
    const before = fitJobStats.started;
    expect(deferredFitResult(a.id, 's', () => a.req)).toBeDefined();
    expect(fitJobStats.started).toBe(before);
  });
});
