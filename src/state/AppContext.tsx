import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { createEmptyProject, createExampleProject } from '../model/defaults';
import { viewAfterRemoval } from '../model/project/viewOrder';
import type { Project, Selection, ViewRef } from '../model/types';
import type { Command } from './commands';
import { historyReducer, initialHistory, scopeCoalesceKey } from './history';
import { affectsRecovery, flushDecision, isConflict, protectionOf, recoveryStatusText, shouldWarnOnUnload, bannerVisible } from './recovery';
import { currentSignature, newEditorId, writeRecovery } from './recoveryStore';
import { backupAutosave, loadAutosave } from './serialize';
import { statusAfter, type StatusMemo } from './statusLine';
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
  /** The status-bar line about the browser recovery copy (empty when there is nothing to say), and whether it is a warning. */
  recoveryText: { text: string; warning: boolean };
  /** True while another tab has written the recovery copy and this tab has changes that could be lost: show the conflict banner. */
  recoveryConflict: boolean;
  /** Conflict: this tab's copy replaces the stored one, and this tab becomes the writer. */
  keepThisTab: () => void;
  /** Conflict: replace this tab's project with the stored copy. The caller confirms first. Returns false when the copy cannot be read. */
  loadOtherTab: () => boolean;
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

/**
 * The project to start with: the autosave (kept as a backup first, so a bad edit cannot replace the only copy), else a new one by
 * the saved settings. A project that comes from the autosave was never saved as a file, and is said to be so.
 */
