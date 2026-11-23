import { lazy, memo, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { prepareChartInput } from './model/table/preparedChart';
import { AppProvider, useCommands, useGraphViewport, useHistory, useLayoutViewport, useNavigation, usePreferences, useProject, useRecovery, useResultsViewport, useStatus, useTableViewport } from './state/AppContext';
import { openedStatus, refusedStatus, PROJECT_EXTENSION, PROJECT_MIME, projectToFileText, readProjectFile, openDecision } from './state/projectFile';
import { Navigator } from './ui/navigator/Navigator';
import { Splitter } from './ui/components/Splitter';
import { FitWindowIcon } from './ui/components/icons';
import { MenuBar } from './ui/components/MenuBar';
import { buildMenus, runShortcut, type MenuContext } from './ui/appMenus';
import { shortcutOf, type ShortcutAction, isTextEntryTarget } from './ui/components/appShortcuts';
import { ShortcutsDialog } from './ui/dialogs/ShortcutsDialog';
import { setProjectName } from './state/commands';
import { InfoDialog } from './ui/dialogs/InfoDialog';
import { SettingsDialog } from './ui/dialogs/SettingsDialog';
import { RecoveryDialog } from './ui/dialogs/RecoveryDialog';
import type { Project } from './model/types';
import { RepairNotesDialog } from './ui/dialogs/RepairNotesDialog';
import { LOAD_OTHER_TAB_WARNING, RecoveryConflictBanner } from './ui/components/RecoveryConflictBanner';
import { WheelRange } from './ui/components/WheelRange';
import { downloadBlob } from './util/download';
import { exportFileName } from './util/fileName';

/** The browser's save-file dialog (File System Access API; not in every browser). */
type SaveFilePicker = (options: {
  suggestedName: string;
  types: Array<{ description: string; accept: Record<string, string[]> }>;
}) => Promise<{ name: string; createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }> }>;

// Each workspace view is its own chunk, loaded when first opened.
const DataTableView = lazy(() => import('./ui/views/DataTableView').then((m) => ({ default: memo(m.DataTableView) })));
const AnalysisView = lazy(() => import('./ui/views/AnalysisView').then((m) => ({ default: memo(m.AnalysisView) })));
const LayoutView = lazy(() => import('./ui/views/LayoutView').then((m) => ({ default: memo(m.LayoutView) })));
const FolderView = lazy(() => import('./ui/views/FolderView').then((m) => ({ default: memo(m.FolderView) })));
const GraphView = lazy(() => import('./ui/views/GraphView').then((m) => ({ default: memo(m.GraphView) })));
const Inspector = lazy(() => import('./ui/inspector/Inspector').then((m) => ({ default: memo(m.Inspector) })));

// Keep shell-only changes (status and zoom controls) out of unrelated workspace trees.
const MemoNavigator = memo(Navigator);

/** A window outline with the left or right strip filled: the usual "side panel" glyph. */
function PanelIcon({ side }: { side: 'left' | 'right' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <rect x="1.7" y="2.7" width="12.6" height="10.6" rx="1.5" />
      <path d={side === 'left' ? 'M6 2.7v10.6' : 'M10 2.7v10.6'} />
    </svg>
  );
}

