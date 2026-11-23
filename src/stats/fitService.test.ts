import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InProcessWorker, ManualEngine } from '../testing/fitEngines';
import { clearCalcCache, peekCalc, type CalcIdentity } from './calcCache';
import { FIT_ALGORITHM_VERSION, fitCurve, isFailure, type FitFailure, type FitResult, runFitRequest, type FitReply, type FitRequest, fitFromSolution, solveFit } from './fit';
import { WorkerFitEngine, deferredFitResult, fitJobStats, fitProvenance, fitsVersion, pendingFitCount, resetFitService, setFitEngine, subscribeFits, DEFER_ABOVE_MS, mainThreadEngine, shouldDeferFit } from './fitService';
import { FIT_MODELS, type FitModelId } from './fitModels';

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

const sample = (id: FitModelId, n: number) => {
  let seed = 11;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  return Array.from({ length: n }, (_, i) => {
    const x = 0.2 + (i / n) * 9;
    const y = id === 'hill_4pl' || id === 'asymmetric_5pl' ? 1 + 9 / (1 + (3 / x) ** 1.4) : id === 'gaussian_peak' ? 5 * Math.exp(-((x - 4) ** 2) / 3) : id === 'hyperbola' ? (8 * x) / (2 + x) : 2 + 5 * Math.exp(-0.6 * x) + 1.2 * Math.exp(-0.04 * x);
    return { x, y: y + (rnd() - 0.5) * 0.3 };
  });
};
const flat = (pts: Array<{ x: number; y: number }>) => Float64Array.from(pts.flatMap((p) => [p.x, p.y]));
const request = (model: FitModelId, n = 30, level = 0.95): FitRequest => ({ data: flat(sample(model, n)), model, degree: 3, level });

const engines: WorkerFitEngine[] = [];
const workerEngine = (make = () => new InProcessWorker()) => {
  const e = new WorkerFitEngine(make);
  engines.push(e);
  return e;
};
afterEach(() => engines.splice(0).forEach((e) => e.dispose()));

const grid = (a: number, b: number, k = 25) => Array.from({ length: k }, (_, i) => a + ((b - a) * i) / (k - 1));

describe('a fit made through the worker protocol', () => {
  it.each(FIT_MODELS.map((m) => m.id))('is the same fit as the synchronous one (%s): parameters, curve and bands, bit for bit', async (id) => {
    const req = request(id);
    const points = sample(id, 30);
    const sync = fitCurve(points, { model: id, degree: 3, level: 0.95 });
    const reply = await workerEngine().fit(req);
    expect(reply.provenance.engine).toBe('worker');
    if (isFailure(sync)) {
      expect(reply.outcome).toEqual(sync);
      return;
    }
    expect(isFailure(reply.outcome)).toBe(false);
    if (isFailure(reply.outcome)) return;
    const viaWorker = fitFromSolution(reply.outcome);
    expect(viaWorker.params).toEqual(sync.params);
    for (const k of ['n', 'df', 'rss', 'rSquared', 'sigma', 'converged', 'message'] as const) expect(viaWorker[k]).toEqual(sync[k]);
    const xs = grid(points[0].x - 1, points[points.length - 1].x + 2);
    for (const x of xs) {
      expect(viaWorker.predict(x)).toBe(sync.predict(x));
      for (const kind of ['confidence', 'prediction'] as const) expect(viaWorker.halfWidth(x, kind, 0.9)).toBe(sync.halfWidth(x, kind, 0.9));
    }
  });

  it('is what the main-thread engine gives, apart from where it says it was made and how long it took', async () => {
    const req = request('hill_4pl');
    const here = await mainThreadEngine.fit(req);
    const there = await workerEngine().fit(req);
    expect(there.outcome).toEqual(here.outcome);
    expect(there.diagnostics).toEqual(here.diagnostics);
    expect({ ...there.provenance, ms: 0, engine: '' }).toEqual({ ...here.provenance, ms: 0, engine: '' });
    expect(here.provenance.engine).toBe('main');
  });

  it('carries the provenance and the diagnostics a number needs to be traced', async () => {
    const reply = await workerEngine().fit(request('exp_decay', 12, 0.9));
    expect(reply.provenance).toMatchObject({ algorithm: FIT_ALGORITHM_VERSION, model: 'exp_decay', points: 12, level: 0.9, engine: 'worker' });
    expect(reply.provenance.ms).toBeGreaterThanOrEqual(0);
    const failed = await workerEngine().fit({ data: flat([{ x: 1, y: 1 }, { x: 2, y: 2 }]), model: 'hill_4pl', level: 0.95 });
    expect(isFailure(failed.outcome)).toBe(true);
    expect(failed.diagnostics[0]).toMatch(/needs at least/);
  });

  it('sends nothing a worker could not receive: the reply is plain data', () => {
    const reply = runFitRequest(request('hill_4pl'), 'worker');
    expect(() => structuredClone(reply)).not.toThrow();
    const sol = solveFit(sample('linear', 10), { model: 'linear', level: 0.95 });
    expect(JSON.stringify(sol)).not.toContain('predict');
  });

  it('keeps the numbers a fit needs when a point is not finite or X is not allowed, as the synchronous fit does', async () => {
    const pts = [...sample('hyperbola', 20), { x: -1, y: 3 }, { x: 4, y: Number.NaN }];
    const sync = fitCurve(pts, { model: 'hyperbola', level: 0.95 }) as FitResult;
    const reply = await workerEngine().fit({ data: flat(pts), model: 'hyperbola', level: 0.95 });
    const via = fitFromSolution(reply.outcome as never);
    expect(via.n).toBe(sync.n);
    expect(via.message).toBe(sync.message);
    expect(via.predict(3)).toBe(sync.predict(3));
  });
});

