export type LayoutInspectorPage = 'page' | 'panels' | 'graphs' | 'legend' | 'notes' | 'export';

/**
 * The pages of a layout's inspector, as the rail and the Format menu list them: the sheet, the boxes on it, the master legend, and Export at the foot
 * (Export is under File in the menu).
 */
export const LAYOUT_INSPECTOR_PAGES: ReadonlyArray<{ id: LayoutInspectorPage; label: string; title: string; heading: string }> = [
  { id: 'page', label: 'Page', title: 'Page: orientation, background, title, margin and panel labels', heading: 'Format Page' },
  { id: 'panels', label: 'Panels', title: 'Panels: how the graphs are arranged on the page', heading: 'Format Panels' },
  { id: 'graphs', label: 'Graphs', title: 'Graphs: the graph in each panel and the size of the graphs', heading: 'Format Graphs' },
  { id: 'legend', label: 'Legend', title: 'Legend of the page', heading: 'Format Legend' },
  { id: 'notes', label: 'Notes', title: 'Notes: texts placed on the page', heading: 'Format Notes' },
  { id: 'export', label: 'Export', title: 'Export this page as a picture or a vector file', heading: 'Export Layout' },
];
