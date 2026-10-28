import { afterEach, describe, expect, it } from 'vitest';
import { InProcessWorker } from '../testing/fitEngines';
import { FIT_ALGORITHM_VERSION, FIT_MODELS, fitCurve, fitFromSolution, isFailure, solveFit, type FitModelId, type FitResult } from './fit';
import { DEFER_ABOVE_MS, WorkerFitEngine, mainThreadEngine, runFitRequest, shouldDeferFit, type FitRequest } from './fitEngine';

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
  it('keeps small and cheap fits on the main thread and sends long ones away', () => {
    expect(shouldDeferFit('linear', 1000)).toBe(false);
    expect(shouldDeferFit('hill_4pl', 100)).toBe(false);
    expect(shouldDeferFit('hill_4pl', 2000)).toBe(true);
    expect(shouldDeferFit('asymmetric_5pl', 500)).toBe(true);
    expect(shouldDeferFit('linear', 100000)).toBe(true);
    expect(DEFER_ABOVE_MS).toBeLessThan(16);
  });

  it('always sends the two-phase exponential away, whatever the number of points (its time depends on the data)', () => {
    expect(shouldDeferFit('exp_two_phase', 6)).toBe(true);
  });
});
