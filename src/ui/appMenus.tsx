import { AddColumnIcon, DeleteIcon, ExcludeIcon, ExportIcon, FitCurveIcon, GRAPH_PAGE_ICONS, ImportIcon, IncludeIcon, InfoIcon, LAYOUT_PAGE_ICONS, NewProjectIcon, OpenProjectIcon, ResetIcon, SaveProjectIcon, SettingsIcon, TableTypeIcon } from './components/icons';
import type { MenuEntry, MenuSpec } from './components/MenuBar';
import { fireCommand } from './components/appCommands';
import type { ShortcutAction } from './components/appShortcuts';
import { LAYOUT_INSPECTOR_PAGES } from './views/layoutPages';
import { ADD_COLUMN_LABEL, type TableAction } from './views/tableMenu';
import { inspectorShapeOf, PAGES as INSPECTOR_PAGES } from './inspector/common/nav';
import type { InspectorTarget } from '../state/inspectorNav';
import { resetAllDataSets, type Command } from '../state/commands';
import { HIGHLIGHTS } from '../model/project/highlight';
import type { Analysis, Chart, DataTable, HighlightColor } from '../model/types';

/**
 * What the menu bar and the shortcuts need to know and to do: what is on screen (a table, a graph, a layout, results, or a folder) and how the
 * shell answers (panels, dialogs, files). Built by the shell at each render; the menus and `runShortcut` read it.
 */
export interface MenuContext {
  table: DataTable | undefined;
  chart: Chart | undefined;
  analysis: Analysis | undefined;
  onLayout: boolean;
  /** True on the page of a folder (Data Tables, Graphs, Results, Layouts), where items are picked. */
  onFolder: boolean;
  /** What the item on screen is called in Duplicate, Rename and Delete; null on a folder. */
  itemNoun: string | null;
  /** The highlight of the item on screen; undefined for none. */
  highlight: HighlightColor | undefined;
  tableCount: number;
  hasInspector: boolean;
  canUndo: boolean;
  canRedo: boolean;
  navOpen: boolean;
  inspectorOpen: boolean;
  setNavOpen: (open: boolean) => void;
  setInspectorOpen: (open: boolean) => void;
  startNewProject: () => void;
  openProject: () => void;
  saveProject: () => void;
  undo: () => void;
  redo: () => void;
  run: (label: string, command: Command, coalesceKey?: string) => void;
  setStatus: (text: string) => void;
  navigateInspector: (target: InspectorTarget) => void;
  openSettings: () => void;
  openRecovery: () => void;
  openShortcuts: () => void;
  openAbout: () => void;
  /** True on a page that has a zoom (a table, a graph, a layout, a result). */
  zoomable: boolean;
  resetZoom: () => void;
  fullscreen: boolean;
  toggleFullscreen: () => void;
}

const item = (label: string, onSelect: () => void, more: Partial<Extract<MenuEntry, { label: string; onSelect: () => void }>> = {}): MenuEntry => ({ label, onSelect, ...more });
const sep: MenuEntry = { kind: 'separator' };
/** Groups of items with a line between them. */
const grouped = (...lists: MenuEntry[][]): MenuEntry[] => lists.filter((l) => l.length > 0).flatMap((l, i) => (i === 0 ? l : [sep, ...l]));
const act = (a: TableAction) => () => fireCommand('table-action', a);

/** Sends the inspector (opened if it was shut) to the Export page of the graph or the layout on screen. */
function exportHere(c: MenuContext): void {
  if (c.chart) c.navigateInspector({ page: 'export' });
  else if (c.onLayout) fireCommand('layout-page', 'export');
  else return;
  c.setInspectorOpen(true);
}

/** What a shortcut does; false when it does not apply on this page (the key is then left to the browser). */
export function runShortcut(a: ShortcutAction, c: MenuContext): boolean {
  if (a === 'undo') c.undo();
  else if (a === 'redo') c.redo();
  else if (a === 'new') c.startNewProject();
  else if (a === 'open') c.openProject();
  else if (a === 'export') {
    if (!c.chart && !c.onLayout) return false;
    exportHere(c);
  } else if (a === 'settings') c.openSettings();
  else if (a === 'shortcuts') c.openShortcuts();
  else if (a === 'navigator') c.setNavOpen(!c.navOpen);
  else if (a === 'inspector') {
    if (!c.hasInspector) return false;
    c.setInspectorOpen(!c.inspectorOpen);
  } else if (a === 'duplicate') {
    if (!c.itemNoun) return false;
    fireCommand('duplicate-item');
  } else if (a === 'rename') {
    if (!c.itemNoun) return false;
    c.setNavOpen(true);
    fireCommand('rename-item');
  }
  return true;
}

