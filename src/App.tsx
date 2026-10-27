import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { prepareChartInput } from './model/table/preparedChart';
import { AppProvider, useApp } from './state/AppContext';
import { PROJECT_EXTENSION, PROJECT_MIME, projectToFileText, readProjectFile } from './state/projectFile';
import { Navigator } from './ui/navigator/Navigator';
import { Splitter } from './ui/components/Splitter';
import { NewProjectIcon, OpenProjectIcon, InfoIcon, SaveProjectIcon, SettingsIcon } from './ui/components/icons';
import { setProjectName } from './state/commands';
import { InfoDialog } from './ui/dialogs/InfoDialog';
import { SettingsDialog } from './ui/dialogs/SettingsDialog';
import { RepairNotesDialog } from './ui/dialogs/RepairNotesDialog';
import { LOAD_OTHER_TAB_WARNING, RecoveryConflictBanner } from './ui/components/RecoveryConflictBanner';
import { openedStatus, refusedStatus } from './state/openStatus';
import { UndoRedo } from './ui/components/UndoRedo';
import { WheelRange } from './ui/components/WheelRange';
import { isTextEntryTarget } from './ui/components/shortcutGuard';
import { isSaveShortcut } from './ui/components/saveShortcut';
import { downloadBlob, exportFileName } from './util/download';

/** The browser's save-file dialog (File System Access API; not in every browser). */
type SaveFilePicker = (options: {
  suggestedName: string;
  types: Array<{ description: string; accept: Record<string, string[]> }>;
}) => Promise<{ name: string; createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }> }>;

