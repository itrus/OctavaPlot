/** Where the inspector can be sent: the app keeps the last request (see AppContext), the inspector reads it. */
export type InspectorPage = 'graph' | 'plot' | 'axes' | 'legend' | 'analysis' | 'notes' | 'export';

/** A place in the inspector: one page of its icon rail. */
export interface InspectorTarget {
  page: InspectorPage;
  /** The part of the page (one of its tabs), when the page has several and one is meant. */
  part?: 'type' | 'style' | 'datasets' | 'analysis' | 'axes' | 'frame' | 'text' | 'layout' | 'legend' | 'annotations' | 'export';
}

/**
 * Where the inspector of a graph was when it was left: the page of the rail, the tab chosen on each page, how far the settings were
 * scrolled, and which sections were open or shut. Going to a table and back puts the inspector there again, so the graph is found as
 * it was left. Kept for the session only, not in the project; each graph has its own place.
 */
export interface InspectorPlace {
  page: InspectorPage;
  parts: Partial<Record<InspectorPage, NonNullable<InspectorTarget['part']>>>;
  scrollTop: number;
  /** Open (true) or shut (false) for the sections that were opened or shut by hand; the key names the page, the tab and the section. */
  sections: Record<string, boolean>;
}

const places = new Map<string, InspectorPlace>();

/** The place the inspector of this graph was left at, or undefined for a graph whose inspector was not opened yet. */
export const recallPlace = (graphId: string): InspectorPlace | undefined => places.get(graphId);

/** Notes a change of the place of this graph's inspector; what the patch does not name stays as it was. */
export function rememberPlace(graphId: string, patch: Partial<InspectorPlace>): void {
  places.set(graphId, { page: 'graph', parts: {}, scrollTop: 0, sections: {}, ...places.get(graphId), ...patch });
}

/** Whether a section was left open or shut by hand; undefined when it never was. */
export const recallSection = (graphId: string, key: string): boolean | undefined => places.get(graphId)?.sections[key];

/** Notes that a section was opened or shut. */
export function rememberSection(graphId: string, key: string, open: boolean): void {
  rememberPlace(graphId, { sections: { ...places.get(graphId)?.sections, [key]: open } });
}

/** Forgets every place: another project has other graphs. */
export const forgetPlaces = (): void => places.clear();
