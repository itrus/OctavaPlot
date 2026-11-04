import { DEFAULT_PALETTE_ID, paletteById } from '../../model/graph/palettes';

/** The colours of the thumbnails of the graph gallery: the colours of the palette a new graph starts with (Science), in order, one for each data set. */
export const SKETCH_COLOURS: readonly string[] = paletteById(DEFAULT_PALETTE_ID)!.colors.slice(0, 6);

/** The colour of the data set at `index` of a thumbnail. */
export const sketchColour = (index: number): string => SKETCH_COLOURS[index % SKETCH_COLOURS.length];

/** The axes of a thumbnail stay neutral. */
export const SKETCH_AXIS = '#39424b';