describe('the worker engine', () => {
  it('answers requests in the order they were made, one at a time', async () => {
    const worker = new InProcessWorker();
    const e = workerEngine(() => worker);
    const done: number[] = [];
    const all = [request('linear', 5), request('linear', 6), request('linear', 7)].map((r) => e.fit(r).then((x) => done.push(x.provenance.points)));
    await Promise.all(all);
    expect(done).toEqual([5, 6, 7]);
    expect(worker.received.map((m) => m.id)).toEqual([1, 2, 3]);
  });

  it('drops a request that is aborted while it waits, without sending it', async () => {
    const worker = new InProcessWorker();
    const e = workerEngine(() => worker);
    const ac = new AbortController();
    const first = e.fit(request('linear', 5));
    const second = e.fit(request('linear', 6), ac.signal);
    ac.abort();
    await expect(second).rejects.toMatchObject({ name: 'AbortError' });
    await first;
    expect(worker.received).toHaveLength(1);
  });

  it('ends the worker of a request aborted while it runs, and goes on with the next on a new one', async () => {
    const made: InProcessWorker[] = [];
    const e = workerEngine(() => {
      const w = new InProcessWorker();
      made.push(w);
      return w;
    });
    const ac = new AbortController();
    const running = e.fit(request('exp_decay', 20), ac.signal);
    const next = e.fit(request('linear', 9));
    ac.abort();
    await expect(running).rejects.toMatchObject({ name: 'AbortError' });
    const reply = await next;
    expect(reply.provenance.points).toBe(9);
    expect(made).toHaveLength(2);
    expect(made[0].terminated).toBe(true);
  });

  it('rejects what was waiting when the worker fails, so the caller can calculate itself', async () => {
    const e = workerEngine(() => new InProcessWorker(() => true));
    await expect(e.fit(request('linear', 5))).rejects.toThrow('crash');
    // and the next request starts a new worker
    await expect(e.fit(request('linear', 5))).rejects.toThrow('crash');
  });

  it('rejects when no worker can be made', async () => {
    const e = workerEngine(() => {
      throw new Error('blocked');
    });
    await expect(e.fit(request('linear', 5))).rejects.toThrow('blocked');
  });
});

describe('which fits are sent away', () => {
  it('keeps small and cheap line fits on the main thread and sends long ones away', () => {
    expect(shouldDeferFit('linear', 1000)).toBe(false);
    expect(shouldDeferFit('polynomial', 1000)).toBe(false);
    expect(shouldDeferFit('linear', 100000)).toBe(true);
    expect(DEFER_ABOVE_MS).toBeLessThan(16);
  });

  it('always sends a nonlinear fit away, whatever the number of points (its time depends on the data)', () => {
    for (const m of FIT_MODELS) if (m.id !== 'linear' && m.id !== 'polynomial') expect(shouldDeferFit(m.id, 6)).toBe(true);
  });
});
