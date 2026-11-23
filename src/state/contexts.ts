import { createContext, useContext } from 'react';
import type { Project } from '../model/types';
import type { Selection, ViewRef } from '../model/selection';
import type { Command } from './commands';
import type { Settings } from './settings';
import type { InspectorTarget } from './inspectorNav';

interface AppApi {
  project: Project;
  view: ViewRef;
  setView: (v: ViewRef) => void;
  selection: Selection;
  setSelection: (s: Selection) => void;
  /** Run a command as one undoable transaction. */
  run: (label: string, command: Command, coalesceKey?: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Replace the whole project (open file); clears history. */
  replaceProject: (p: Project) => void;
  /** Start a new project (example data, or blank tables when Settings says so) at the default chart size; settings are kept. Clears history. */
  newProject: () => void;
  /** True when the project has changes since it was last opened, created or saved to a file. */
  hasUnsavedChanges: () => boolean;
  /** Record that a project was just saved to a file: the one that was written (edits made while writing stay unsaved). */
  markSaved: (written: Project) => void;
  status: string;
  setStatus: (s: string) => void;
  autosaveOk: boolean;
  /** The status-bar line about the browser recovery copy (empty when there is nothing to say), and whether it is a warning. */
  recoveryText: { text: string; warning: boolean };
  /** True while another tab has written the recovery copy and this tab has changes that could be lost: show the conflict banner. */
  recoveryConflict: boolean;
  /** Conflict: this tab's copy replaces the stored one, and this tab becomes the writer. */
  keepThisTab: () => void;
  /** Conflict: replace this tab's project with the stored copy. The caller confirms first. Returns false when the copy cannot be read. */
  loadOtherTab: () => boolean;
  /** Application preferences (autosave, export, default chart size). */
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  /** Graph preview zoom, 0.25–2 (1 = 100%). */
  zoom: number;
  setZoom: (z: number) => void;
  /** Data table zoom, 0.25–4 (1 = 100%); kept apart from the graph zoom. */
  tableZoom: number;
  setTableZoom: (z: number) => void;
  /** Results page zoom, 0.25–4 (1 = 100%); kept apart from the others. */
  resultsZoom: number;
  setResultsZoom: (z: number) => void;
  /** Layout page zoom, 0.25–2 (1 = the whole page fits the window); kept apart from the others. */
  layoutZoom: number;
  setLayoutZoom: (z: number) => void;
  /** Counts requests to refit the graph to the window (the Fit button). */
  fitRequest: number;
  requestFit: () => void;
  /** The inspector page the last click on a chart element asked for; `n` changes on every request. */
  inspectorNav: { target: InspectorTarget | null; n: number };
  navigateInspector: (target: InspectorTarget) => void;
}

/** A consumer subscribes only to the subsystem it uses. */
function appContext<T>(name: string) {
  const context = createContext<T | null>(null);
  context.displayName = name;
  function useValue(): T {
    const value = useContext(context);
    if (value === null) throw new Error(`${name} must be used inside <AppProvider>`);
    return value;
  }
  return [context, useValue] as const;
}

export const [ProjectContext, useProject] = appContext<Pick<AppApi, 'project' | 'replaceProject' | 'newProject' | 'hasUnsavedChanges' | 'markSaved'>>('useProject');
export const [CommandsContext, useCommands] = appContext<Pick<AppApi, 'run' | 'setStatus'>>('useCommands');
export const [HistoryContext, useHistory] = appContext<Pick<AppApi, 'undo' | 'redo' | 'canUndo' | 'canRedo'>>('useHistory');
export const [SelectionContext, useSelection] = appContext<Pick<AppApi, 'selection' | 'setSelection'>>('useSelection');
export const [NavigationContext, useNavigation] = appContext<Pick<AppApi, 'view' | 'setView' | 'inspectorNav' | 'navigateInspector'>>('useNavigation');
export const [StatusContext, useStatus] = appContext<Pick<AppApi, 'status'>>('useStatus');
export const [RecoveryContext, useRecovery] = appContext<Pick<AppApi, 'autosaveOk' | 'recoveryText' | 'recoveryConflict' | 'keepThisTab' | 'loadOtherTab'>>('useRecovery');
export const [PreferencesContext, usePreferences] = appContext<Pick<AppApi, 'settings' | 'updateSettings'>>('usePreferences');
export const [GraphViewportContext, useGraphViewport] = appContext<Pick<AppApi, 'zoom' | 'setZoom' | 'fitRequest' | 'requestFit'>>('useGraphViewport');
export const [TableViewportContext, useTableViewport] = appContext<Pick<AppApi, 'tableZoom' | 'setTableZoom'>>('useTableViewport');
export const [ResultsViewportContext, useResultsViewport] = appContext<Pick<AppApi, 'resultsZoom' | 'setResultsZoom'>>('useResultsViewport');
export const [LayoutViewportContext, useLayoutViewport] = appContext<Pick<AppApi, 'layoutZoom' | 'setLayoutZoom'>>('useLayoutViewport');
