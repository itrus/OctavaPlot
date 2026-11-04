/** Where the inspector can be sent: the app keeps the last request (see AppContext), the inspector reads it. */
export type InspectorPage = 'graph' | 'plot' | 'axes' | 'legend' | 'analysis' | 'notes' | 'export';

/** A place in the inspector: one page of its icon rail. */
export interface InspectorTarget {
  page: InspectorPage;
  /** The part of the page (one of its tabs), when the page has several and one is meant. */
  part?: 'type' | 'style' | 'datasets' | 'analysis' | 'axes' | 'frame' | 'text' | 'layout' | 'legend' | 'annotations' | 'export';
}
