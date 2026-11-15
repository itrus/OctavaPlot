/** The parts of a keyboard event that decide which app shortcut it is. */
interface KeyLike {
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export type ShortcutAction = 'new' | 'open' | 'export' | 'settings' | 'shortcuts' | 'navigator' | 'inspector' | 'duplicate' | 'rename';

/**
 * The shortcuts of the whole app besides Save and Undo/Redo (see saveShortcut.ts and App.tsx). Letters are matched by key position (`code`), so
 * they work on any keyboard layout. `inText` false: the key is left alone while a text field has the focus (Ctrl+B, F2 and the like belong to the text there).
 * Ctrl+N, T and W are not offered: the browser keeps them, so New project is Ctrl+Alt+N. Ctrl+D is the table's Fill down, so Duplicate is Ctrl+Shift+D.
 */
const BINDINGS: ReadonlyArray<{ action: ShortcutAction; inText: boolean; test: (e: KeyLike, mod: boolean) => boolean }> = [
  { action: 'new', inText: false, test: (e, mod) => mod && e.altKey && !e.shiftKey && e.code === 'KeyN' },
  { action: 'open', inText: true, test: (e, mod) => mod && !e.altKey && !e.shiftKey && e.code === 'KeyO' },
  { action: 'export', inText: true, test: (e, mod) => mod && !e.altKey && !e.shiftKey && e.code === 'KeyE' },
  { action: 'settings', inText: true, test: (e, mod) => mod && !e.altKey && !e.shiftKey && e.key === ',' },
  { action: 'shortcuts', inText: true, test: (e, mod) => mod && !e.altKey && !e.shiftKey && e.key === '/' },
  { action: 'navigator', inText: false, test: (e, mod) => mod && !e.altKey && !e.shiftKey && e.code === 'KeyB' },
  { action: 'inspector', inText: false, test: (e, mod) => mod && e.altKey && !e.shiftKey && e.code === 'KeyB' },
  { action: 'duplicate', inText: false, test: (e, mod) => mod && !e.altKey && e.shiftKey && e.code === 'KeyD' },
  { action: 'rename', inText: false, test: (e, mod) => !mod && !e.altKey && !e.shiftKey && e.key === 'F2' },
];

/** The app shortcut a key press is, or null; `typing` is true while a text field has the focus. */
export function shortcutOf(e: KeyLike, typing: boolean): ShortcutAction | null {
  const mod = e.ctrlKey || e.metaKey;
  return BINDINGS.find((b) => (b.inText || !typing) && b.test(e, mod))?.action ?? null;
}

/** The shortcuts shown in Help → Keyboard shortcuts, in groups. */
export const SHORTCUT_GROUPS: ReadonlyArray<{ title: string; rows: ReadonlyArray<[keys: string, what: string]> }> = [
  {
    title: 'Project',
    rows: [
      ['Ctrl+Alt+N', 'New project'],
      ['Ctrl+S', 'Save the project'],
      ['Ctrl+O', 'Open a project'],
      ['Ctrl+E', 'Export the graph or the layout on screen'],
      ['Ctrl+,', 'Settings'],
      ['Ctrl+/', 'This list'],
    ],
  },
  {
    title: 'Edit and panels',
    rows: [
      ['Ctrl+Z', 'Undo'],
      ['Ctrl+Y or Ctrl+Shift+Z', 'Redo'],
      ['Ctrl+Shift+D', 'Duplicate the table, graph, result or layout on screen'],
      ['F2', 'Rename it'],
      ['Ctrl+B', 'Show or hide the navigator'],
      ['Ctrl+Alt+B', 'Show or hide the formatting panel'],
    ],
  },
  {
    title: 'Graph and page',
    rows: [
      ['V', 'Select tool'],
      ['T', 'Text tool'],
      ['Escape', 'Leave a tool; select the whole chart'],
      ['Left, Right', 'Previous or next data set (Shift adds it to the selection)'],
      ['Up, Down', 'Along the points of a data set'],
      ['Enter', 'Open the settings of what is selected'],
      ['Arrow keys', 'Move the selected texts and shapes (Shift 5%, Alt 0.1%)'],
      ['Delete', 'Remove the selected texts and shapes'],
      ['Ctrl or Shift + click', 'Add to or take from the selection'],
    ],
  },
  {
    title: 'Data table',
    rows: [
      ['Ctrl+D, Ctrl+R', 'Fill down, fill right'],
      ['Alt+Shift+Up, Alt+Shift+Down', 'Insert a row above or below'],
      ['Alt+Shift+D', 'Duplicate the selected rows'],
      ['Alt+Delete', 'Delete the selected rows'],
      ['Ctrl+C, Ctrl+X, Ctrl+V', 'Copy, cut, paste cells'],
    ],
  },
  {
    title: 'Folders (Tables, Graphs, Layouts)',
    rows: [
      ['Ctrl+A', 'Select all'],
      ['F2', 'Rename the selected item'],
    ],
  },
];