/** Format in a table: the buttons of the table's toolbar (the toolbar keeps them too). */
function tableFormat(table: DataTable): MenuEntry[] {
  return grouped(
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
  );
}

/** Format on a graph: the pages and tabs its inspector has (Export is under File). A page with several tabs is a group of its own; the pages with one setting are listed together. */
function graphFormat(chart: Chart, c: MenuContext): MenuEntry[] {
  const shape = inspectorShapeOf(chart.type);
  const pageItems = shape.pages
    .filter((id) => id !== 'export')
    .map((id): { many: boolean; entries: MenuEntry[] } => {
      const page = INSPECTOR_PAGES.find((p) => p.id === id);
      if (!page) return { many: false, entries: [] };
      const parts = page.parts.filter((p) => !shape.lacks.includes(p.id));
      const Icon = GRAPH_PAGE_ICONS[id];
      const go = (part?: InspectorTarget['part']) => () => {
        c.navigateInspector({ page: id, part });
        c.setInspectorOpen(true);
      };
      return parts.length > 1
        ? { many: true, entries: parts.map((p) => item(`${page.label}: ${p.label}`, go(p.id), { icon: <Icon /> })) }
        : { many: false, entries: [item(page.label, go(parts[0]?.id), { title: page.title, icon: <Icon /> })] };
    });
  const lists: MenuEntry[][] = [];
  pageItems.forEach((p, i) => (p.many || i === 0 || pageItems[i - 1].many ? lists.push(p.entries) : lists[lists.length - 1].push(...p.entries)));
  return grouped(...lists);
}

/** Format on a layout: the pages of its inspector (Export is under File). */
function layoutFormat(c: MenuContext): MenuEntry[] {
  return LAYOUT_INSPECTOR_PAGES.filter((p) => p.id !== 'export').map((p) => {
    const Icon = LAYOUT_PAGE_ICONS[p.id];
    return item(
      p.label,
      () => {
        fireCommand('layout-page', p.id);
        c.setInspectorOpen(true);
      },
      { icon: <Icon /> },
    );
  });
}

/**
 * The menu bar. Each item either acts through the context or fires a command that the view owning the thing listens for (see appCommands.ts).
 * An item that belongs to one page is hidden on the others; a menu with nothing to offer is greyed out.
 */
