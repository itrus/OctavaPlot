import type { Project } from '../model/types';
import type { Command } from './commands';

/** Undo/redo for the project (data edits and chart formatting share one history). */

interface Snapshot {
  project: Project;
  label: string;
}

export interface HistoryState {
  present: Project;
  past: Snapshot[];
  future: Snapshot[];
  /** Consecutive commits with the same key within COALESCE_MS merge into one undo step. */
  coalesce: { key: string; at: number } | null;
  /** Describes the last undo/redo for the status bar. */
  lastAction: string | null;
}

type HistoryAction =
  | { type: 'commit'; label: string; command: Command; coalesceKey?: string; now: number }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'replace'; project: Project };

/** A coalesce key tied to the page and selection it was made on, so edits to different objects never merge. */
export const scopeCoalesceKey = (scope: { view: { kind: string; id: string }; selection: unknown }, key: string | undefined): string | undefined =>
  key === undefined ? undefined : `${scope.view.kind}:${scope.view.id}|${JSON.stringify(scope.selection)}|${key}`;

const COALESCE_MS = 800;
const MAX_HISTORY = 200;

export const initialHistory = (project: Project): HistoryState => ({
  present: project,
  past: [],
  future: [],
  coalesce: null,
  lastAction: null,
});

export function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case 'commit': {
      const next = action.command(state.present);
      if (next === state.present) return state;
      const merge =
        action.coalesceKey !== undefined &&
        state.coalesce?.key === action.coalesceKey &&
        action.now - state.coalesce.at < COALESCE_MS &&
        state.past.length > 0;
      const past = merge ? state.past : [...state.past, { project: state.present, label: action.label }].slice(-MAX_HISTORY);
      return {
        present: next,
        past,
        future: [],
        coalesce: action.coalesceKey !== undefined ? { key: action.coalesceKey, at: action.now } : null,
        lastAction: null,
      };
    }
    case 'undo': {
      const snap = state.past[state.past.length - 1];
      if (!snap) return state;
      return {
        present: snap.project,
        past: state.past.slice(0, -1),
        future: [{ project: state.present, label: snap.label }, ...state.future],
        coalesce: null,
        lastAction: `Undid: ${snap.label}`,
      };
    }
    case 'redo': {
      const snap = state.future[0];
      if (!snap) return state;
      return {
        present: snap.project,
        past: [...state.past, { project: state.present, label: snap.label }],
        future: state.future.slice(1),
        coalesce: null,
        lastAction: `Redid: ${snap.label}`,
      };
    }
    case 'replace':
      return initialHistory(action.project);
  }
}
