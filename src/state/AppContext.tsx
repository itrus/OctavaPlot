import type { Command } from './commands';
import { ProjectContext, CommandsContext, HistoryContext, SelectionContext, NavigationContext, StatusContext, RecoveryContext, PreferencesContext, GraphViewportContext, TableViewportContext, LayoutViewportContext, ResultsViewportContext } from './contexts';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { createEmptyProject, createExampleProject } from '../model/defaults';
import { viewAfterRemoval } from '../model/project/viewOrder';
import type { Project } from '../model/types';
import type { Selection, ViewRef } from '../model/selection';
import { historyReducer, initialHistory, scopeCoalesceKey } from './history';
import { affectsRecovery, flushDecision, isConflict, isGone, protectionOf, recoveryStatusText, shouldWarnOnUnload, bannerVisible } from './recovery/recovery';
import { currentSignature, newEditorId, writeRecovery } from './recovery/recoveryStore';
import { backupAutosave, loadAutosave, readAutosave } from './serialize';
import { statusAfter, type StatusMemo } from './statusLine';
import { loadSettings, newChartStart, saveSettings, sanitizeSettings, type Settings } from './settings';
import { forgetPlaces, type InspectorTarget } from './inspectorNav';

export { useProject, useCommands, useHistory, useSelection, useNavigation, useStatus, useRecovery, usePreferences, useGraphViewport, useTableViewport, useResultsViewport, useLayoutViewport } from './contexts';

/**
 * The project to start with: the autosave (kept as a backup first, so a bad edit cannot replace the only copy), else a new one by
 * the saved settings. A project that comes from the autosave was never saved as a file, and is said to be so.
 */
