import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { prepareChartInput } from './model/table/preparedChart';
import { AppProvider, useApp } from './state/AppContext';
import { openedStatus, PROJECT_EXTENSION, PROJECT_MIME, projectToFileText, readProjectFile, refusedStatus } from './state/projectFile';
import { Navigator } from './ui/navigator/Navigator';
import { Splitter } from './ui/components/Splitter';
import { NewProjectIcon, OpenProjectIcon, InfoIcon, SaveProjectIcon, SettingsIcon, FitWindowIcon, ImportIcon, ExportIcon, FitCurveIcon, DeleteIcon, GRAPH_PAGE_ICONS, LAYOUT_PAGE_ICONS, ResetIcon, TableTypeIcon, AddColumnIcon, ExcludeIcon, IncludeIcon } from './ui/components/icons';
import { MenuBar, type MenuEntry, type MenuSpec } from './ui/components/MenuBar';
import { fireCommand } from './ui/components/appCommands';
import { shortcutOf, type ShortcutAction } from './ui/components/appShortcuts';
import { ShortcutsDialog } from './ui/dialogs/ShortcutsDialog';
import { LAYOUT_FORMAT_PAGES } from './ui/views/layoutPages';
import { ADD_COLUMN_LABEL, type TableAction } from './ui/views/tableMenu';
import { inspectorShapeOf, PAGES as INSPECTOR_PAGES } from './ui/inspector/common/nav';
import type { InspectorTarget } from './state/inspectorNav';
import { resetAllDataSets, setProjectName } from './state/commands';
import { InfoDialog } from './ui/dialogs/InfoDialog';
import { SettingsDialog } from './ui/dialogs/SettingsDialog';
import { RepairNotesDialog } from './ui/dialogs/RepairNotesDialog';
import { LOAD_OTHER_TAB_WARNING, RecoveryConflictBanner } from './ui/components/RecoveryConflictBanner';
import { WheelRange } from './ui/components/WheelRange';
import { isTextEntryTarget } from './ui/components/shortcutGuard';
import { isSaveShortcut } from './ui/components/saveShortcut';
import { downloadBlob } from './util/download';
import { exportFileName } from './util/fileName';

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
  const { project, view, run, undo, redo, replaceProject, newProject, hasUnsavedChanges, markSaved, status, setStatus, recoveryText, recoveryConflict, keepThisTab, loadOtherTab, zoom, setZoom, tableZoom, setTableZoom, resultsZoom, setResultsZoom, layoutZoom, setLayoutZoom, settings, requestFit, inspectorNav, navigateInspector, canUndo, canRedo } = useApp();
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
      const typing = isTextEntryTarget(e.target);
      if (!document.querySelector('.modal-backdrop')) {
        const action = shortcutOf(e, typing);
        if (action && shortcutRef.current(action)) {
          e.preventDefault();
          return;
        }
      }
      if (typing) return;
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

  // ---- The menu bar. Each item either acts here or fires a command that the view owning the thing listens for (see appCommands.ts).
  const analysis = view.kind === 'analysis' ? (project.analyses ?? []).find((a) => a.id === view.id) : undefined;
  const itemNoun = table ? 'table' : chart ? 'graph' : onLayout ? 'layout' : analysis ? 'result' : null;
  const canEditPage = chart !== undefined || onLayout;
  const showInspector = () => setInspectorOpen(true);
  const askUndo = canUndo ? undefined : 'Nothing to undo';
  const item = (label: string, onSelect: () => void, more: Partial<Extract<MenuEntry, { label: string; onSelect: () => void }>> = {}): MenuEntry => ({ label, onSelect, ...more });
  /** Groups of items with a line between them. */
  const grouped = (...lists: MenuEntry[][]): MenuEntry[] => lists.filter((l) => l.length > 0).flatMap((l, i) => (i === 0 ? l : [sep, ...l]));
  const sep: MenuEntry = { kind: 'separator' };

  // Format in a table: the buttons of the table's toolbar (the toolbar keeps them too).
  const act = (a: TableAction) => () => fireCommand('table-action', a);
  const tableEntries: MenuEntry[] = table
    ? grouped(
        [
        item('Table type…', act('type'), { icon: <TableTypeIcon />, title: 'Change the type of this table, or how its series are entered' }),
        item(ADD_COLUMN_LABEL[table.kind], act('add-column'), { icon: <AddColumnIcon /> }),
        ],
        [
        item('Insert row above', act('row-above'), { shortcut: 'Alt+Shift+↑' }),
        item('Insert row below', act('row-below'), { shortcut: 'Alt+Shift+↓' }),
        item('Duplicate selected rows', act('row-duplicate'), { shortcut: 'Alt+Shift+D' }),
        item('Delete selected rows', act('row-delete'), { shortcut: 'Alt+Delete' }),
        item('Append 1000 rows', act('rows-1000')),
        item('Append rows…', act('rows-append')),
        item('Fill series…', act('fill-series'), { title: 'Fill the selected cells with start, start + step, start + 2 step ...' }),
        ],
        [
        item('Exclude', act('exclude'), { icon: <ExcludeIcon />, title: 'Keep the selected values in the table but leave them out of every chart and calculation' }),
        item('Include', act('include'), { icon: <IncludeIcon />, title: 'Use the selected values again' }),
        ...(table.kind === 'xy' ? [item('X type…', act('x-type'), { title: 'Say that the X column holds dates, times or durations' })] : []),
        ...(table.kind === 'grouped' ? [item('Factor…', act('factor'), { title: 'Name the second grouping level of the selected series' })] : []),
        ],
      )
    : [];

  const formatEntries: MenuEntry[] = chart
    ? (() => {
        const shape = inspectorShapeOf(chart.type);
        const pageItems = shape.pages
          .filter((id) => id !== 'export')
          .map((id): { many: boolean; entries: MenuEntry[] } => {
            const page = INSPECTOR_PAGES.find((p) => p.id === id);
            if (!page) return { many: false, entries: [] };
            const parts = page.parts.filter((p) => !shape.lacks.includes(p.id));
            const Icon = GRAPH_PAGE_ICONS[id];
            const go = (part?: InspectorTarget['part']) => () => {
              navigateInspector({ page: id, part });
              showInspector();
            };
            return parts.length > 1 ? { many: true, entries: parts.map((p) => item(`${page.label}: ${p.label}`, go(p.id), { icon: <Icon /> })) } : { many: false, entries: [item(page.label, go(parts[0]?.id), { title: page.title, icon: <Icon /> })] };
          });
        // A page with several tabs is a group of its own; the pages with one setting are listed together.
        const lists: MenuEntry[][] = [];
        pageItems.forEach((p, i) => (p.many || i === 0 || pageItems[i - 1].many ? lists.push(p.entries) : lists[lists.length - 1].push(...p.entries)));
        return grouped(...lists);
      })()
    : onLayout
      ? LAYOUT_FORMAT_PAGES.map((p) => {
          const Icon = LAYOUT_PAGE_ICONS[p.id];
          return item(
            p.label,
            () => {
              fireCommand('layout-page', p.id);
              showInspector();
            },
            { icon: <Icon /> },
          );
        })
      : table
        ? tableEntries
        : [];

  const openProjectDialog = () => confirmDiscard('Opening another project') && fileRef.current?.click();
  const exportHere = () => {
    if (chart) navigateInspector({ page: 'export' });
    else if (onLayout) fireCommand('layout-page', 'export');
    else return;
    showInspector();
  };
  shortcutRef.current = (a) => {
    if (a === 'new') startNewProject();
    else if (a === 'open') openProjectDialog();
    else if (a === 'export') {
      if (!canEditPage) return false;
      exportHere();
    } else if (a === 'settings') setSettingsOpen(true);
    else if (a === 'shortcuts') setShortcutsOpen(true);
    else if (a === 'navigator') setNavOpen(!navOpen);
    else if (a === 'inspector') {
      if (!hasInspector) return false;
      setInspectorOpen(!inspectorOpen);
    } else if (a === 'duplicate') {
      if (!itemNoun) return false;
      fireCommand('duplicate-item');
    } else if (a === 'rename') {
      if (!itemNoun) return false;
      setNavOpen(true);
      fireCommand('rename-item');
    }
    return true;
  };

  const menus: MenuSpec[] = [
    {
      label: 'File',
      entries: [
        item('New project', startNewProject, { shortcut: 'Ctrl+Alt+N', icon: <NewProjectIcon /> }),
        item('Open project…', openProjectDialog, { shortcut: 'Ctrl+O', icon: <OpenProjectIcon /> }),
        item('Save project', () => void saveProject(), { shortcut: 'Ctrl+S', icon: <SaveProjectIcon />, title: 'Save the project to a file (you choose the name)' }),
        ...(chart
          ? [sep, item('Export figure…', exportHere, { shortcut: 'Ctrl+E', icon: <ExportIcon />, title: 'Export this graph as a picture or a vector file' })]
          : onLayout
            ? [sep, item('Export layout…', exportHere, { shortcut: 'Ctrl+E', icon: <ExportIcon />, title: 'Export this page as a picture or a vector file' })]
            : []),
        sep,
        item('Settings…', () => setSettingsOpen(true), { shortcut: 'Ctrl+,', icon: <SettingsIcon /> }),
      ],
    },
    {
      label: 'Edit',
      entries: [
        item('Undo', undo, { shortcut: 'Ctrl+Z', disabled: !canUndo, title: askUndo }),
        item('Redo', redo, { shortcut: 'Ctrl+Y', disabled: !canRedo, title: canRedo ? undefined : 'Nothing to redo' }),
        sep,
        item('New data table…', () => { setNavOpen(true); fireCommand('new-table'); }),
        item(`Duplicate ${itemNoun ?? 'item'}`, () => fireCommand('duplicate-item'), { shortcut: 'Ctrl+Shift+D', hidden: !itemNoun, title: 'Make a copy of the item on screen' }),
        item(`Rename ${itemNoun ?? 'item'}`, () => { setNavOpen(true); fireCommand('rename-item'); }, { shortcut: 'F2', hidden: !itemNoun, title: 'Rename the item on screen' }),
        item(`Delete ${itemNoun ?? 'item'}`, () => fireCommand('delete-item'), { icon: <DeleteIcon />, hidden: !itemNoun, disabled: table !== undefined && project.dataTables.length <= 1, title: table ? (project.dataTables.length <= 1 ? 'The last table cannot be deleted' : 'Delete this table and the graphs and results that use it (can be undone)') : 'Delete this item (can be undone)' }),
        sep,
        item('Import CSV…', () => fireCommand('import-csv'), { icon: <ImportIcon />, hidden: !table }),
        item('Export CSV', () => fireCommand('export-csv'), { icon: <ExportIcon />, hidden: !table && !analysis }),
        item('Copy results', () => fireCommand('copy-results'), { hidden: !analysis, title: 'Copy the selected cells, or all the results, as tab-separated text' }),
        item('Reset graph settings', () => { if (!chart) return; run('Reset settings', resetAllDataSets(chart.id)); setStatus('Settings reset to defaults.'); }, { icon: <ResetIcon />, hidden: !chart, title: "Reset the whole graph to a new graph's settings: data set styles, axes, grid, legend, fonts, colours, size. Kept: the title and axis titles, which data sets are shown and their order, annotations and the chosen fit. Reference lines are removed. Undo restores everything." }),
      ],
    },
    {
      label: 'View',
      entries: [
        item('Navigator', () => setNavOpen(!navOpen), { shortcut: 'Ctrl+B', checked: navOpen, title: navOpen ? 'Hide the navigation panel' : 'Show the navigation panel' }),
        item('Formatting panel', () => setInspectorOpen(!inspectorOpen), { shortcut: 'Ctrl+Alt+B', checked: hasInspector && inspectorOpen, hidden: !hasInspector }),
      ],
    },
    {
      label: 'Analyze',
      entries: [
        item('New analysis…', () => { setNavOpen(true); fireCommand('new-analysis'); }),
        item('Fit curve', () => fireCommand('fit-curve'), { icon: <FitCurveIcon />, hidden: table?.kind !== 'xy', title: 'A line, a curve or a dose-response model for the Y series' }),
        item('Make graph from curve fit', () => fireCommand('make-graph'), { hidden: analysis?.kind !== 'curvefit' }),
      ],
    },
    { label: 'Format', entries: formatEntries, disabled: formatEntries.length === 0, title: 'Nothing to format here: open a table, a graph or a layout' },
    {
      label: 'Help',
      entries: [
        item('OctavaPlot on GitHub', () => window.open('https://github.com/itrus/OctavaPlot', '_blank', 'noopener,noreferrer'), { title: 'The code, the issue tracker and the releases' }),
        item('Keyboard shortcuts…', () => setShortcutsOpen(true), { shortcut: 'Ctrl+/', title: 'Every key of the app' }),
        item('About OctavaPlot…', () => setInfoOpen(true), { icon: <InfoIcon />, title: 'About OctavaPlot and credits' }),
      ],
    },
  ];

  return (
    <div
      className="app"
      data-nav={navOpen ? 'open' : 'closed'}
      data-insp={hasInspector && inspectorOpen ? 'open' : 'closed'}
      style={{ '--nav-w': navOpen ? `${navW}px` : '0px', '--insp-w': hasInspector && inspectorOpen ? `${inspW}px` : '0px', '--nav-px': `${navW}px`, '--insp-px': `${inspW}px` } as CSSProperties}
    >
      <header className="topbar">
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
      </header>
      <MenuBar menus={menus} />
      <Navigator />
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
