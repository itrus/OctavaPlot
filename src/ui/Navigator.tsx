import { useState } from 'react';
import { createPortal } from 'react-dom';
import { newId } from '../model/ids';
import type { AnalysisKind, ChartType, Id, TableKind, ViewRef } from '../model/types';
import type { ChartVariant } from '../model/chartVariant';
import { useApp } from '../state/AppContext';
import { addAnalysis, addChart, addChartLike, addDataTable, addLayout, duplicateAnalysis, duplicateChart, duplicateLayout, duplicateTable, removeChart, removeLayout, removeTable, renameItem, removeAnalysis, type NewTableOptions } from '../state/commands';
import { DeleteIcon } from './icons';
import { NewAnalysisDialog } from './NewAnalysisDialog';
import { NewLayoutDialog, type NewLayoutOptions } from './NewLayoutDialog';
import { NewGraphDialog } from './NewGraphDialog';
import { analysesOf } from '../model/analysis';
import { NewTableDialog } from './NewTableDialog';

type Folder = 'tables' | 'results' | 'graphs' | 'layouts';

/** A short tag beside every table, so its kind is visible in the list. */
const TABLE_BADGE: Record<TableKind, { text: string; title: string }> = {
  column: { text: 'COL', title: 'Column table' },
  xy: { text: 'XY', title: 'XY table' },
  grouped: { text: 'GRP', title: 'Grouped table' },
  contingency: { text: 'CNT', title: 'Contingency table' },
  survival: { text: 'SRV', title: 'Survival table' },
};

const sameView = (a: ViewRef, b: ViewRef) => a.kind === b.kind && a.id === b.id;

/** Sections that are not finished yet: shown with a lock and not reachable. */
const LOCKED_SECTIONS: readonly string[] = [];

export function Navigator() {
  const [renaming, setRenaming] = useState<string | null>(null);
  const { project, view, setView, run, settings, setStatus } = useApp();
  const [open, setOpen] = useState<Record<Folder, boolean>>({ tables: true, results: true, graphs: true, layouts: true });

  const currentTableId =
    view.kind === 'table' ? view.id : project.charts.find((c) => c.id === view.id)?.dataTableId;

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

  const folder = (key: Folder, title: string) => (
    <button className="nav-folder" onClick={() => setOpen({ ...open, [key]: !open[key] })} aria-expanded={open[key]}>
      <span className="chev">{open[key] ? '▾' : '▸'}</span> {title}
    </button>
  );
  const finishRename = (ref: ViewRef, name: string) => {
    setRenaming(null);
    run('Rename', renameItem(ref.kind, ref.id, name));
  };
  const item = (ref: ViewRef, icon: string, name: string, badge?: { text: string; title: string }) =>
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
      <button key={ref.id} className={`nav-item${sameView(view, ref) ? ' active' : ''}`} onClick={() => setView(ref)} onDoubleClick={() => setRenaming(ref.id)} onKeyDown={(e) => e.key === 'F2' && setRenaming(ref.id)} title="Double-click or press F2 to rename">
        <span className="nav-icon">{icon}</span> {name}
        {badge && <span className="nav-badge" title={badge.title}>{badge.text}</span>}
      </button>
    );
  const newItem = (label: string, onClick: () => void) => (
    <button className="nav-item nav-new" onClick={onClick}>
      <span className="nav-icon">⊕</span> {label}
    </button>
  );

  return (
    <nav className="navigator" aria-label="Project navigator">
      <div className="nav-panel">
        <div className="nav-tree">
          {folder('tables', 'Data Tables')}
          {open.tables && (
            <>
              {project.dataTables.map((t) => item({ kind: 'table', id: t.id }, '▦', t.name, TABLE_BADGE[t.kind]))}
              {newItem('New Data Table…', () => setDialog('table'))}
            </>
          )}
          {folder('results', 'Results')}
          {open.results && (
            <>
              {analysesOf(project).map((a) => item({ kind: 'analysis', id: a.id }, 'Σ', a.name))}
              {newItem('New Analysis…', () => setDialog('analysis'))}
            </>
          )}
          {folder('graphs', 'Graphs')}
          {open.graphs && (
            <>
              {project.charts.map((c) => item({ kind: 'chart', id: c.id }, '▥', c.name, c.linkedTo ? { text: '🔗', title: `Linked to ${project.charts.find((x) => x.id === c.linkedTo)?.name ?? 'another graph'}: it follows that graph's format` } : undefined))}
              {newItem('New Graph…', () => setDialog('graph'))}
            </>
          )}
          {folder('layouts', 'Layouts')}
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
