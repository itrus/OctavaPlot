import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { createExampleProject } from '../model/defaults';
import type { Project, Selection, ViewRef } from '../model/types';
import type { Command } from './commands';
import { historyReducer, initialHistory } from './history';
import { loadAutosave, saveAutosave } from './serialize';

interface AppApi {
  project: Project;
  view: ViewRef;
  setView: (v: ViewRef) => void;
  selection: Selection;
  setSelection: (s: Selection) => void;
  /** Run a command as one undoable transaction. */
  run: (label: string, command: Command, coalesceKey?: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Replace the whole project (open file); clears history. */
  replaceProject: (p: Project) => void;
  status: string;
  setStatus: (s: string) => void;
  autosaveOk: boolean;
  /** Graph preview zoom, 0.25–4 (1 = 100%). */
  zoom: number;
  setZoom: (z: number) => void;
}

const Ctx = createContext<AppApi | null>(null);

export function useApp(): AppApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside <AppProvider>');
  return v;
}

const initialProject = (): Project => loadAutosave() ?? createExampleProject();

export function AppProvider({ children }: { children: ReactNode }) {
  const [history, dispatch] = useReducer(historyReducer, undefined, () => initialHistory(initialProject()));
  const project = history.present;
  const [view, setView] = useState<ViewRef>(() => ({ kind: 'table', id: project.dataTables[0].id }));
  const [selection, setSelection] = useState<Selection>({ kind: 'chart' });
  const [status, setStatus] = useState('');
  const [autosaveOk, setAutosaveOk] = useState(true);
  const [zoom, setZoom] = useState(1);

  const run = useCallback(
    (label: string, command: Command, coalesceKey?: string) =>
      dispatch({ type: 'commit', label, command, coalesceKey, now: Date.now() }),
    [],
  );
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const redo = useCallback(() => dispatch({ type: 'redo' }), []);
  const replaceProject = useCallback((p: Project) => {
    dispatch({ type: 'replace', project: p });
    setSelection({ kind: 'chart' });
    setView({ kind: 'table', id: p.dataTables[0].id });
  }, []);

  // Undo/redo can remove the thing the selection points at; keep the status line informative.
  useEffect(() => {
    if (history.lastAction) setStatus(history.lastAction);
  }, [history.lastAction, project]);

  // Debounced autosave.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => setAutosaveOk(saveAutosave(project)), 400);
    return () => clearTimeout(t);
  }, [project]);

  const api = useMemo<AppApi>(
    () => ({
      project,
      view,
      setView,
      selection,
      setSelection,
      run,
      undo,
      redo,
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0,
      replaceProject,
      status,
      setStatus,
      autosaveOk,
      zoom,
      setZoom,
    }),
    [project, view, selection, run, undo, redo, history.past.length, history.future.length, replaceProject, status, autosaveOk, zoom],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
