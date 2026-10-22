import { useState } from 'react';
import { newId } from '../model/ids';
import type { ViewRef } from '../model/types';
import { useApp } from '../state/AppContext';
import { addChart, addDataTable } from '../state/commands';

type Folder = 'tables' | 'info' | 'results' | 'graphs' | 'layouts';

const sameView = (a: ViewRef, b: ViewRef) => a.kind === b.kind && a.id === b.id;

export function Navigator() {
  const { project, view, setView, run } = useApp();
  const [open, setOpen] = useState<Record<Folder, boolean>>({ tables: true, info: true, results: true, graphs: true, layouts: true });
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const match = (name: string) => q === '' || name.toLowerCase().includes(q);

  const tables = project.dataTables.filter((t) => match(t.name));
  const charts = project.charts.filter((c) => match(c.name));

  // Family: the current sheet plus the sheets linked to it (a table and the graphs drawn from it).
  const currentTableId =
    view.kind === 'table' ? view.id : project.charts.find((c) => c.id === view.id)?.dataTableId;
  const familyTable = project.dataTables.find((t) => t.id === currentTableId);
  const familyCharts = project.charts.filter((c) => c.dataTableId === currentTableId);

  const newTable = () => {
    const id = newId('table');
    run('New data table', addDataTable(id));
    setView({ kind: 'table', id });
  };
  const newGraph = () => {
    const tableId = currentTableId ?? project.dataTables[0].id;
    const id = newId('chart');
    run('New graph', addChart(id, tableId));
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
  const newItem = (label: string, onClick?: () => void) => (
    <button
      className="nav-item nav-new"
      onClick={onClick}
      disabled={!onClick}
      title={onClick ? undefined : 'Not available in this version'}
    >
      <span className="nav-icon">⊕</span> {label}
    </button>
  );

  return (
    <nav className="navigator" aria-label="Project navigator">
      <input
        type="search"
        className="nav-search"
        placeholder="Search…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search project items"
      />
      <div className="nav-tree">
        {folder('tables', 'Data Tables')}
        {open.tables && (
          <>
            {tables.map((t) => item({ kind: 'table', id: t.id }, '▦', t.name))}
            {newItem('New Data Table…', newTable)}
          </>
        )}
        {folder('info', 'Info')}
        {open.info && newItem('New Info…')}
        {folder('results', 'Results')}
        {open.results && newItem('New Analysis…')}
        {folder('graphs', 'Graphs')}
        {open.graphs && (
          <>
            {charts.map((c) => item({ kind: 'chart', id: c.id }, '▥', c.name))}
            {newItem('New Graph…', newGraph)}
          </>
        )}
        {folder('layouts', 'Layouts')}
        {open.layouts && newItem('New Layout…')}
      </div>
      <div className="nav-family">
        <div className="nav-family-title">Family</div>
        {familyTable && item({ kind: 'table', id: familyTable.id }, '▦', familyTable.name)}
        {familyCharts.map((c) => item({ kind: 'chart', id: c.id }, '▥', c.name))}
      </div>
    </nav>
  );
}