const initialProject = (): { project: Project; recovered: boolean } => {
  const recovered = loadAutosave();
  if (recovered) {
    backupAutosave();
    return { project: recovered, recovered: true };
  }
  const s = loadSettings();
  const size = { widthPx: s.defaultChartWidthPx, heightPx: s.defaultChartHeightPx };
  return { project: s.newProjectEmpty ? createEmptyProject(size) : createExampleProject(size), recovered: false };
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [start] = useState(initialProject);
  const [history, dispatch] = useReducer(historyReducer, start.project, initialHistory);
  const project = history.present;
  const [view, setView] = useState<ViewRef>(() => ({ kind: 'table', id: project.dataTables[0].id }));
  const [selection, setSelection] = useState<Selection>({ kind: 'chart' });
  const [status, setStatus] = useState(start.recovered ? 'Restored the project from the browser recovery copy. It is not saved as a file yet.' : '');
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
  // A project restored from the browser recovery copy is not saved as a file yet: New and Open warn before they discard it.
  const cleanProject = useRef<Project | null>(start.recovered ? null : project);
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

  // The status line clears on the next action (an edit, undo or redo, a new selection or page). This effect comes before the one below,
  // so that the message of an undo or redo, set in the same commit, wins over the clearing of the one before it.
  const statusSeen = useRef<StatusMemo<Project, Selection, ViewRef> | null>(null);
  useEffect(() => {
    const next = statusAfter(status, statusSeen.current, { project, selection, view });
    statusSeen.current = next.seen;
    if (next.status !== status) setStatus(next.status);
  }, [status, project, selection, view]);

  // Undo/redo can remove the thing the selection points at; keep the status line informative.
  useEffect(() => {
    if (history.lastAction) setStatus(history.lastAction);
  }, [history.lastAction, project]);

  // Autosave of unsaved changes to the browser recovery copy: 400 ms after an edit, and at once when the page is hidden or
  // closed. The saved pointer moves only after a write succeeded, so a failure is retried (every 15 s) rather than forgotten.
  // Every tab has a name and the copy carries the name of its last writer (recoveryStore.ts): a write over a copy that another
  // tab wrote is not done, and the conflict banner asks what to do. The rules are in recovery.ts.
  const saved = useRef(project);
  const [retry, setRetry] = useState(0);
  const [editorId] = useState(newEditorId);
  const seenRef = useRef<string | null>(null);
  if (seenRef.current === null) seenRef.current = currentSignature();
  const [conflict, setConflictState] = useState(false);
  const conflictRef = useRef(false);
  const setConflict = useCallback((v: boolean) => {
    conflictRef.current = v;
    setConflictState(v);
  }, []);
  const [recovery, setRecovery] = useState<{ savedAt: number | null; error: string | null }>({ savedAt: null, error: null });
  /** Writes the pending change now (synchronously). `force`: this tab takes over from another writer. */
  const writeNow = useCallback(
    (force = false): boolean => {
      const p = presentRef.current;
      if (!force && flushDecision({ autosave: settingsRef.current.autosave, pending: p !== saved.current, conflict: conflictRef.current }) !== 'write') return false;
      const r = writeRecovery(p, editorId, seenRef.current ?? '', force);
      if (r.kind === 'ok') {
        seenRef.current = r.seen;
        saved.current = p;
        setAutosaveOk(true);
        setRecovery({ savedAt: r.savedAt, error: null });
        setConflict(false);
        return true;
      }
      if (r.kind === 'conflict') setConflict(true);
      else {
        setAutosaveOk(false);
        setRecovery((s) => ({ ...s, error: r.message }));
        setTimeout(() => setRetry((n) => n + 1), 15000);
      }
      return false;
    },
    [editorId, setConflict],
  );
  useEffect(() => {
    if (!settings.autosave || project === saved.current || conflict) return;
    const t = setTimeout(() => writeNow(), 400);
    return () => clearTimeout(t);
  }, [project, settings.autosave, retry, conflict, writeNow]);

  const protectionNow = useCallback(
    () => protectionOf({ changedSinceFile: presentRef.current !== cleanProject.current, recoveryHoldsThis: presentRef.current === saved.current && !conflictRef.current }),
    [],
  );
  // Leaving the page: write what is pending (the page may not wait for anything slower), and warn only when the work would
  // be lost. Another tab writing the copy is noticed at once, not only at the next write.
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === 'hidden') writeNow();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      writeNow();
      if (shouldWarnOnUnload(protectionNow())) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    const onStorage = (e: StorageEvent) => {
      if ((e.storageArea && e.storageArea !== localStorage) || !affectsRecovery(e.key)) return;
      if (isConflict(seenRef.current ?? '', currentSignature())) setConflict(true);
    };
    window.addEventListener('pagehide', onHidden);
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('pagehide', onHidden);
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('storage', onStorage);
    };
  }, [writeNow, protectionNow, setConflict]);

  const keepThisTab = useCallback(() => {
    if (writeNow(true)) setStatus('This tab now keeps the recovery copy.');
  }, [writeNow]);
  const loadOtherTab = useCallback((): boolean => {
    const other = loadAutosave();
    if (!other) {
      setStatus("The other tab's copy could not be read; this tab was not changed.");
      return false;
    }
    replaceProject(other);
    // The copy holds it, but it is not saved as a file: the next New or Open still asks.
    cleanProject.current = null;
    saved.current = other;
    seenRef.current = currentSignature();
    setRecovery({ savedAt: Date.now(), error: null });
    setConflict(false);
    setStatus("Loaded the other tab's copy.");
    return true;
  }, [replaceProject, setConflict]);

  const protection = protectionOf({ changedSinceFile: project !== cleanProject.current, recoveryHoldsThis: project === saved.current && !conflict });
  const recoveryText = useMemo(() => {
    const text = recoveryStatusText({ protection, savedAt: recovery.savedAt, error: recovery.error, conflict, autosave: settings.autosave });
    return { text, warning: conflict || recovery.error !== null };
  }, [protection, recovery, conflict, settings.autosave]);
  const recoveryConflict = bannerVisible({ conflict, changedSinceFile: project !== cleanProject.current, pending: project !== saved.current });

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
      recoveryText,
      recoveryConflict,
      keepThisTab,
      loadOtherTab,
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
    [project, view, selection, run, undo, redo, history.past.length, history.future.length, replaceProject, newProject, hasUnsavedChanges, markSaved, status, autosaveOk, recoveryText, recoveryConflict, keepThisTab, loadOtherTab, settings, updateSettings, zoom, tableZoom, fitRequest, requestFit, inspectorNav, navigateInspector],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