// Each workspace view is its own chunk, loaded when first opened.
const DataTableView = lazy(() => import('./ui/views/DataTableView').then((m) => ({ default: m.DataTableView })));
const AnalysisView = lazy(() => import('./ui/views/AnalysisView').then((m) => ({ default: m.AnalysisView })));
const LayoutView = lazy(() => import('./ui/views/LayoutView').then((m) => ({ default: m.LayoutView })));
const FolderView = lazy(() => import('./ui/views/FolderView').then((m) => ({ default: m.FolderView })));
const GraphView = lazy(() => import('./ui/views/GraphView').then((m) => ({ default: m.GraphView })));
const Inspector = lazy(() => import('./ui/inspector/Inspector').then((m) => ({ default: m.Inspector })));

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
  const { project, view, run, undo, redo, replaceProject, newProject, hasUnsavedChanges, markSaved, status, setStatus, recoveryText, recoveryConflict, keepThisTab, loadOtherTab, zoom, setZoom, tableZoom, setTableZoom, settings, requestFit, inspectorNav } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  // Panels are only hidden (never unmounted), so their selections and edits survive a collapse.
  const [navOpen, setNavOpen] = useState(true);
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
  // What was reset when the last file was opened: all of it, with the paths, is behind the Details button.
  const [repairs, setRepairs] = useState<{ file: string; notes: string[] } | null>(null);
  const [repairsOpen, setRepairsOpen] = useState(false);
  // Clicking a chart element brings up its settings, even when the inspector was collapsed.
  useEffect(() => {
    if (inspectorNav.n > 0) setInspectorOpen(true);
  }, [inspectorNav.n]);

  // The key handler runs the Save Project of the latest render.
  const saveRef = useRef<() => Promise<void>>(async () => {});

  // Global Ctrl/Cmd+S, and undo/redo except while typing in a text field (native text undo applies there).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      // Saving is not a text-editing key, so it works in a cell editor or any input too. The browser's own "Save page" never opens.
      if (isSaveShortcut(e)) {
        e.preventDefault();
        if (!e.repeat && !document.querySelector('.modal-backdrop')) void saveRef.current();
        return;
      }
      if (isTextEntryTarget(e.target)) return;
      if (document.querySelector('.modal-backdrop')) return; // a dialog is open: its shortcuts are not the project's
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const saveProject = async () => {
    // What is written is this snapshot: edits made while the file is being written stay unsaved.
    const snapshot = project;
    const json = projectToFileText(snapshot);
    const suggested = exportFileName(project.name, PROJECT_EXTENSION.slice(1), settings.timestampExports);
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
    downloadBlob(new Blob([json], { type: PROJECT_MIME }), suggested);
    markSaved(snapshot);
    setStatus(`Project saved to ${suggested}.`);
  };

  saveRef.current = saveProject;

  const confirmDiscard = (what: string) =>
    !hasUnsavedChanges() || window.confirm(`The project has unsaved changes. ${what} will discard them.\n\nSave the project first if you want to keep them. Continue?`);

  const startNewProject = () => {
    if (!confirmDiscard('Starting a new project')) return;
    newProject();
    setRepairs(null);
  };

  const openProject = async (file: File) => {
    try {
      const { project: p, notes } = await readProjectFile(file);
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
  // The zoom control belongs to the page on screen: the graph or the data table.
  const activeZoom = chart ? zoom : tableZoom;
  const setActiveZoom = chart ? setZoom : setTableZoom;
  // The chart draws the data sets that are on it, which may include some from other tables.
  const prepared = useMemo(() => (chart ? prepareChartInput(project, chart) : undefined), [project, chart]);

  return (
    <div
      className="app"
      data-nav={navOpen ? 'open' : 'closed'}
      data-insp={chart && inspectorOpen ? 'open' : 'closed'}
      style={{ '--nav-w': navOpen ? `${navW}px` : '0px', '--insp-w': chart && inspectorOpen ? `${inspW}px` : '0px', '--nav-px': `${navW}px`, '--insp-px': `${inspW}px` } as CSSProperties}
    >
      <header className="topbar">
        <button
          className="icon-only"
          onClick={() => setNavOpen(!navOpen)}
          aria-pressed={navOpen}
          aria-label={navOpen ? 'Hide navigation panel' : 'Show navigation panel'}
          title={navOpen ? 'Hide navigation panel' : 'Show navigation panel'}
        >
          <PanelIcon side="left" />
        </button>
        <img className="brand-logo" src={`${import.meta.env.BASE_URL}logo.svg`} alt="" width={24} height={24} />
        <strong className="brand">OctavaPlot</strong>
        <span className="app-version" title={`OctavaPlot ${__APP_VERSION__}${__APP_COMMIT__ ? ` (build ${__APP_COMMIT__})` : ''}`}>v{__APP_VERSION__}</span>
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
        <button className="icon-text topbar-late" onClick={startNewProject}><NewProjectIcon /> New Project</button>
        <button className="icon-text topbar-late" onClick={() => confirmDiscard('Opening another project') && fileRef.current?.click()}><OpenProjectIcon /> Open Project</button>
        <button className="icon-text" onClick={() => void saveProject()} title="Save the project to a file (you choose the name)"><SaveProjectIcon /> Save Project</button>
        <span className="topbar-sep" />
        <UndoRedo labeled />
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
        <button className="icon-text topbar-end" onClick={() => setSettingsOpen(true)}><SettingsIcon /> Settings</button>
        <button className="icon-text topbar-late" onClick={() => setInfoOpen(true)} title="About OctavaPlot and credits"><InfoIcon /> Info</button>
        <button
          className="icon-only"
          onClick={() => setInspectorOpen(!inspectorOpen)}
          aria-pressed={inspectorOpen}
          disabled={!chart}
          aria-label={inspectorOpen ? 'Hide inspector' : 'Show inspector'}
          title={!chart ? 'The inspector is available on a graph' : inspectorOpen ? 'Hide inspector' : 'Show inspector'}
        >
          <PanelIcon side="right" />
        </button>
      </header>
      <Navigator />
      {navOpen && <Splitter side="nav" width={navW} min={180} max={480} onWidth={setNavW} label="Resize the navigation panel" />}
      {chart && inspectorOpen && <Splitter side="insp" width={inspW} min={260} max={640} onWidth={setInspW} label="Resize the inspector" />}
      <main className="workspace">
        <Suspense fallback={<div className="empty">Loading…</div>}>
          {table && <DataTableView table={table} />}
          {chart && prepared && <GraphView prepared={prepared} />}
          {view.kind === 'analysis' && <AnalysisView analysisId={view.id} />}
          {view.kind === 'layout' && <LayoutView layoutId={view.id} />}
          {view.kind === 'folder' && <FolderView folder={view.id} />}
          {!table && !chart && view.kind !== 'analysis' && view.kind !== 'layout' && view.kind !== 'folder' && <div className="empty">Select an item in the navigator.</div>}
        </Suspense>
      </main>
      {chart && prepared && (
        <Suspense fallback={<aside className="inspector" aria-busy="true" />}>
          <Inspector chart={chart} table={prepared.table} />
        </Suspense>
      )}
      <footer className="statusbar">
        <span className="statusbar-message" role="status">{status}</span>
        {repairs && <button className="icon-text" onClick={() => setRepairsOpen(true)} title="List every value that was reset, with its place in the file">Details ({repairs.notes.length})</button>}
        {recoveryText.text !== '' && <span className={recoveryText.warning ? 'statusbar-warning' : 'muted'} role={recoveryText.warning ? 'alert' : 'status'} style={recoveryText.warning ? undefined : { whiteSpace: 'nowrap' }}>{recoveryText.text}</span>}
        {(chart || table) && (
          <span className="zoom">
            <button className="icon-btn" aria-label="Zoom out" onClick={() => setActiveZoom(Math.max(0.25, Math.round((activeZoom - 0.25) * 100) / 100))}>−</button>
            <WheelRange min={25} max={400} step={5} value={Math.round(activeZoom * 100)} ariaLabel="Zoom" onValue={(v) => setActiveZoom(v / 100)} />
            <button className="icon-btn" aria-label="Zoom in" onClick={() => setActiveZoom(Math.min(4, Math.round((activeZoom + 0.25) * 100) / 100))}>+</button>
            <span className="zoom-pct">{Math.round(activeZoom * 100)}%</span>
            <button
              className="zoom-fit"
              onClick={() => {
                setActiveZoom(1);
                if (chart) requestFit();
              }}
              disabled={!chart && activeZoom === 1}
              title="Fit to the window (100%)"
            >
              Fit
            </button>
          </span>
        )}
      </footer>
      {infoOpen && <InfoDialog onClose={() => setInfoOpen(false)} />}
      {repairsOpen && repairs && <RepairNotesDialog fileName={repairs.file} notes={repairs.notes} onClose={() => setRepairsOpen(false)} />}
      {recoveryConflict && <RecoveryConflictBanner onKeep={keepThisTab} onLoad={() => window.confirm(LOAD_OTHER_TAB_WARNING) && loadOtherTab()} onSave={() => void saveProject()} />}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
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
