import { useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { newId } from '../../model/ids';
import { chartBadge, TABLE_BADGE, type Badge } from '../../model/graph/badges';
import { FOLDER_TITLE } from '../../model/project/folderItems';
import type { AnalysisKind, ChartType, FolderKey, Id, TableKind, ViewRef } from '../../model/types';
import type { ChartVariant } from '../../model/graph/chartVariant';
import { useApp } from '../../state/AppContext';
import { addAnalysis, addChart, addChartLike, addDataTable, addLayout, duplicateAnalysis, duplicateChart, duplicateLayout, duplicateTable, removeChart, removeLayout, removeTable, renameItem, removeAnalysis, type NewTableOptions } from '../../state/commands';
import { DeleteIcon } from '../components/icons';
import { navFold, navStep } from './navKeys';
import { NewAnalysisDialog } from '../dialogs/NewAnalysisDialog';
import { NewLayoutDialog, type NewLayoutOptions } from '../dialogs/NewLayoutDialog';
import { NewGraphDialog } from '../dialogs/NewGraphDialog';
import { analysesOf } from '../../model/project/analysis';
import { NewTableDialog } from '../dialogs/NewTableDialog';

const sameView = (a: ViewRef, b: ViewRef) => a.kind === b.kind && a.id === b.id;

/** Sections that are not finished yet: shown with a lock and not reachable. */
const LOCKED_SECTIONS: readonly string[] = [];

export function Navigator() {
  const [renaming, setRenaming] = useState<string | null>(null);
  const { project, view, setView, run, settings, setStatus } = useApp();
  const [open, setOpen] = useState<Record<FolderKey, boolean>>({ tables: true, results: true, graphs: true, layouts: true });

  const currentTableId =
    view.kind === 'table' ? view.id : project.charts.find((c) => c.id === view.id)?.dataTableId;

  // The items tied to the one on screen are shown in bold: a table with its graphs, results and layouts, and back.
  const related = new Set<Id>();
  if (view.kind !== 'folder') {
    const layouts = project.layouts ?? [];
    const addTable = (tableId: Id) => {
      related.add(tableId);
      project.charts.filter((c) => c.dataTableId === tableId).forEach((c) => related.add(c.id));
      (project.analyses ?? []).filter((a) => a.dataTableId === tableId).forEach((a) => related.add(a.id));
    };
    if (view.kind === 'table') addTable(view.id);
    else if (view.kind === 'analysis') {
      const tableId = (project.analyses ?? []).find((a) => a.id === view.id)?.dataTableId;
      if (tableId) related.add(tableId);
    } else if (view.kind === 'chart') {
      if (currentTableId) related.add(currentTableId);
    } else {
      layouts.find((l) => l.id === view.id)?.panels.forEach((p) => {
        if (!p) return;
        related.add(p);
        const tableId = project.charts.find((c) => c.id === p)?.dataTableId;
        if (tableId) related.add(tableId);
      });
    }
    // Layouts holding any graph that is on screen or shown with a selected table.
    const graphs = new Set(project.charts.filter((c) => related.has(c.id) || (view.kind === 'chart' && c.id === view.id)).map((c) => c.id));
    layouts.forEach((l) => l.panels.some((p) => p && graphs.has(p)) && related.add(l.id));
  }

  // New items are made in two clear steps: the type of table first, then a chart type that suits that table.
  const [dialog, setDialog] = useState<'table' | 'graph' | 'analysis' | 'layout' | null>(null);
  const createLayout = (options: NewLayoutOptions, fillFrom?: Id) => {
    const id = newId('layout');
    run('New layout', addLayout(id, options, fillFrom));
    setView({ kind: 'layout', id });
    setDialog(null);
  };
  const createAnalysis = (tableId: Id, kind: AnalysisKind) => {
    const id = newId('analysis');
    run('New analysis', addAnalysis(id, tableId, kind));
    setView({ kind: 'analysis', id });
    setDialog(null);
  };
  const createTable = (kind: TableKind, options: NewTableOptions) => {
    const id = newId('table');
    run(`New ${kind} table`, addDataTable(id, kind, options));
    setView({ kind: 'table', id });
    setDialog(null);
  };
  const createGraphLike = (tableId: Id, sourceChartId: Id, linked: boolean) => {
    const id = newId('chart');
    run('New graph like another', addChartLike(id, tableId, sourceChartId, linked));
    setView({ kind: 'chart', id });
    setDialog(null);
  };
  const createGraph = (tableId: Id, type: ChartType, variant?: ChartVariant) => {
    const id = newId('chart');
    run('New graph', addChart(id, tableId, { widthPx: settings.defaultChartWidthPx, heightPx: settings.defaultChartHeightPx }, type, variant));
    setView({ kind: 'chart', id });
    setDialog(null);
  };

  // Duplicate and delete act on the item on screen; both can be undone.
  const current = view.kind === 'table' ? project.dataTables.find((t) => t.id === view.id) : view.kind === 'chart' ? project.charts.find((c) => c.id === view.id) : view.kind === 'layout' ? (project.layouts ?? []).find((l) => l.id === view.id) : (project.analyses ?? []).find((a) => a.id === view.id);
  const duplicateCurrent = () => {
    if (!current) return;
    if (view.kind === 'table') {
      const id = newId('table');
      run('Duplicate table', duplicateTable(view.id, id));
      setView({ kind: 'table', id });
    } else if (view.kind === 'chart') {
      const id = newId('chart');
      run('Duplicate graph', duplicateChart(view.id, id));
      setView({ kind: 'chart', id });
    } else if (view.kind === 'layout') {
      const id = newId('layout');
      run('Duplicate layout', duplicateLayout(view.id, id));
      setView({ kind: 'layout', id });
    } else {
      const id = newId('analysis');
      run('Duplicate analysis', duplicateAnalysis(view.id, id));
      setView({ kind: 'analysis', id });
    }
    setStatus(`Duplicated ${current.name}.`);
  };
  const deleteCurrent = () => {
    if (!current) return;
    if (view.kind === 'table') {
      if (project.dataTables.length <= 1) return;
      const graphs = project.charts.filter((c) => c.dataTableId === view.id).length;
      const results = (project.analyses ?? []).filter((a) => a.dataTableId === view.id).length;
      run('Delete table', removeTable(view.id));
      setStatus(`Deleted ${current.name}${graphs + results > 0 ? ` with ${graphs} graph${graphs === 1 ? '' : 's'} and ${results} result${results === 1 ? '' : 's'} that used it` : ''}. Undo (Ctrl+Z) restores it.`);
    } else if (view.kind === 'chart') {
      run('Delete graph', removeChart(view.id));
      setStatus(`Deleted ${current.name}. Undo (Ctrl+Z) restores it.`);
    } else if (view.kind === 'layout') {
      run('Delete layout', removeLayout(view.id));
      setStatus(`Deleted ${current.name}. Undo (Ctrl+Z) restores it.`);
    } else {
      run('Delete analysis', removeAnalysis(view.id));
      setStatus(`Deleted ${current.name}. Undo (Ctrl+Z) restores it.`);
    }
  };

  // The triangle folds or unfolds the list; the name opens the overview of the folder: all its pages as thumbnails.
  const folder = (key: FolderKey) => (
    <div className={`nav-folder-row${view.kind === 'folder' && view.id === key ? ' active' : ''}`}>
      <button className="nav-chev" onClick={() => setOpen({ ...open, [key]: !open[key] })} aria-expanded={open[key]} aria-label={`${open[key] ? 'Fold' : 'Unfold'} ${FOLDER_TITLE[key]}`} title={open[key] ? 'Fold the list' : 'Unfold the list'}>
        <span className="chev">{open[key] ? '▾' : '▸'}</span>
      </button>
      <button className="nav-folder" data-folder={key} onClick={() => setView({ kind: 'folder', id: key })} title={`See all ${FOLDER_TITLE[key].toLowerCase()} as pictures: select, rename, reorder or delete several`} aria-current={view.kind === 'folder' && view.id === key ? 'page' : undefined}>
        {FOLDER_TITLE[key]}
      </button>
    </div>
  );
  const finishRename = (ref: Exclude<ViewRef, { kind: 'folder' }>, name: string) => {
    setRenaming(null);
    run('Rename', renameItem(ref.kind, ref.id, name));
  };
  const item = (ref: Exclude<ViewRef, { kind: 'folder' }>, icon: string, name: string, badges: Badge[] = []) =>
    renaming === ref.id ? (
      <div key={ref.id} className="nav-item active">
        <span className="nav-icon">{icon}</span>
        <input
          className="nav-rename"
          aria-label="Name"
          autoFocus
          defaultValue={name}
          onFocus={(e) => e.target.select()}
          onBlur={(e) => finishRename(ref, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            else if (e.key === 'Escape') setRenaming(null);
          }}
        />
      </div>
    ) : (
      <button key={ref.id} className={`nav-item${sameView(view, ref) ? ' active' : related.has(ref.id) ? ' related' : ''}`} onClick={() => setView(ref)} onDoubleClick={() => setRenaming(ref.id)} onKeyDown={(e) => e.key === 'F2' && setRenaming(ref.id)} title="Double-click or press F2 to rename">
        <span className="nav-icon">{icon}</span> {name}
        {badges.map((badge) => (
          <span key={badge.text} className="nav-badge" title={badge.title}>{badge.text}</span>
        ))}
      </button>
    );
  // Up, Down, Home and End move between the folders and pages (the focus goes with them); Left and Right fold and unfold a folder.
  const onTreeKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (e.ctrlKey || e.metaKey || e.altKey || t.tagName === 'INPUT') return;
    const stops = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button.nav-folder, button.nav-item')];
    const folderKey = t.dataset.folder as FolderKey | undefined;
    const fold = folderKey ? navFold(e.key, open[folderKey]) : null;
    if (folderKey && fold !== null) {
      e.preventDefault();
      setOpen({ ...open, [folderKey]: fold });
      return;
    }
    const to = navStep(e.key, stops.indexOf(t as HTMLButtonElement), stops.length);
    if (to !== null && stops[to]) {
      e.preventDefault();
      stops[to].focus();
    }
  };
  const newItem = (label: string, onClick: () => void) => (
    <button className="nav-item nav-new" onClick={onClick}>
      <span className="nav-icon">⊕</span> {label}
    </button>
  );

  return (
    <nav className="navigator" aria-label="Project navigator">
      <div className="nav-panel">
        <div className="nav-tree" onKeyDown={onTreeKey}>
          {folder('tables')}
          {open.tables && (
            <>
              {project.dataTables.map((t) => item({ kind: 'table', id: t.id }, '▦', t.name, [TABLE_BADGE[t.kind]]))}
              {newItem('New Data Table…', () => setDialog('table'))}
            </>
          )}
          {folder('results')}
          {open.results && (
            <>
              {analysesOf(project).map((a) => item({ kind: 'analysis', id: a.id }, 'Σ', a.name))}
              {newItem('New Analysis…', () => setDialog('analysis'))}
            </>
          )}
          {folder('graphs')}
          {open.graphs && (
            <>
              {project.charts.map((c) => item({ kind: 'chart', id: c.id }, '▥', c.name, [chartBadge(c.type), ...(c.linkedTo ? [{ text: '🔗', title: `Linked to ${project.charts.find((x) => x.id === c.linkedTo)?.name ?? 'another graph'}: it follows that graph's format` }] : [])]))}
              {newItem('New Graph…', () => setDialog('graph'))}
            </>
          )}
          {folder('layouts')}
          {open.layouts && (
            <>
              {(project.layouts ?? []).map((l) => item({ kind: 'layout', id: l.id }, '▤', l.name))}
              {newItem('New Layout…', () => setDialog('layout'))}
            </>
          )}
          {LOCKED_SECTIONS.map((title) => (
            <button key={title} className="nav-folder nav-locked" disabled aria-disabled="true" title={`${title} is not available in this version`}>
              <span className="nav-icon" aria-hidden="true">🔒</span> {title}
            </button>
          ))}
        </div>
        {current && (
          <div className="nav-actions" role="group" aria-label={`Actions for ${current.name}`}>
            <button onClick={duplicateCurrent} title="Make a copy of the item on screen">Duplicate</button>
            <button onClick={deleteCurrent} disabled={view.kind === 'table' && project.dataTables.length <= 1} title={view.kind === 'table' ? 'Delete this table and the graphs and results that use it (can be undone)' : 'Delete this item (can be undone)'}><DeleteIcon /> Delete</button>
          </div>
        )}
      </div>
      {/* In the page body, not in the (sliding) panel, so the dialog is positioned against the window. */}
      {dialog === 'table' && createPortal(<NewTableDialog defaultSample={!settings.newProjectEmpty} onCreate={createTable} onClose={() => setDialog(null)} />, document.body)}
      {dialog === 'layout' && createPortal(<NewLayoutDialog charts={project.charts} initialChartId={view.kind === 'chart' ? view.id : undefined} onCreate={createLayout} onClose={() => setDialog(null)} />, document.body)}
      {dialog === 'analysis' && createPortal(<NewAnalysisDialog tables={project.dataTables} initialTableId={currentTableId ?? project.dataTables[0].id} onCreate={createAnalysis} onClose={() => setDialog(null)} />, document.body)}
      {dialog === 'graph' && createPortal(<NewGraphDialog tables={project.dataTables} charts={project.charts} initialTableId={currentTableId ?? project.dataTables[0].id} initialChartId={view.kind === 'chart' ? view.id : undefined} onCreate={createGraph} onCreateLike={createGraphLike} onClose={() => setDialog(null)} />, document.body)}
    </nav>
  );
}
