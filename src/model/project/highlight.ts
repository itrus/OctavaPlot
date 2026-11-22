import type { HighlightColor } from '../types';

/**
 * The colours an item of the navigator (a table, a graph, a result, a layout) can be marked with, to find it again. They are the
 * colours of the Pastel palette of the graphs (model/graph/palettes.ts), a pastel yellow that the palette lacks, and a gray.
 * `color` is the background of the item's name, and the colour of its swatch in the menus.
 */
export const HIGHLIGHTS: ReadonlyArray<{ id: HighlightColor; label: string; color: string }> = [
  { id: 'yellow', label: 'Yellow', color: '#f9e79f' },
  { id: 'red', label: 'Red', color: '#ff9896' },
  { id: 'blue', label: 'Blue', color: '#aec7e8' },
  { id: 'green', label: 'Green', color: '#98df8a' },
  { id: 'purple', label: 'Purple', color: '#c5b0d5' },
  { id: 'orange', label: 'Orange', color: '#ffbb78' },
  { id: 'gray', label: 'Gray', color: '#d5d8dc' },
];

/** The highlight a file or a command names, or undefined for none or for a name this version does not know. */
export const highlightOf = (raw: unknown): HighlightColor | undefined => HIGHLIGHTS.find((h) => h.id === raw)?.id;

/** The background colour of a highlight, for the name of an item. */
export const highlightBackground = (id: HighlightColor | undefined): string | undefined => HIGHLIGHTS.find((h) => h.id === id)?.color;
