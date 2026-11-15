/** The pages of a layout's inspector that the Format menu lists (Export is under File). The ids are those of LAYOUT_KIT in LayoutView.tsx. */
export const LAYOUT_FORMAT_PAGES: ReadonlyArray<{ id: 'page' | 'panels' | 'graphs' | 'legend' | 'notes'; label: string }> = [
  { id: 'page', label: 'Page' },
  { id: 'panels', label: 'Panels' },
  { id: 'graphs', label: 'Graphs' },
  { id: 'legend', label: 'Legend' },
  { id: 'notes', label: 'Notes' },
];
