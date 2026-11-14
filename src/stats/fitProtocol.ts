/**
 * What travels between the main thread and the fit worker, and what the worker does with it: a request (flat numbers), a reply (plain data) and the
 * numerical part both engines share. The worker file imports this and nothing of the engines, so the worker carries no code it does not run.
 */
import { FIT_ALGORITHM_VERSION, isFailure, solveFit, type FitFailure, type FitSolution } from './fit';
import { type FitModelId } from './fitModels';

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

/** The numerical part, shared by every engine and by the worker's message handler. */
export function runFitRequest(request: FitRequest, engine: FitProvenance['engine']): FitReply {
  const t0 = performance.now();
  const points = Array.from({ length: request.data.length >> 1 }, (_, i) => ({ x: request.data[2 * i], y: request.data[2 * i + 1] }));
  const outcome = solveFit(points, { model: request.model, degree: request.degree, level: request.level });
  const diagnostics = isFailure(outcome) ? [outcome.message] : outcome.message ? [outcome.message] : [];
  return { outcome, diagnostics, provenance: { algorithm: FIT_ALGORITHM_VERSION, engine, model: request.model, points: points.length, level: request.level, ms: performance.now() - t0 } };
}

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