function Shell() {
  const { project, replaceProject, newProject, hasUnsavedChanges, markSaved } = useProject();
  const { view, inspectorNav, navigateInspector } = useNavigation();
  const { run, setStatus } = useCommands();
  const { undo, redo, canUndo, canRedo } = useHistory();
  const { status } = useStatus();
  const { recoveryText, recoveryConflict, keepThisTab, loadOtherTab } = useRecovery();
  const { zoom, setZoom, requestFit } = useGraphViewport();
  const { tableZoom, setTableZoom } = useTableViewport();
  const { resultsZoom, setResultsZoom } = useResultsViewport();
  const { layoutZoom, setLayoutZoom } = useLayoutViewport();
  const { settings } = usePreferences();
  const fileRef = useRef<HTMLInputElement>(null);
  // Panels are only hidden (never unmounted), so their selections and edits survive a collapse.
  const [navOpen, setNavOpen] = useState(true);
  // The logo and app name row can be folded away; the choice is remembered in this browser.
  const [headOpen, setHeadOpen] = useState(() => {
    try {
      return localStorage.getItem('octavaplot.head') !== 'closed';
    } catch {
      return true;
    }
  });
  // Full screen follows the browser's own state, so F11 and Esc keep the View menu's tick right.
  const [fullscreen, setFullscreen] = useState(() => !!document.fullscreenElement);
  useEffect(() => {
    const on = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const toggleHead = () => {
    const next = !headOpen;
    setHeadOpen(next);
    try {
      localStorage.setItem('octavaplot.head', next ? 'open' : 'closed');
    } catch {
      /* storage blocked: the choice just is not remembered */
    }
  };
  const [inspectorOpen, setInspectorOpen] = useState(true);
  // Panel widths (px), changed with the splitters; a narrow window starts with the panels folded away.
  const [navW, setNavW] = useState(250);
  const [inspW, setInspW] = useState(360);
  useEffect(() => {
    const narrow = window.matchMedia('(max-width: 1100px)');
    const veryNarrow = window.matchMedia('(max-width: 800px)');
    const apply = () => {
      if (narrow.matches) setNavOpen(false);
      if (veryNarrow.matches) setInspectorOpen(false);
    };
    apply();
    narrow.addEventListener('change', apply);
    veryNarrow.addEventListener('change', apply);
    return () => {
      narrow.removeEventListener('change', apply);
      veryNarrow.removeEventListener('change', apply);
    };
  }, []);
  // Where the panels float over the workspace (max-width 900px in styles.css), choosing an item in the navigator takes it out of the way.
  const lastView = useRef(view);
  useEffect(() => {
    const changed = lastView.current !== view && !(lastView.current.kind === view.kind && 'id' in lastView.current && 'id' in view && lastView.current.id === view.id);
    lastView.current = view;
    if (changed && window.matchMedia('(max-width: 900px)').matches) setNavOpen(false);
  }, [view]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // What was reset when the last file was opened: all of it, with the paths, is behind the Details button.
  const [repairs, setRepairs] = useState<{ file: string; notes: string[] } | null>(null);
  const [repairsOpen, setRepairsOpen] = useState(false);
  // Clicking a chart element brings up its settings, even when the inspector was collapsed.
  useEffect(() => {
    if (inspectorNav.n > 0) setInspectorOpen(true);
  }, [inspectorNav.n]);

  // The key handler runs the Save Project of the latest render.
  const saveRef = useRef<() => Promise<void>>(async () => {});
  // ...and so does the handler of the other shortcuts (appShortcuts.ts).
  const shortcutRef = useRef<(a: ShortcutAction) => boolean>(() => false);

  // Every shortcut (appShortcuts.ts) is read here; what each does is set in shortcutRef at each render.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A key the focused control has already used (F2 in the grid edits the cell) is not also a shortcut.
      if (e.isComposing || e.defaultPrevented) return;
      const action = shortcutOf(e, isTextEntryTarget(e.target));
      if (!action) return;
      // The browser's own "Save page" never opens; the project is saved unless a dialog is open or the key is held down.
      if (action === 'save') {
        e.preventDefault();
        if (!e.repeat && !document.querySelector('.modal-backdrop')) void saveRef.current();
        return;
      }
      if (document.querySelector('.modal-backdrop')) return; // a dialog is open: its shortcuts are not the project's
      if (shortcutRef.current(action)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const saveProject = async () => {
    // What is written is this snapshot: edits made while the file is being written stay unsaved.
    const snapshot = project;
    const suggested = exportFileName(project.name, PROJECT_EXTENSION.slice(1), settings.timestampExports);
    let json: string;
    try {
      json = projectToFileText(snapshot);
    } catch (err) {
      setStatus(`Could not save the project: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    // Browsers with the File System Access API ask where to save and under what name; others download the suggested name.
    const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
    if (picker) {
      try {
        const handle = await picker({ suggestedName: suggested, types: [{ description: 'OctavaPlot project', accept: { [PROJECT_MIME]: [PROJECT_EXTENSION] } }] });
        const writable = await handle.createWritable();
        await writable.write(json);
        await writable.close();
        markSaved(snapshot);
        setStatus(`Project saved as ${handle.name}.`);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return; // the dialog was cancelled
        setStatus(`Could not save the project: ${err instanceof Error ? err.message : String(err)}`);
      }
      return;
    }
    // No file handle: the browser takes the download and tells the page nothing more, so the project counts as saved once it is handed over.
    try {
      downloadBlob(new Blob([json], { type: PROJECT_MIME }), suggested);
    } catch (err) {
      setStatus(`Could not save the project: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    markSaved(snapshot);
    setStatus(`Download of ${suggested} started: check your downloads folder. This browser cannot confirm that the file was written.`);
  };

  saveRef.current = saveProject;

  const confirmDiscard = (what: string) =>
    !hasUnsavedChanges() || window.confirm(`The project has unsaved changes. ${what} will discard them.\n\nSave the project first if you want to keep them. Continue?`);

  const startNewProject = () => {
    if (!confirmDiscard('Starting a new project')) return;
    newProject();
    setRepairs(null);
  };

  // Open is asynchronous: the file is chosen, then read. What was confirmed is the project at the click, so an edit made after it
  // asks again, and an Open that a later Open overtook is dropped (two reads can finish in either order).
  const projectRef = useRef(project);
  projectRef.current = project;
  const openBase = useRef<Project | null>(null);
  const openToken = useRef(0);
  const openProject = async (file: File) => {
    const token = ++openToken.current;
    const base = openBase.current ?? projectRef.current;
    openBase.current = null;
    try {
      const { project: p, notes } = await readProjectFile(file);
      const decision = openDecision({ token, latest: openToken.current, base, present: projectRef.current });
      if (decision === 'drop') return;
      if (decision === 'ask' && !confirmDiscard('Opening this file')) {
        setStatus(`Opening ${file.name} was cancelled: the project was edited while the file was read.`);
        return;
      }
      replaceProject(p);
      setRepairs(notes.length > 0 ? { file: file.name, notes } : null);
      setStatus(openedStatus(file.name, notes));
    } catch (err) {
      // Refused: the project that was open stays as it is.
      setStatus(refusedStatus(file.name, err));
    }
  };

  const table = view.kind === 'table' ? project.dataTables.find((t) => t.id === view.id) : undefined;
  const chart = view.kind === 'chart' ? project.charts.find((c) => c.id === view.id) : undefined;
  // A graph and a page layout have an inspector, the right panel (a layout draws its own, into this one's place: see LayoutView).
  const hasInspector = chart !== undefined || view.kind === 'layout';
  // The zoom control belongs to the page on screen: the graph, the layout page or the data table.
  const onLayout = view.kind === 'layout';
  const onResults = view.kind === 'analysis';
  const activeZoom = chart ? zoom : onLayout ? layoutZoom : onResults ? resultsZoom : tableZoom;
  const setActiveZoom = chart ? setZoom : onLayout ? setLayoutZoom : onResults ? setResultsZoom : setTableZoom;
  // A graph and a layout page are not zoomed beyond 200%; a data table can be 400%.
  const maxZoom = chart || onLayout ? 2 : 4;
  // The chart draws the data sets that are on it, which may include some from other tables.
  const prepared = useMemo(() => (chart ? prepareChartInput(project, chart) : undefined), [project, chart]);

  // The menu bar and the shortcuts (appMenus.tsx): what is on screen, and how the shell answers.
  const analysis = view.kind === 'analysis' ? (project.analyses ?? []).find((a) => a.id === view.id) : undefined;
  const menuContext: MenuContext = {
    table,
    chart,
    analysis,
    onLayout,
    onFolder: view.kind === 'folder',
    highlight: (table ?? chart ?? analysis ?? (onLayout ? project.layouts?.find((l) => l.id === view.id) : undefined))?.highlight,
    itemNoun: table ? 'table' : chart ? 'graph' : onLayout ? 'layout' : analysis ? 'result' : null,
    tableCount: project.dataTables.length,
    hasInspector,
    canUndo,
    canRedo,
    navOpen,
    inspectorOpen,
    setNavOpen,
    setInspectorOpen,
    startNewProject,
    openProject: () => {
      if (!confirmDiscard('Opening another project')) return;
      openBase.current = projectRef.current;
      fileRef.current?.click();
    },
    saveProject: () => void saveProject(),
    undo,
    redo,
    run,
    setStatus,
    navigateInspector,
    openSettings: () => setSettingsOpen(true),
    openRecovery: () => setRecoveryOpen(true),
    openShortcuts: () => setShortcutsOpen(true),
    openAbout: () => setInfoOpen(true),
    zoomable: !!(chart || table || onLayout || onResults),
    resetZoom: () => {
      setActiveZoom(1);
      if (chart) requestFit();
    },
    fullscreen,
    toggleFullscreen: () => {
      // Some browsers (Safari on iPhone) have no full screen for a page: the method is missing, not refused.
      const p = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();
      (p ?? Promise.reject()).catch(() => setStatus('This browser did not allow full screen.'));
    },
  };
  shortcutRef.current = (a) => runShortcut(a, menuContext);
  const menus = buildMenus(menuContext);

  return (
    <div
      className="app"
      data-nav={navOpen ? 'open' : 'closed'}
      data-insp={hasInspector && inspectorOpen ? 'open' : 'closed'}
      data-head={headOpen ? 'open' : 'closed'}
      style={{ '--nav-w': navOpen ? `${navW}px` : '0px', '--insp-w': hasInspector && inspectorOpen ? `${inspW}px` : '0px', '--nav-px': `${navW}px`, '--insp-px': `${inspW}px` } as CSSProperties}
    >
      <img className={headOpen ? 'brand-logo' : 'brand-logo brand-logo-small'} src={`${import.meta.env.BASE_URL}logo.svg`} alt="" width={headOpen ? 56 : 22} height={headOpen ? 56 : 22} />
      <header className="topbar">
        <strong className="brand">OctavaPlot</strong>
        <span className="app-version" title={`OctavaPlot ${__APP_VERSION__}${__APP_COMMIT__ ? ` (build ${__APP_COMMIT__})` : ''}`}>v{__APP_VERSION__}</span>
      </header>
      <MenuBar menus={menus}>
        <span className="topbar-sep" />
        <label className="project-name-field" title="Project name: the suggested file name when saving">
          <span>Project</span>
          <input
            className="project-name"
            type="text"
            value={project.name}
            aria-label="Project name"
            onChange={(e) => run('Rename project', setProjectName(e.target.value), 'project:name')}
          />
        </label>
        <span
          className={recoveryText.warning ? 'save-state statusbar-warning' : 'save-state muted'}
          role={recoveryText.warning ? 'alert' : 'status'}
          title={recoveryText.text}
        >
          {recoveryText.text}
        </span>
        <input
          ref={fileRef}
          type="file"
          accept={PROJECT_EXTENSION}
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void openProject(f);
          }}
        />
      </MenuBar>
      <button
        className="icon-only head-toggle"
        onClick={toggleHead}
        aria-pressed={headOpen}
        aria-label={headOpen ? 'Hide the logo and app name' : 'Show the logo and app name'}
        title={headOpen ? 'Hide the logo and app name' : 'Show the logo and app name'}
      >
        <span aria-hidden="true">{headOpen ? '⌃' : '⌄'}</span>
      </button>
      <MemoNavigator />
      {navOpen && <Splitter side="nav" width={navW} min={180} max={480} onWidth={setNavW} label="Resize the navigation panel" />}
      {hasInspector && inspectorOpen && <Splitter side="insp" width={inspW} min={260} max={640} onWidth={setInspW} label="Resize the inspector" />}
      <main className="workspace">
        <Suspense fallback={<div className="empty">Loading…</div>}>
          {/* Keyed: the selection, the open dialog and the message of one table do not carry over to the next. */}
          {table && <DataTableView key={table.id} table={table} />}
          {chart && prepared && <GraphView prepared={prepared} />}
          {view.kind === 'analysis' && <AnalysisView analysisId={view.id} />}
          {view.kind === 'layout' && <LayoutView layoutId={view.id} />}
          {view.kind === 'folder' && <FolderView folder={view.id} />}
          {!table && !chart && view.kind !== 'analysis' && view.kind !== 'layout' && view.kind !== 'folder' && <div className="empty">Select an item in the navigator.</div>}
        </Suspense>
      </main>
      {chart && prepared && (
        <Suspense fallback={<aside className="inspector" aria-busy="true" />}>
          <Inspector key={chart.id} chart={chart} table={prepared.table} />
        </Suspense>
      )}
      <footer className="statusbar">
        <button
          className="icon-only"
          onClick={() => setNavOpen(!navOpen)}
          aria-pressed={navOpen}
          aria-label={navOpen ? 'Hide navigation panel' : 'Show navigation panel'}
          title={navOpen ? 'Hide navigation panel' : 'Show navigation panel'}
        >
          <PanelIcon side="left" />
        </button>
        <span className="statusbar-message" role="status">{status}</span>
        {repairs && <button className="icon-text" onClick={() => setRepairsOpen(true)} title="List every value that was reset, with its place in the file">Details ({repairs.notes.length})</button>}
        {(chart || table || onLayout || onResults) && (
          <span className="zoom">
            <button className="icon-btn" aria-label="Zoom out" onClick={() => setActiveZoom(Math.max(0.25, Math.round((activeZoom - 0.25) * 100) / 100))}>−</button>
            <WheelRange min={25} max={maxZoom * 100} step={5} value={Math.round(activeZoom * 100)} ariaLabel="Zoom" onValue={(v) => setActiveZoom(v / 100)} />
            <button className="icon-btn" aria-label="Zoom in" onClick={() => setActiveZoom(Math.min(maxZoom, Math.round((activeZoom + 0.25) * 100) / 100))}>+</button>
            <span className="zoom-pct">{Math.round(activeZoom * 100)}%</span>
            <button
              className="zoom-fit"
              onClick={() => {
                setActiveZoom(1);
                if (chart) requestFit();
              }}
              disabled={!chart && activeZoom === 1}
              title={chart ? 'Fit the graph to the window (100%)' : onLayout ? 'Fit the page to the window (100%)' : 'Back to 100%'}
              aria-label={chart ? 'Fit the graph to the window (100%)' : onLayout ? 'Fit the page to the window (100%)' : 'Back to 100%'}
            >
              <FitWindowIcon />
              100%
            </button>
          </span>
        )}
        <button
          className="icon-only"
          onClick={() => setInspectorOpen(!inspectorOpen)}
          aria-pressed={inspectorOpen}
          disabled={!hasInspector}
          aria-label={inspectorOpen ? 'Hide inspector' : 'Show inspector'}
          title={!hasInspector ? 'The inspector is available on a graph and a layout' : inspectorOpen ? 'Hide inspector' : 'Show inspector'}
        >
          <PanelIcon side="right" />
        </button>
      </footer>
      {infoOpen && <InfoDialog onClose={() => setInfoOpen(false)} />}
      {shortcutsOpen && <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />}
      {repairsOpen && repairs && <RepairNotesDialog fileName={repairs.file} notes={repairs.notes} onClose={() => setRepairsOpen(false)} />}
      {recoveryConflict && <RecoveryConflictBanner onKeep={keepThisTab} onLoad={() => window.confirm(LOAD_OTHER_TAB_WARNING) && loadOtherTab()} onSave={() => void saveProject()} />}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      {recoveryOpen && <RecoveryDialog onClose={() => setRecoveryOpen(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
