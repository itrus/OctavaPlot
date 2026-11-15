import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { AppProvider, useCommands, useGraphViewport, useHistory, useLayoutViewport, usePreferences, useProject, useSelection, useStatus, useTableViewport } from '../../src/state/AppContext';

/** Browser regression probe: count independent consumers while each subsystem changes. */
export function probeContextSubscriptions() {
  const renders = { commands: 0, project: 0, history: 0, graph: 0, table: 0, layout: 0, selection: 0, preferences: 0, status: 0 };
  let commands!: ReturnType<typeof useCommands>;
  let graph!: ReturnType<typeof useGraphViewport>;
  let selection!: ReturnType<typeof useSelection>;
  let preferences!: ReturnType<typeof usePreferences>;
  let history!: ReturnType<typeof useHistory>;
  let projectName = '';
  function Commands() { commands = useCommands(); renders.commands++; return null; }
  function Project() { projectName = useProject().project.name; renders.project++; return null; }
  function History() { history = useHistory(); renders.history++; return null; }
  function Graph() { graph = useGraphViewport(); renders.graph++; return null; }
  function Table() { useTableViewport(); renders.table++; return null; }
  function Layout() { useLayoutViewport(); renders.layout++; return null; }
  function Selection() { selection = useSelection(); renders.selection++; return null; }
  function Preferences() { preferences = usePreferences(); renders.preferences++; return null; }
  function Status() { useStatus(); renders.status++; return null; }
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(<AppProvider><Commands /><Project /><History /><Graph /><Table /><Layout /><Selection /><Preferences /><Status /></AppProvider>));
    const initial = { ...renders };
    flushSync(() => graph.setZoom(1.5));
    const zoom = { ...renders };
    flushSync(() => selection.setSelection({ kind: 'annotation', annotationId: 'probe' }));
    const selected = { ...renders };
    flushSync(() => preferences.updateSettings({ autosave: false }));
    const settings = { ...renders };
    flushSync(() => commands.setStatus('Probe status'));
    const status = { ...renders };
    const beforeName = projectName;
    flushSync(() => commands.run('Rename', (p) => ({ ...p, name: 'Context probe' })));
    const editedName = projectName;
    const canUndo = history.canUndo;
    flushSync(() => history.undo());
    return { initial, zoom, selected, settings, status, editedName, beforeName, undoneName: projectName, canUndo, canRedo: history.canRedo };
  } finally {
    flushSync(() => root.unmount());
    host.remove();
  }
}
