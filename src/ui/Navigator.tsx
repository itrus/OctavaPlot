import { useState } from 'react';
import { newId } from '../model/ids';
import type { ViewRef } from '../model/types';
import { useApp } from '../state/AppContext';
import { addChart, addDataTable } from '../state/commands';

type Folder = 'tables' | 'graphs';

const sameView = (a: ViewRef, b: ViewRef) => a.kind === b.kind && a.id === b.id;

/** Sections that are not finished yet: shown with a lock and not reachable. */
const LOCKED_SECTIONS = ['Info', 'Results', 'Layouts'] as const;

export function Navigator() {
  const { project, view, setView, run, settings } = useApp();
  const [open, setOpen] = useState<Record<Folder, boolean>>({ tables: true, graphs: true });

  const currentTableId =
    view.kind === 'table' ? view.id : project.charts.find((c) => c.id === view.id)?.dataTableId;

  const newTable = () => {
    const id = newId('table');
    run('New data table', addDataTable(id));
    setView({ kind: 'table', id });
  };
  const newGraph = () => {
    const tableId = currentTableId ?? project.dataTables[0].id;
    const id = newId('chart');
    run('New graph', addChart(id, tableId, { widthPx: settings.defaultChartWidthPx, heightPx: settings.defaultChartHeightPx }));
    setView({ kind: 'chart', id });
  };

  const folder = (key: Folder, title: string) => (
    <button className="nav-folder" onClick={() => setOpen({ ...open, [key]: !open[key] })} aria-expanded={open[key]}>
      <span className="chev">{open[key] ? '▾' : '▸'}</span> {title}
    </button>
  );
  const item = (ref: ViewRef, icon: string, name: string) => (
    <button key={ref.id} className={`nav-item${sameView(view, ref) ? ' active' : ''}`} onClick={() => setView(ref)}>
      <span className="nav-icon">{icon}</span> {name}
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
              {project.dataTables.map((t) => item({ kind: 'table', id: t.id }, '▦', t.name))}
              {newItem('New Data Table…', newTable)}
            </>
          )}
          {folder('graphs', 'Graphs')}
          {open.graphs && (
            <>
              {project.charts.map((c) => item({ kind: 'chart', id: c.id }, '▥', c.name))}
              {newItem('New Graph…', newGraph)}
            </>
          )}
          {LOCKED_SECTIONS.map((title) => (
            <button key={title} className="nav-folder nav-locked" disabled aria-disabled="true" title={`${title} is not available in this version`}>
              <span className="nav-icon" aria-hidden="true">🔒</span> {title}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}
