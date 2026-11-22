import { useEffect, useRef } from 'react';

/**
 * Commands from the menu bar to the part of the app that owns the thing: the navigator makes tables and renames items, a table
 * imports its CSV, a graph or a layout takes a tool. The menu fires a name (and a detail); whichever view is mounted and listens
 * for that name acts. No listener, no effect, so a command for a view that is not on screen does nothing.
 */
export type AppCommandName =
  | 'duplicate-item'
  | 'rename-item'
  /** detail: a TableAction (views/tableMenu.ts) */
  | 'table-action'
  | 'delete-item'
  /** detail: a HighlightColor, or '' to clear it */
  | 'highlight-item'
  | 'new-table'
  | 'new-analysis'
  | 'import-csv'
  | 'export-csv'
  | 'fit-curve'
  | 'make-graph'
  | 'copy-results'
  /** detail: the page of a layout's inspector */
  | 'layout-page';

const EVENT = 'octavaplot:command';

export function fireCommand(name: AppCommandName, detail = ''): void {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { name, detail } }));
}

/** Runs `handler` when the command is fired, for as long as the calling component is mounted (the latest handler runs). */
export function useCommand(name: AppCommandName, handler: (detail: string) => void): void {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ name: string; detail: string }>).detail;
      if (d.name === name) latest.current(d.detail);
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, [name]);
}
