/** Named colour sets applied to the data sets of a chart, in order (the first colour goes to the first data set). */
export interface Palette {
  id: string;
  name: string;
  colors: readonly string[];
}

export const PALETTES: readonly Palette[] = [
  { id: 'vibrant', name: 'Vibrant', colors: ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#42d4f4'] },
  { id: 'pastel', name: 'Pastel', colors: ['#aec7e8', '#ffbb78', '#98df8a', '#ff9896', '#c5b0d5', '#c49c94'] },
  // Okabe & Ito (2008), designed to stay distinguishable under common colour-vision deficiencies.
  { id: 'colorblind', name: 'Colorblind-friendly', colors: ['#0072b2', '#e69f00', '#009e73', '#cc79a7', '#56b4e9', '#d55e00'] },
  { id: 'monochrome', name: 'Monochrome', colors: ['#08306b', '#2171b5', '#6baed6', '#c6dbef', '#4292c6', '#9ecae1'] },
  { id: 'classic', name: 'Black and White', colors: ['#d9d9d9', '#a6a6a6', '#737373', '#f2f2f2', '#595959', '#bfbfbf'] },
];

/** The palette a new chart starts with: the first in the list. */
export const DEFAULT_PALETTE_ID = 'vibrant';

export const paletteById = (id: string | null): Palette | undefined => PALETTES.find((p) => p.id === id);

/** Colour of the data set at `index`; the palette repeats when there are more data sets than colours. */
export const paletteColor = (palette: Palette, index: number): string => palette.colors[index % palette.colors.length];