export function buildMenus(c: MenuContext): MenuSpec[] {
  const { table, chart, analysis, onLayout, itemNoun } = c;
  const formatEntries = chart ? graphFormat(chart, c) : onLayout ? layoutFormat(c) : table ? tableFormat(table) : [];
  const lastTable = table !== undefined && c.tableCount <= 1;
  return [
    {
      label: 'File',
      entries: [
        item('New project', c.startNewProject, { shortcut: 'Ctrl+Alt+N', icon: <NewProjectIcon /> }),
        item('Open project…', c.openProject, { shortcut: 'Ctrl+O', icon: <OpenProjectIcon /> }),
        item('Save project', c.saveProject, { shortcut: 'Ctrl+S', icon: <SaveProjectIcon />, title: 'Save the project to a file (you choose the name)' }),
        sep,
        item('Export figure…', () => exportHere(c), { shortcut: 'Ctrl+E', icon: <ExportIcon />, hidden: !chart, title: 'Export this graph as a picture or a vector file' }),
        item('Export layout…', () => exportHere(c), { shortcut: 'Ctrl+E', icon: <ExportIcon />, hidden: !onLayout, title: 'Export this page as a picture or a vector file' }),
        sep,
        item('Recovery copies…', c.openRecovery, { title: 'Download the project copies this browser keeps, including text that could not be read' }),
        item('Settings…', c.openSettings, { shortcut: 'Ctrl+,', icon: <SettingsIcon /> }),
      ],
    },
    {
      label: 'Edit',
      entries: [
        item('Undo', c.undo, { shortcut: 'Ctrl+Z', disabled: !c.canUndo, title: c.canUndo ? undefined : 'Nothing to undo' }),
        item('Redo', c.redo, { shortcut: 'Ctrl+Y', disabled: !c.canRedo, title: c.canRedo ? undefined : 'Nothing to redo' }),
        sep,
        item('New data table…', () => { c.setNavOpen(true); fireCommand('new-table'); }),
        item(`Duplicate ${itemNoun ?? 'item'}`, () => fireCommand('duplicate-item'), { shortcut: 'Ctrl+Shift+D', hidden: !itemNoun, title: 'Make a copy of the item on screen' }),
        item(`Rename ${itemNoun ?? 'item'}`, () => { c.setNavOpen(true); fireCommand('rename-item'); }, { shortcut: 'F2', hidden: !itemNoun, title: 'Rename the item on screen' }),
        {
          kind: 'submenu',
          label: itemNoun ? `Highlight ${itemNoun}` : 'Highlight selected',
          hidden: !itemNoun && !c.onFolder,
          title: itemNoun ? 'Colour the name of the item in the navigator, so that it is easy to come back to' : 'Colour the names of the items selected on this page',
          entries: [
            // The tick stands at the right, so the colour of the row stays visible.
            item('No colour', () => fireCommand('highlight-item', ''), { checked: itemNoun ? c.highlight === undefined : undefined, icon: <span className="menu-swatch menu-swatch-none" /> }),
            sep,
            ...HIGHLIGHTS.map((h) => item(h.label, () => fireCommand('highlight-item', h.id), { checked: itemNoun ? c.highlight === h.id : undefined, icon: <span className="menu-swatch" style={{ background: h.color }} /> })),
          ],
        },
        item(`Delete ${itemNoun ?? 'item'}`, () => fireCommand('delete-item'), { icon: <DeleteIcon />, hidden: !itemNoun, disabled: lastTable, title: table ? (lastTable ? 'The last table cannot be deleted' : 'Delete this table and the graphs and results that use it (can be undone)') : 'Delete this item (can be undone)' }),
        sep,
        item('Import CSV…', () => fireCommand('import-csv'), { icon: <ImportIcon />, hidden: !table }),
        item('Export CSV', () => fireCommand('export-csv'), { icon: <ExportIcon />, hidden: !table && !analysis }),
        item('Copy results', () => fireCommand('copy-results'), { hidden: !analysis, title: 'Copy the selected cells, or all the results, as tab-separated text' }),
        item(
          'Reset graph settings',
          () => {
            if (!chart) return;
            c.run('Reset settings', resetAllDataSets(chart.id));
            c.setStatus('Settings reset to defaults.');
          },
          { icon: <ResetIcon />, hidden: !chart, title: "Reset the whole graph to a new graph's settings: data set styles, axes, grid, legend, fonts, colours, size. Kept: the title and axis titles, which data sets are shown and their order, annotations and the chosen fit. Reference lines are removed. Undo restores everything." },
        ),
      ],
    },
    {
      label: 'View',
      entries: [
        item('Navigator', () => c.setNavOpen(!c.navOpen), { shortcut: 'Ctrl+B', checked: c.navOpen, title: c.navOpen ? 'Hide the navigation panel' : 'Show the navigation panel' }),
        item('Formatting panel', () => c.setInspectorOpen(!c.inspectorOpen), { shortcut: 'Ctrl+Alt+B', checked: c.hasInspector && c.inspectorOpen, hidden: !c.hasInspector }),
        sep,
        item('Full screen', c.toggleFullscreen, { checked: c.fullscreen, title: c.fullscreen ? 'Leave full screen' : 'Fill the screen with the app' }),
        item('100%', c.resetZoom, { hidden: !c.zoomable, title: c.chart ? 'Fit the graph to the window (100%)' : c.onLayout ? 'Fit the page to the window (100%)' : 'Back to 100%' }),
      ],
    },
    {
      label: 'Analyze',
      entries: [
        item('New analysis…', () => { c.setNavOpen(true); fireCommand('new-analysis'); }),
        item('Fit curve', () => fireCommand('fit-curve'), { icon: <FitCurveIcon />, hidden: table?.kind !== 'xy', title: 'A line, a curve or a dose-response model for the Y series' }),
        item('Make graph from curve fit', () => fireCommand('make-graph'), { hidden: analysis?.kind !== 'curvefit' }),
      ],
    },
    { label: 'Format', entries: formatEntries, disabled: formatEntries.length === 0, title: 'Nothing to format here: open a table, a graph or a layout' },
    {
      label: 'Help',
      entries: [
        item('OctavaPlot on GitHub', () => window.open('https://github.com/itrus/OctavaPlot', '_blank', 'noopener,noreferrer'), { title: 'The code, the issue tracker and the releases' }),
        item('Keyboard shortcuts…', c.openShortcuts, { shortcut: 'Ctrl+/', title: 'Every key of the app' }),
        item('About OctavaPlot…', c.openAbout, { icon: <InfoIcon />, title: 'About OctavaPlot and credits' }),
      ],
    },
  ];
}