const initialProject = (): { project: Project; recovered: boolean; message: string; held: boolean } => {
  // Kept apart even when it cannot be read (a file of a newer version, a damaged one): the first edit would otherwise overwrite the only copy.
  // With Autosave off nothing is read back from the browser: a copy left from before is older than what was saved as a file.
  const autosaveOn = loadSettings().autosave;
  const held = (autosaveOn ? backupAutosave() : 'none') === 'held';
  const read = autosaveOn ? readAutosave() : ({ kind: 'none' } as const);
  if (read.kind === 'restored') {
    const n = read.notes.length;
    const reset = n === 0 ? '' : ` ${n} stored value${n === 1 ? ' was' : 's were'} reset to defaults: ${read.notes[0]}${n > 1 ? ` (and ${n - 1} more)` : ''}`;
    return { project: read.project, recovered: true, message: `Restored the project from the browser recovery copy.${reset} It is not saved as a file yet.`, held };
  }
  const s = loadSettings();
  const size = newChartStart(s);
  const message = held ? 'The project kept in this browser could not be read by this version, and could not be set aside. A new project was opened, but Autosave is paused so that the stored text is not overwritten: download it from File > Recovery copies, or switch Autosave off in Settings to delete it.' : read.kind === 'unreadable' ? 'The project kept in this browser could not be read by this version, so a new project was opened. The stored text was set aside and is not overwritten; it can be downloaded from File > Recovery copies.' : '';
  return { project: s.newProjectSample ? createExampleProject(size) : createEmptyProject(size), recovered: false, message, held };
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [start] = useState(initialProject);
  const [history, dispatch] = useReducer(historyReducer, start.project, initialHistory);
  const project = history.present;
  const [view, setView] = useState<ViewRef>(() => ({ kind: 'table', id: project.dataTables[0].id }));
  const [selection, setSelection] = useState<Selection>({ kind: 'chart' });
  const [status, setStatusText] = useState(start.message);
  // Every setting of the message counts, so that the same text set twice is two messages (the second is not taken for the first and wiped).
  const [statusSeq, setStatusSeq] = useState(0);
  const setStatus = useCallback((s: string) => {
    setStatusText(s);
    setStatusSeq((n) => n + 1);
  }, []);
  const [autosaveOk, setAutosaveOk] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [tableZoom, setTableZoom] = useState(1);
  const [resultsZoom, setResultsZoom] = useState(1);
  const [layoutZoom, setLayoutZoom] = useState(1);
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
    forgetPlaces();
    setSelection({ kind: 'chart' });
    setView({ kind: 'table', id: p.dataTables[0].id });
  }, []);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const newProject = useCallback(() => {
    const s = settingsRef.current;
    const size = newChartStart(s);
    replaceProject(s.newProjectSample ? createExampleProject(size) : createEmptyProject(size));
    setZoom(1);
    setLayoutZoom(1);
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
    const next = statusAfter(status, statusSeen.current, { project, selection, view }, statusSeq);
    statusSeen.current = next.seen;
    if (next.status !== status) setStatus(next.status);
  }, [status, statusSeq, setStatus, project, selection, view]);

  // Undo/redo can remove the thing the selection points at; keep the status line informative.
  useEffect(() => {
    if (history.lastAction) setStatus(history.lastAction);
  }, [history.lastAction, project]);

  // Autosave of unsaved changes to the browser recovery copy: 400 ms after an edit, and at once when the page is hidden or
  // closed. The saved pointer moves only after a write succeeded, so a failure is retried (every 15 s) rather than forgotten.
  // Every tab has a name and the copy carries the name of its last writer (recoveryStore.ts): a write over a copy that another
  // tab wrote is not done, and the conflict banner asks what to do. The rules are in recovery.ts.
  // What the recovery copy holds (null: nothing, e.g. after it was deleted).
  const saved = useRef<Project | null>(project);
  // Stored text that this build cannot read and that could not be set aside: nothing is written over it (see backupAutosave).
  const heldRef = useRef(start.held);
  const [retry, setRetry] = useState(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (retryTimer.current !== null) clearTimeout(retryTimer.current); }, []);
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
      if (heldRef.current) {
        setAutosaveOk(false);
        setRecovery((s) => ({ ...s, error: 'the project stored in this browser could not be set aside and is kept as it is' }));
        return false;
      }
      const r = writeRecovery(p, editorId, seenRef.current ?? '', force);
      if (r.kind === 'ok') {
        seenRef.current = r.seen;
        saved.current = p;
        setAutosaveOk(true);
        setRecovery({ savedAt: r.savedAt, error: null });
        setConflict(false);
        if (retryTimer.current !== null) clearTimeout(retryTimer.current);
        retryTimer.current = null;
        return true;
      }
      if (r.kind === 'conflict') setConflict(true);
      else {
        setAutosaveOk(false);
        setRecovery((s) => ({ ...s, error: r.message }));
        // One retry at a time: a timer for every failed write would multiply with every edit and never end.
        if (retryTimer.current === null) retryTimer.current = setTimeout(() => ((retryTimer.current = null), setRetry((n) => n + 1)), 15000);
      }
      return false;
    },
    [editorId, setConflict],
  );
  // Autosave off deletes the browser copies (SettingsDialog): nothing holds this project any more, so switching it on again writes it.
  useEffect(() => {
    if (settings.autosave) return;
    saved.current = null;
    heldRef.current = false;
    seenRef.current = currentSignature();
    setRecovery({ savedAt: null, error: null });
    setAutosaveOk(true);
    setConflict(false);
  }, [settings.autosave, setConflict]);
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
      const now = currentSignature();
      if (isGone(now)) {
        // Deleted (in another tab, or by clearing the site data): the copy no longer holds this project, and writing again overwrites nothing.
        saved.current = null;
        seenRef.current = now;
        setRecovery({ savedAt: null, error: null });
        setConflict(false);
        setRetry((n) => n + 1);
      } else if (isConflict(seenRef.current ?? '', now)) setConflict(true);
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
    // Nothing has changed since the project was opened, created or saved to a file: the top bar says so.
    const text = protection === 'file' ? 'All changes saved' : recoveryStatusText({ protection, savedAt: recovery.savedAt, error: recovery.error, conflict, autosave: settings.autosave });
    return { text, warning: conflict || recovery.error !== null };
  }, [protection, recovery, conflict, settings.autosave]);
  const recoveryConflict = bannerVisible({ conflict, changedSinceFile: project !== cleanProject.current, pending: project !== saved.current });

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;
  const projectApi = useMemo(() => ({ project, replaceProject, newProject, hasUnsavedChanges, markSaved }), [project, replaceProject, newProject, hasUnsavedChanges, markSaved]);
  const commandsApi = useMemo(() => ({ run, setStatus }), [run, setStatus]);
  const historyApi = useMemo(() => ({ undo, redo, canUndo, canRedo }), [undo, redo, canUndo, canRedo]);
  const selectionApi = useMemo(() => ({ selection, setSelection }), [selection, setSelection]);
  const navigationApi = useMemo(() => ({ view, setView, inspectorNav, navigateInspector }), [view, setView, inspectorNav, navigateInspector]);
  const statusApi = useMemo(() => ({ status }), [status]);
  const recoveryApi = useMemo(() => ({ autosaveOk, recoveryText, recoveryConflict, keepThisTab, loadOtherTab }), [autosaveOk, recoveryText, recoveryConflict, keepThisTab, loadOtherTab]);
  const preferencesApi = useMemo(() => ({ settings, updateSettings }), [settings, updateSettings]);
  const graphViewportApi = useMemo(() => ({ zoom, setZoom, fitRequest, requestFit }), [zoom, setZoom, fitRequest, requestFit]);
  const tableViewportApi = useMemo(() => ({ tableZoom, setTableZoom }), [tableZoom, setTableZoom]);
  const resultsViewportApi = useMemo(() => ({ resultsZoom, setResultsZoom }), [resultsZoom, setResultsZoom]);
  const layoutViewportApi = useMemo(() => ({ layoutZoom, setLayoutZoom }), [layoutZoom, setLayoutZoom]);

  return (
    <ProjectContext.Provider value={projectApi}>
      <CommandsContext.Provider value={commandsApi}>
        <HistoryContext.Provider value={historyApi}>
          <SelectionContext.Provider value={selectionApi}>
            <NavigationContext.Provider value={navigationApi}>
              <StatusContext.Provider value={statusApi}>
                <RecoveryContext.Provider value={recoveryApi}>
                  <PreferencesContext.Provider value={preferencesApi}>
                    <GraphViewportContext.Provider value={graphViewportApi}>
                      <TableViewportContext.Provider value={tableViewportApi}>
                        <ResultsViewportContext.Provider value={resultsViewportApi}>
                          <LayoutViewportContext.Provider value={layoutViewportApi}>
                            {children}
                          </LayoutViewportContext.Provider>
                        </ResultsViewportContext.Provider>
                      </TableViewportContext.Provider>
                    </GraphViewportContext.Provider>
                  </PreferencesContext.Provider>
                </RecoveryContext.Provider>
              </StatusContext.Provider>
            </NavigationContext.Provider>
          </SelectionContext.Provider>
        </HistoryContext.Provider>
      </CommandsContext.Provider>
    </ProjectContext.Provider>
  );
}
