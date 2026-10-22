import { lazy, Suspense, useEffect, useRef } from 'react';
import { AppProvider, useApp } from './state/AppContext';
import { parseProjectWithNotes, stringifyProject } from './state/serialize';
import { Navigator } from './ui/Navigator';
import { isTextEntryTarget } from './ui/shortcutGuard';
import { downloadBlob, safeFileName } from './util/download';

// Each workspace view is its own chunk, loaded when first opened.
const DataTableView = lazy(() => import('./ui/DataTableView').then((m) => ({ default: m.DataTableView })));
const GraphView = lazy(() => import('./ui/GraphView').then((m) => ({ default: m.GraphView })));
const Inspector = lazy(() => import('./ui/inspector/Inspector').then((m) => ({ default: m.Inspector })));

function Shell() {
  const { project, view, setView, undo, redo, canUndo, canRedo, replaceProject, status, setStatus, autosaveOk, zoom, setZoom } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);

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
    downloadBlob(new Blob([stringifyProject(project)], { type: 'application/json' }), `${safeFileName(project.name)}.json`);
    setStatus('Project saved to a JSON file.');
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
  const chartTable = chart ? project.dataTables.find((t) => t.id === chart.dataTableId) : undefined;

  return (
    <div className={`app${chart ? ' with-inspector' : ''}`}>
      <header className="topbar">
        <strong className="brand">OctavaPlot</strong>
        <span className="topbar-sep" />
        <button onClick={saveProject}>Save project</button>
        <button onClick={() => fileRef.current?.click()}>Open project…</button>
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
        <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">Undo</button>
        <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)">Redo</button>
        <span className={`autosave${autosaveOk ? '' : ' bad'}`}>{autosaveOk ? 'Autosave on' : 'Autosave unavailable'}</span>
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
        <select
          className="sheet-select"
          aria-label="Current sheet"
          value={`${view.kind}:${view.id}`}
          onChange={(e) => {
            const [kind, id] = e.target.value.split(':');
            setView({ kind: kind === 'chart' ? 'chart' : 'table', id });
          }}
        >
          <optgroup label="Data Tables">
            {project.dataTables.map((t) => (
              <option key={t.id} value={`table:${t.id}`}>{t.name}</option>
            ))}
          </optgroup>
          <optgroup label="Graphs">
            {project.charts.map((c) => (
              <option key={c.id} value={`chart:${c.id}`}>{c.name}</option>
            ))}
          </optgroup>
        </select>
        <span className="statusbar-message" role="status">{status}</span>
        {chart && (
          <span className="zoom">
            <button className="icon-btn" aria-label="Zoom out" onClick={() => setZoom(Math.max(0.25, Math.round((zoom - 0.25) * 100) / 100))}>−</button>
            <input
              type="range"
              min={25}
              max={400}
              step={5}
              value={Math.round(zoom * 100)}
              aria-label="Zoom"
              onChange={(e) => setZoom(Number(e.target.value) / 100)}
            />
            <button className="icon-btn" aria-label="Zoom in" onClick={() => setZoom(Math.min(4, Math.round((zoom + 0.25) * 100) / 100))}>+</button>
            <span className="zoom-pct">{Math.round(zoom * 100)}%</span>
          </span>
        )}
      </footer>
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
