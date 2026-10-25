import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { createEmptyProject, createExampleProject } from '../model/defaults';
import { viewAfterRemoval } from '../model/project/viewOrder';
import type { Project, Selection, ViewRef } from '../model/types';
import type { Command } from './commands';
import { historyReducer, initialHistory, scopeCoalesceKey } from './history';
import { backupAutosave, loadAutosave, saveAutosave } from './serialize';
import { loadSettings, saveSettings, sanitizeSettings, type Settings } from './settings';
import type { InspectorTarget } from './inspectorNav';

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
  /** Start a new project (example data, or blank tables when Settings says so) at the default chart size; settings are kept. Clears history. */
  newProject: () => void;
  /** True when the project has changes since it was last opened, created or saved to a file. */
  hasUnsavedChanges: () => boolean;
  /** Record that a project was just saved to a file: the one that was written (edits made while writing stay unsaved). */
  markSaved: (written: Project) => void;
  status: string;
  setStatus: (s: string) => void;
  autosaveOk: boolean;
  /** Application preferences (autosave, export, default chart size). */
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  /** Graph preview zoom, 0.25–4 (1 = 100%). */
  zoom: number;
  setZoom: (z: number) => void;
  /** Data table zoom, 0.25–4 (1 = 100%); kept apart from the graph zoom. */
  tableZoom: number;
  setTableZoom: (z: number) => void;
  /** Counts requests to refit the graph to the window (the Fit button). */
  fitRequest: number;
  requestFit: () => void;
  /** The inspector page the last click on a chart element asked for; `n` changes on every request. */
  inspectorNav: { target: InspectorTarget | null; n: number };
  navigateInspector: (target: InspectorTarget) => void;
}

const Ctx = createContext<AppApi | null>(null);

export function useApp(): AppApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside <AppProvider>');
  return v;
}

/** The project to start with: the autosave (kept as a backup first, so a bad edit cannot replace the only copy), else a new one by the saved settings. */
const initialProject = (): Project => {
  const recovered = loadAutosave();
  if (recovered) {
    backupAutosave();
    return recovered;
  }
  const s = loadSettings();
  const size = { widthPx: s.defaultChartWidthPx, heightPx: s.defaultChartHeightPx };
  return s.newProjectEmpty ? createEmptyProject(size) : createExampleProject(size);
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [history, dispatch] = useReducer(historyReducer, undefined, () => initialHistory(initialProject()));
  const project = history.present;
  const [view, setView] = useState<ViewRef>(() => ({ kind: 'table', id: project.dataTables[0].id }));
  const [selection, setSelection] = useState<Selection>({ kind: 'chart' });
  const [status, setStatus] = useState('');
  const [autosaveOk, setAutosaveOk] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [tableZoom, setTableZoom] = useState(1);
  const [fitRequest, setFitRequest] = useState(0);
  const requestFit = useCallback(() => setFitRequest((n) => n + 1), []);
  const [inspectorNav, setInspectorNav] = useState<{ target: InspectorTarget | null; n: number }>({ target: null, n: 0 });
  const navigateInspector = useCallback((target: InspectorTarget) => setInspectorNav((s) => ({ target, n: s.n + 1 })), []);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => {
      const next = sanitizeSettings({ ...s, ...patch });
      saveSettings(next);
      return next;
    });
  }, []);

  // Edits merge into one undo step only on the same object: the key carries the page and the selection it was made on.
  const scopeRef = useRef({ view, selection });
  scopeRef.current = { view, selection };
  const run = useCallback(
    (label: string, command: Command, coalesceKey?: string) =>
      dispatch({ type: 'commit', label, command, coalesceKey: scopeCoalesceKey(scopeRef.current, coalesceKey), now: Date.now() }),
    [],
  );
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const redo = useCallback(() => dispatch({ type: 'redo' }), []);
  // The project as last opened, created or saved to a file (autosave to the browser does not count).
  const cleanProject = useRef(project);
  const presentRef = useRef(project);
  presentRef.current = project;
  const hasUnsavedChanges = useCallback(() => presentRef.current !== cleanProject.current, []);
  const markSaved = useCallback((written: Project) => {
    cleanProject.current = written;
  }, []);
  const replaceProject = useCallback((p: Project) => {
    cleanProject.current = p;
    dispatch({ type: 'replace', project: p });
    setSelection({ kind: 'chart' });
    setView({ kind: 'table', id: p.dataTables[0].id });
  }, []);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const newProject = useCallback(() => {
    const s = settingsRef.current;
    const size = { widthPx: s.defaultChartWidthPx, heightPx: s.defaultChartHeightPx };
    replaceProject(s.newProjectEmpty ? createEmptyProject(size) : createExampleProject(size));
    setZoom(1);
    setStatus('New project.');
  }, [replaceProject]);

  // Undoing the creation of the item on screen (or deleting it) must not leave an empty workspace: go to the page above it
  // in the navigator (see viewAfterRemoval), not back to the first table.
  const projectBefore = useRef(project);
  useEffect(() => {
    const exists = view.kind === 'folder' ? true : view.kind === 'table' ? project.dataTables.some((t) => t.id === view.id) : view.kind === 'chart' ? project.charts.some((c) => c.id === view.id) : view.kind === 'layout' ? (project.layouts ?? []).some((l) => l.id === view.id) : (project.analyses ?? []).some((a) => a.id === view.id);
    if (!exists) setView(viewAfterRemoval(projectBefore.current, project, view));
    projectBefore.current = project;
  }, [project, view]);

  // Undo/redo can remove the thing the selection points at; keep the status line informative.
  useEffect(() => {
    if (history.lastAction) setStatus(history.lastAction);
  }, [history.lastAction, project]);

  // Debounced autosave of unsaved changes; switching autosave back on saves what was edited while it was off.
  // The saved pointer moves only after a write succeeded, so a failure is retried (every 15 s) rather than forgotten.
  const saved = useRef(project);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!settings.autosave || project === saved.current) return;
    const t = setTimeout(() => {
      const ok = saveAutosave(project);
      setAutosaveOk(ok);
      if (ok) saved.current = project;
      else setTimeout(() => setRetry((n) => n + 1), 15000);
    }, 400);
    return () => clearTimeout(t);
  }, [project, settings.autosave, retry]);

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
      newProject,
      hasUnsavedChanges,
      markSaved,
      status,
      setStatus,
      autosaveOk,
      settings,
      updateSettings,
      zoom,
      setZoom,
      tableZoom,
      setTableZoom,
      fitRequest,
      requestFit,
      inspectorNav,
      navigateInspector,
    }),
    [project, view, selection, run, undo, redo, history.past.length, history.future.length, replaceProject, newProject, hasUnsavedChanges, markSaved, status, autosaveOk, settings, updateSettings, zoom, tableZoom, fitRequest, requestFit, inspectorNav, navigateInspector],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
