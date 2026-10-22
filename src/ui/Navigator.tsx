import { useState } from 'react';
import { createPortal } from 'react-dom';
import { newId } from '../model/ids';
import type { ChartType, Id, TableKind, ViewRef } from '../model/types';
import { useApp } from '../state/AppContext';
import { addChart, addDataTable, type NewTableOptions } from '../state/commands';
import { NewGraphDialog } from './NewItemDialogs';
import { NewTableDialog } from './NewTableDialog';

type Folder = 'tables' | 'graphs';

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
const LOCKED_SECTIONS = ['Info', 'Results', 'Layouts'] as const;

export function Navigator() {
  const { project, view, setView, run, settings } = useApp();
  const [open, setOpen] = useState<Record<Folder, boolean>>({ tables: true, graphs: true });

  const currentTableId =
    view.kind === 'table' ? view.id : project.charts.find((c) => c.id === view.id)?.dataTableId;

  // New items are made in two clear steps: the type of table first, then a chart type that suits that table.
  const [dialog, setDialog] = useState<'table' | 'graph' | null>(null);
  const createTable = (kind: TableKind, options: NewTableOptions) => {
    const id = newId('table');
    run(`New ${kind} table`, addDataTable(id, kind, options));
    setView({ kind: 'table', id });
    setDialog(null);
  };
  const createGraph = (tableId: Id, type: ChartType) => {
    const id = newId('chart');
    run('New graph', addChart(id, tableId, { widthPx: settings.defaultChartWidthPx, heightPx: settings.defaultChartHeightPx }, type));
    setView({ kind: 'chart', id });
    setDialog(null);
  };

  const folder = (key: Folder, title: string) => (
    <button className="nav-folder" onClick={() => setOpen({ ...open, [key]: !open[key] })} aria-expanded={open[key]}>
      <span className="chev">{open[key] ? '▾' : '▸'}</span> {title}
    </button>
  );
  const item = (ref: ViewRef, icon: string, name: string, badge?: { text: string; title: string }) => (
    <button key={ref.id} className={`nav-item${sameView(view, ref) ? ' active' : ''}`} onClick={() => setView(ref)}>
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
          {folder('graphs', 'Graphs')}
          {open.graphs && (
            <>
              {project.charts.map((c) => item({ kind: 'chart', id: c.id }, '▥', c.name))}
              {newItem('New Graph…', () => setDialog('graph'))}
            </>
          )}
          {LOCKED_SECTIONS.map((title) => (
            <button key={title} className="nav-folder nav-locked" disabled aria-disabled="true" title={`${title} is not available in this version`}>
              <span className="nav-icon" aria-hidden="true">🔒</span> {title}
            </button>
          ))}
        </div>
      </div>
      {/* In the page body, not in the (sliding) panel, so the dialog is positioned against the window. */}
      {dialog === 'table' && createPortal(<NewTableDialog defaultSample={!settings.newProjectEmpty} onCreate={createTable} onClose={() => setDialog(null)} />, document.body)}
      {dialog === 'graph' && createPortal(<NewGraphDialog tables={project.dataTables} initialTableId={currentTableId ?? project.dataTables[0].id} onCreate={createGraph} onClose={() => setDialog(null)} />, document.body)}
    </nav>
  );
}
