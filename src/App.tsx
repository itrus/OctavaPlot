import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { effectiveTable } from './model/chartTable';
import { AppProvider, useApp } from './state/AppContext';
import { parseProjectWithNotes, stringifyProject } from './state/serialize';
import { Navigator } from './ui/Navigator';
import { NewProjectIcon, OpenProjectIcon, SaveProjectIcon, SettingsIcon } from './ui/icons';
import { SettingsDialog } from './ui/SettingsDialog';
import { WheelRange } from './ui/WheelRange';
import { isTextEntryTarget } from './ui/shortcutGuard';
import { downloadBlob, exportFileName } from './util/download';

// Each workspace view is its own chunk, loaded when first opened.
const DataTableView = lazy(() => import('./ui/DataTableView').then((m) => ({ default: m.DataTableView })));
const GraphView = lazy(() => import('./ui/GraphView').then((m) => ({ default: m.GraphView })));
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
  const { project, view, undo, redo, replaceProject, newProject, hasUnsavedChanges, markSaved, status, setStatus, zoom, setZoom, tableZoom, setTableZoom, settings, requestFit, inspectorNav } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  // Panels are only hidden (never unmounted), so their selections and edits survive a collapse.
  const [navOpen, setNavOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Clicking a chart element brings up its settings, even when the inspector was collapsed.
  useEffect(() => {
    if (inspectorNav.n > 0) setInspectorOpen(true);
  }, [inspectorNav.n]);

  // Global undo/redo, except while typing in a text field (native text undo applies there).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || isTextEntryTarget(e.target)) return;
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

  const saveProject = () => {
    downloadBlob(new Blob([stringifyProject(project)], { type: 'application/json' }), exportFileName(project.name, 'json', settings.timestampExports));
    markSaved();
    setStatus('Project saved to a JSON file.');
  };

  const confirmDiscard = (what: string) =>
    !hasUnsavedChanges() || window.confirm(`The project has unsaved changes. ${what} will discard them.\n\nSave the project first if you want to keep them. Continue?`);

  const startNewProject = () => {
    if (confirmDiscard('Starting a new project')) newProject();
  };

  const openProject = async (file: File) => {
    try {
      const { project: p, notes } = parseProjectWithNotes(await file.text());
      replaceProject(p);
      setStatus(
        notes.length === 0
          ? `Opened ${file.name}.`
          : `Opened ${file.name}. ${notes.length} stored value${notes.length === 1 ? ' was' : 's were'} reset to defaults: ${notes[0]}`,
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
  };

  const table = view.kind === 'table' ? project.dataTables.find((t) => t.id === view.id) : undefined;
  const chart = view.kind === 'chart' ? project.charts.find((c) => c.id === view.id) : undefined;
  // The zoom control belongs to the page on screen: the graph or the data table.
  const activeZoom = chart ? zoom : tableZoom;
  const setActiveZoom = chart ? setZoom : setTableZoom;
  // The chart draws the data sets that are on it, which may include some from other tables.
  const chartTable = useMemo(() => (chart ? effectiveTable(project, chart) : undefined), [project, chart]);

  return (
    <div
      className="app"
      data-nav={navOpen ? 'open' : 'closed'}
      data-insp={chart && inspectorOpen ? 'open' : 'closed'}
      style={{ '--nav-w': navOpen ? '250px' : '0px', '--insp-w': chart && inspectorOpen ? '360px' : '0px' } as CSSProperties}
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
        <span className="topbar-sep" />
        <button className="icon-text" onClick={startNewProject}><NewProjectIcon /> New Project</button>
        <button className="icon-text" onClick={() => confirmDiscard('Opening another project') && fileRef.current?.click()}><OpenProjectIcon /> Open Project</button>
        <button className="icon-text" onClick={saveProject}><SaveProjectIcon /> Save Project</button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void openProject(f);
          }}
        />
        <span className="topbar-sep" />
        <button className="icon-text" onClick={() => setSettingsOpen(true)}><SettingsIcon /> Settings</button>
        <button
          className="icon-only topbar-end"
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
      <main className="workspace">
        <Suspense fallback={<div className="empty">Loading…</div>}>
          {table && <DataTableView table={table} />}
          {chart && chartTable && <GraphView chart={chart} table={chartTable} />}
          {!table && !chart && <div className="empty">Select an item in the navigator.</div>}
        </Suspense>
      </main>
      {chart && chartTable && (
        <Suspense fallback={<aside className="inspector" aria-busy="true" />}>
          <Inspector chart={chart} table={chartTable} />
        </Suspense>
      )}
      <footer className="statusbar">
        <span className="statusbar-message" role="status">{status}</span>
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
