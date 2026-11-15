/** A named colour set applied to the data sets of a chart, in order (the first colour goes to the first data set). */
export interface Palette {
  id: string;
  name: string;
  colors: readonly string[];
  /** What the palette is and where it comes from. */
  description?: string;
  /** Palettes taken from ggsci are listed first; the rest are the app's own. */
  source?: 'ggsci';
  /** The subcategory it is listed under in the palette menu. */
  group: PaletteGroup;
}

type PaletteGroup = 'Journals' | 'Software and design systems' | 'Genomics' | 'Other';
export const PALETTE_GROUPS: readonly PaletteGroup[] = ['Journals', 'Software and design systems', 'Genomics', 'Other'];

/** Where the ggsci palettes come from. */
export const GGSCI_CITATION = {
  text: 'Xiao N. ggsci: Scientific Journal and Sci-Fi Themed Color Palettes for ggplot2. R package.',
  url: 'https://nanx.me/ggsci/',
  repository: 'https://github.com/nanxstats/ggsci',
  vignette: 'https://nanx.me/ggsci/articles/ggsci.html',
} as const;

export const PALETTES: readonly Palette[] = [
  {
    id: 'aaas', group: 'Journals', name: 'Science (AAAS)', source: 'ggsci',
    description: 'Modelled on the colours used in the journals of the American Association for the Advancement of Science (ggsci pal_aaas).',
    colors: ['#3B4992', '#EE0000', '#008B45', '#631879', '#008280', '#BB0021', '#5F559B', '#A20056', '#808180', '#1B1919'],
  },
  {
    id: 'npg', group: 'Journals', name: 'Nature (NPG)', source: 'ggsci',
    description: 'Modelled on the colours used in Nature Publishing Group journals (ggsci pal_npg, "nrc").',
    colors: ['#E64B35', '#4DBBD5', '#00A087', '#3C5488', '#F39B7F', '#8491B4', '#91D1C2', '#DC0000', '#7E6148', '#B09C85'],
  },
  {
    id: 'nejm', group: 'Journals', name: 'New England Journal of Medicine (NEJM)', source: 'ggsci',
    description: 'Modelled on the colours used in the New England Journal of Medicine (ggsci pal_nejm).',
    colors: ['#BC3C29', '#0072B5', '#E18727', '#20854E', '#7876B1', '#6F99AD', '#FFDC91', '#EE4C97'],
  },
  {
    id: 'lancet', group: 'Journals', name: 'The Lancet', source: 'ggsci',
    description: 'Modelled on the colours used in Lancet journals, such as Lancet Oncology (ggsci pal_lancet, "lanonc").',
    colors: ['#00468B', '#ED0000', '#42B540', '#0099B4', '#925E9F', '#FDAF91', '#AD002A', '#ADB6B6', '#1B1919'],
  },
  {
    id: 'jama', group: 'Journals', name: 'JAMA (Journal of the American Medical Association)', source: 'ggsci',
    description: 'Modelled on the colours used in the Journal of the American Medical Association (ggsci pal_jama).',
    colors: ['#374E55', '#DF8F44', '#00A1D5', '#B24745', '#79AF97', '#6A6599', '#80796B'],
  },
  {
    id: 'bmj', group: 'Journals', name: 'BMJ (British Medical Journal)', source: 'ggsci',
    description: 'Taken from the BMJ living style guide (ggsci pal_bmj).',
    colors: ['#2A6EBB', '#F0AB00', '#C50084', '#7D5CC6', '#E37222', '#69BE28', '#00B2A9', '#CD202C', '#747678'],
  },
  {
    id: 'jco', group: 'Journals', name: 'Journal of Clinical Oncology (JCO)', source: 'ggsci',
    description: 'Modelled on the colours used in the Journal of Clinical Oncology (ggsci pal_jco).',
    colors: ['#0073C2', '#EFC000', '#868686', '#CD534C', '#7AA6DC', '#003C67', '#8F7700', '#3B3B3B', '#A73030', '#4A6990'],
  },
  {
    id: 'd3', group: 'Software and design systems', name: 'D3 (category10)', source: 'ggsci',
    description: 'Categorical colours from D3.js version 3 and earlier, the ten-colour scheme (ggsci pal_d3, "category10").',
    colors: ['#1F77B4', '#FF7F0E', '#2CA02C', '#D62728', '#9467BD', '#8C564B', '#E377C2', '#7F7F7F', '#BCBD22', '#17BECF'],
  },
  {
    id: 'd3_20', group: 'Software and design systems', name: 'D3 (category20)', source: 'ggsci',
    description: 'Categorical colours from D3.js version 3 and earlier, the twenty-colour scheme: each of the ten with a lighter partner (ggsci pal_d3, "category20").',
    colors: [
      '#1F77B4', '#AEC7E8', '#FF7F0E', '#FFBB78', '#2CA02C', '#98DF8A', '#D62728', '#FF9896', '#9467BD', '#C5B0D5',
      '#8C564B', '#C49C94', '#E377C2', '#F7B6D2', '#7F7F7F', '#C7C7C7', '#BCBD22', '#DBDB8D', '#17BECF', '#9EDAE5',
    ],
  },
  {
    id: 'gephi', group: 'Software and design systems', name: 'Gephi', source: 'ggsci',
    description: 'Visually distinct colours made by the generative palette engine of Gephi (ggsci pal_gephi, "default"). Ten colours generated with a fixed seed; the engine is random, so ggsci in R gives other ones each time.',
    colors: ['#E8A900', '#00DAFF', '#FF82FF', '#4E647A', '#62D400', '#00C994', '#FF6E90', '#FF7739', '#88B6FF', '#84773A'],
  },
  {
    id: 'observable', group: 'Software and design systems', name: 'Observable', source: 'ggsci',
    description: 'The default categorical scheme of Observable (ggsci pal_observable, "observable10").',
    colors: ['#4269D0', '#EFB118', '#FF725C', '#6CC5B0', '#3CA951', '#FF8AB7', '#A463F2', '#97BBF5', '#9C6B4E', '#9498A0'],
  },
  {
    id: 'primer', group: 'Software and design systems', name: 'Primer', source: 'ggsci',
    description: 'Data visualisation colours of the Primer design system of GitHub (ggsci pal_primer, "mark17").',
    colors: [
      '#006EDB', '#EB670F', '#DF0C24', '#179B9B', '#30A147', '#894CEB', '#B88700', '#CE2C85', '#856D4C',
      '#527A29', '#D43511', '#167E53', '#9D615C', '#64762D', '#A830E8', '#866E04', '#808FA3',
    ],
  },
  {
    id: 'atlassian', group: 'Software and design systems', name: 'Atlassian', source: 'ggsci',
    description: 'Categorical chart colours of the Atlassian Design System (ggsci pal_atlassian, "categorical8").',
    colors: ['#4688EC', '#94C748', '#C97CF4', '#FCA700', '#1558BC', '#964AC0', '#42B2D7', '#E06C00'],
  },
  {
    id: 'iterm', group: 'Software and design systems', name: 'iTerm (Rose Pine)', source: 'ggsci',
    description: 'Six ANSI terminal colours from the iterm2-color-schemes collection, here the Rose Pine scheme, normal variant (ggsci pal_iterm). ggsci offers more than 400 schemes; this is the one used in its examples.',
    colors: ['#9CCFD8', '#F6C177', '#EB6F92', '#EBBCBA', '#31748F', '#C4A7E7'],
  },
  {
    id: 'igv', group: 'Genomics', name: 'IGV', source: 'ggsci',
    description: 'Chromosome colours of the Integrative Genomics Viewer (ggsci pal_igv, "default"). The first ten are shown first; the palette has 51 entries (49 different).',
    colors: [
      '#5050FF', '#CE3D32', '#749B58', '#F0E685', '#466983', '#BA6338', '#5DB1DD', '#802268', '#6BD76B', '#D595A7',
      '#924822', '#837B8D', '#C75127', '#D58F5C', '#7A65A5', '#E4AF69', '#3B1B53', '#CDDEB7', '#612A79', '#AE1F63',
      '#E7C76F', '#5A655E', '#CC9900', '#99CC00', '#A9A9A9', '#CC9900', '#99CC00', '#33CC00', '#00CC33', '#00CC99',
      '#0099CC', '#0A47FF', '#4775FF', '#FFC20A', '#FFD147', '#990033', '#991A00', '#996600', '#809900', '#339900',
      '#00991A', '#009966', '#008099', '#003399', '#1A0099', '#660099', '#990080', '#D60047', '#FF1463', '#00D68F', '#14FFB1',
    ],
  },
  // The app's own palettes, kept so that charts saved with them still open.
  { id: 'vibrant', group: 'Other', name: 'Vibrant', colors: ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#42d4f4'] },
  { id: 'pastel', group: 'Other', name: 'Pastel', colors: ['#aec7e8', '#ffbb78', '#98df8a', '#ff9896', '#c5b0d5', '#c49c94'] },
  // Okabe & Ito (2008), designed to stay distinguishable under common colour-vision deficiencies.
  { id: 'colorblind', group: 'Other', name: 'Colorblind-friendly', description: 'Okabe & Ito (2008): stays distinguishable under common colour-vision deficiencies.', colors: ['#0072b2', '#e69f00', '#009e73', '#cc79a7', '#56b4e9', '#d55e00'] },
  { id: 'monochrome', group: 'Other', name: 'Monochrome', colors: ['#08306b', '#2171b5', '#6baed6', '#c6dbef', '#4292c6', '#9ecae1'] },
  { id: 'classic', group: 'Other', name: 'Black and White', colors: ['#d9d9d9', '#a6a6a6', '#737373', '#f2f2f2', '#595959', '#bfbfbf'] },
];

/** The palette a new chart starts with: the first in the list (Science). */
export const DEFAULT_PALETTE_ID = 'aaas';

export const paletteById = (id: string | null): Palette | undefined => PALETTES.find((p) => p.id === id);

/** Colour of the data set at `index`; the palette repeats when there are more data sets than colours. */
export const paletteColor = (palette: Palette, index: number): string => palette.colors[index % palette.colors.length];

/** What each subcategory of the menu holds. */
export const PALETTE_GROUP_INFO: Record<PaletteGroup, string> = {
  Journals: 'Colours modelled on the figures of scientific and medical journals, so that a chart looks at home next to them.',
  'Software and design systems': 'Categorical colours of visualisation libraries and design systems, made to keep many categories apart on a screen.',
  Genomics: 'Colours from a genome browser, where each chromosome has its own colour.',
  Other: 'The palettes of the app itself: bright, pastel, a colour-vision-safe one (Okabe & Ito), single-hue and grey.',
};

/** The palettes of one subcategory, in menu order. */
export const palettesInGroup = (group: PaletteGroup): Palette[] => PALETTES.filter((p) => p.group === group);
