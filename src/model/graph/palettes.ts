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

type PaletteGroup = 'Journals' | 'Software and design systems' | 'Published styles' | 'Other';
export const PALETTE_GROUPS: readonly PaletteGroup[] = ['Journals', 'Software and design systems', 'Published styles', 'Other'];

/** Where the ggsci palettes come from. */
export const GGSCI_CITATION = {
  text: 'Xiao N. ggsci: Scientific Journal and Sci-Fi Themed Color Palettes for ggplot2. R package.',
  url: 'https://nanx.me/ggsci/',
  repository: 'https://github.com/nanxstats/ggsci',
  vignette: 'https://nanx.me/ggsci/articles/ggsci.html',
} as const;

/** Where the colours of the news and organisation palettes are collected. */
export const DATAWRAPPER_CITATION = {
  text: 'Muth LC. Colors for data vis style guides. Datawrapper Blog, 30 March 2022 (title taken from the address; not verified).',
  url: 'https://www.datawrapper.de/blog/colors-for-data-vis-style-guides',
} as const;

/**
 * Colour sets of published data-visualisation style guides (newspapers, agencies and companies; the names say whose guide a palette follows, not that it is theirs), from the data-visualisation style guides collected in the Datawrapper article
 * "Colors for data vis style guides" (Muth LC, 30 March 2022; https://www.datawrapper.de/blog/colors-for-data-vis-style-guides) and the guides it cites.
 * Values printed as HEX in a guide are exact; those read from an image are approximate (each description says which). One entry per variant.
 */
const PUBLISHER_PALETTES: ReadonlyArray<Omit<Palette, 'group'>> = [
  { id: 'yougov-style-original-categorical', name: 'YouGov-style, original categorical', description: 'The earlier six-color set, before the revision described in the article. Colour values: exact, article HTML.', colors: ['#DB4C81', '#897BD3', '#73C3C5', '#FFD13C', '#1770B8', '#EF2026'] },
  { id: 'yougov-style-likert-scale', name: 'YouGov-style, Likert scale', description: 'Survey-response example; darker endpoint first, with the neutral center preserved. Colour values: exact, article HTML.', colors: ['#DB4C81', '#D59AB2', '#DDDDDD', '#B8B0E5', '#897CD3'] },
  { id: 'eurostat-style', name: 'Eurostat-style', description: 'Consolidated from the main color and three combinations; extended blue occupies the primary position. Colour values: combined, source values & samples.', colors: ['#2571B6', '#1BAFAC', '#1BA4E1', '#F7A432', '#F1642F', '#5EB14A', '#B8C032', '#C44C94', '#D63846'] },
  { id: 'economist-style', name: 'Economist-style', description: 'The nine main colors; its separate shade ramps are left out. Colour values: exact, printed HEX.', colors: ['#DB444B', '#006BA2', '#3EBCD2', '#379A8B', '#EBB434', '#B4BA39', '#9A607F', '#D1B07C', '#758D99'] },
  { id: 'economist-style-red-shades', name: 'Economist-style, red shades', description: 'Equal-lightness shade ramp of the 2017 chart style guide, dark to light. Colour values: exact, printed HEX (as listed in a catalog of the article; not checked against the guide itself).', colors: ['#A81829', '#C7303C', '#E64E53', '#FF6B6C', '#FF8785', '#FFA39F'] },
  { id: 'economist-style-blue-shades', name: 'Economist-style, blue shades', description: 'Equal-lightness shade ramp of the 2017 chart style guide, dark to light. Colour values: exact, printed HEX (as listed in a catalog of the article; not checked against the guide itself).', colors: ['#00588D', '#1270A8', '#3D89C3', '#5DA4DF', '#7BBFFC', '#98DAFF'] },
  { id: 'economist-style-cyan-shades', name: 'Economist-style, cyan shades', description: 'Equal-lightness shade ramp of the 2017 chart style guide, dark to light. Colour values: exact, printed HEX (as listed in a catalog of the article; not checked against the guide itself).', colors: ['#005F73', '#00788D', '#0092A7', '#25ADC2', '#4EC8DE', '#6FE4FB'] },
  { id: 'economist-style-green-shades', name: 'Economist-style, green shades', description: 'Equal-lightness shade ramp of the 2017 chart style guide, dark to light. Colour values: exact, printed HEX (as listed in a catalog of the article; not checked against the guide itself).', colors: ['#005F52', '#00786B', '#2E9284', '#4DAD9E', '#69C9B9', '#86E5D4'] },
  { id: 'economist-style-yellow-shades', name: 'Economist-style, yellow shades', description: 'Equal-lightness shade ramp of the 2017 chart style guide, dark to light. Colour values: exact, printed HEX (as listed in a catalog of the article; not checked against the guide itself).', colors: ['#714C00', '#8D6300', '#AA7C00', '#C89608', '#E7B030', '#FFCB4D'] },
  { id: 'economist-style-olive-shades', name: 'Economist-style, olive shades', description: 'Equal-lightness shade ramp of the 2017 chart style guide, dark to light. Colour values: exact, printed HEX (as listed in a catalog of the article; not checked against the guide itself).', colors: ['#4C5900', '#667100', '#818A00', '#9DA521', '#BAC03F', '#D7DB5A'] },
  { id: 'economist-style-purple-shades', name: 'Economist-style, purple shades', description: 'Equal-lightness shade ramp of the 2017 chart style guide, dark to light. Colour values: exact, printed HEX (as listed in a catalog of the article; not checked against the guide itself).', colors: ['#78405F', '#925977', '#AD7291', '#C98CAC', '#E6A6C7', '#FFC2E3'] },
  { id: 'economist-style-gold-shades', name: 'Economist-style, gold shades', description: 'Equal-lightness shade ramp of the 2017 chart style guide, dark to light. Colour values: exact, printed HEX (as listed in a catalog of the article; not checked against the guide itself).', colors: ['#674E1F', '#826636', '#9D7F4E', '#B99966', '#D5B480', '#F2CF9A'] },
  { id: 'economist-style-grey-shades', name: 'Economist-style, grey shades', description: 'Equal-lightness shade ramp of the 2017 chart style guide, dark to light. Colour values: exact, printed HEX (as listed in a catalog of the article; not checked against the guide itself).', colors: ['#3F5661', '#576E79', '#6F8793', '#89A2AE', '#A4BDC9', '#BFD8E5'] },
  { id: 'financial-times-style', name: 'Financial Times-style', description: 'Colors sampled from the article’s wheel, without an official usage order. Colour values: approximate, image sample.', colors: ['#858585', '#CDC0B7', '#999088', '#AECE69', '#77983D', '#8DD4E6', '#108DCF', '#1B538D', '#F985AF', '#7F012E', '#E86390', '#B52E5A', '#F57782', '#CF3239'] },
  { id: 'new-america-style', name: 'New America-style', description: 'Primary positions first, then additional illustrated shades; close matches appear only once. Colour values: combined, source values & samples.', colors: ['#F1535C', '#1C86DD', '#37BBB3', '#4F4B71', '#AB5E17', '#858585', '#7D430F', '#4F2A08', '#C1874F', '#239277', '#2FC7A3', '#77DCC5', '#135B4B', '#7DA5E2', '#39619E', '#4E83D8', '#AEA3F7', '#CCC3F9', '#B82336', '#FD677A', '#731621'] },
  { id: 'the-times-style', name: 'The Times-style', description: 'Primary positions first, followed by remaining illustrated shades. Colour values: combined, source values & samples.', colors: ['#F37E41', '#3391A3', '#DFA944', '#7FB1DE', '#EC5459', '#6C3B5E', '#858585', '#977F7C', '#DAD0C6', '#F7C173', '#254151'] },
  { id: 'quartz-style', name: 'Quartz-style', description: 'Pink and blue first, followed by supporting shades. Colour values: combined, source values & samples.', colors: ['#D168B9', '#228FD7', '#333333', '#666666', '#858585', '#BEBEBE', '#57B5E4', '#154765', '#0C639D', '#6F3D5D', '#D091B6', '#AA5B86'] },
  { id: 'mckinsey-style-blue-focused-redesign', name: 'McKinsey-style, blue-focused redesign', description: 'The revised palette plus illustrated shades; primary positions first. Colour values: combined, source values & samples.', colors: ['#2247E1', '#1CA8F1', '#4096B1', '#ACE5EF', '#061C2D', '#D0D0D0', '#8B5EC5', '#A9C2FF', '#828282', '#959696', '#8DC4D6', '#42BDF1', '#0A4A6D', '#C1C5C9', '#AE8ED7', '#CBB5E6'] },
  { id: 'mckinsey-style-earlier-multicolor-palette', name: 'McKinsey-style, earlier multicolor palette', description: 'The historical palette shown before the blue-focused redesign. Colour values: exact, article HTML.', colors: ['#EE8000', '#00919E', '#4BB660', '#9DAC3A', '#0057A2', '#BB0A1C', '#92601D', '#9257A3', '#2EBAEC', '#0A3659'] },
  { id: 'eurofound-style-six-main-colors', name: 'Eurofound-style, six main colors', description: 'The primary categorical set, using the HEX labels printed in the figure. Colour values: exact, printed HEX.', colors: ['#7DC462', '#0D95D0', '#E72F52', '#774FA0', '#EFB743', '#D44627'] },
  { id: 'eurofound-style-extended-order-1-12', name: 'Eurofound-style, extended order · 1–12', description: 'First twelve positions in the illustrated 36-color sequence. Colour values: approximate, image sample.', colors: ['#5B8F4A', '#106E9A', '#AD243B', '#563B72', '#C38639', '#A03422', '#6BA857', '#1581B4', '#D02C49', '#654587', '#DB9C44', '#B93D28'] },
  { id: 'eurofound-style-extended-order-13-24', name: 'Eurofound-style, extended order · 13–24', description: 'Middle twelve positions; the original sequence is preserved. Colour values: approximate, image sample.', colors: ['#7FC367', '#1E96CE', '#E53355', '#77529E', '#EEB64F', '#D2472F', '#98CC84', '#5CA6D5', '#E9646D', '#8B6EAD', '#F0C272', '#DA6C49'] },
  { id: 'eurofound-style-extended-order-25-36', name: 'Eurofound-style, extended order · 25–36', description: 'Final twelve positions; the original sequence is preserved. Colour values: approximate, image sample.', colors: ['#B1D7A0', '#85B8DD', '#ED8A88', '#A18BBF', '#F3CF91', '#E18C6D', '#CAE3BE', '#ABCCE8', '#F3AEA9', '#BBABD2', '#F7DEB3', '#EAAE94'] },
  { id: 'mailchimp-style-categorical-combination-1', name: 'Mailchimp-style, categorical combination 1', description: 'The first combination explicitly listed in the article. Colour values: exact, article HTML.', colors: ['#F97F50', '#4F135E', '#99C7EF', '#FAD173', '#A4296F'] },
  { id: 'mailchimp-style-categorical-combination-2', name: 'Mailchimp-style, categorical combination 2', description: 'The second combination explicitly listed in the article. Colour values: exact, article HTML.', colors: ['#FAD173', '#99C7EF', '#DE4D14', '#83249F', '#FA8CF8'] },
  { id: 'npr-style', name: 'NPR-style', description: 'The five colors shown for non-party data graphics. Colour values: exact, article HTML.', colors: ['#E38D2D', '#17807F', '#295570', '#D8482E', '#EFC637'] },
  { id: 'bloomberg-style-visual-data-example', name: 'Bloomberg-style, visual data example', description: 'Six colors linked by the article to a social post. Colour values: exact, article HTML.', colors: ['#050505', '#8116B7', '#02FB2F', '#F5C816', '#02F7E1', '#FD028C'] },
  { id: 'bloomberg-style-fashion-industry', name: 'Bloomberg-style, fashion industry', description: 'Five colors from the cited graphic on environmental impact. Colour values: exact, article HTML.', colors: ['#0000FF', '#FB61D7', '#FBB03C', '#00C094', '#FDED22'] },
  { id: 'bloomberg-style-russia-europe-oil', name: 'Bloomberg-style, Russia–Europe oil', description: 'Five colors from the cited February 2022 graphic about oil dependence. Colour values: exact, article HTML.', colors: ['#000001', '#00AEFF', '#CCCCCC', '#FF008C', '#FFC403'] },
  { id: 'nzz-style', name: 'NZZ-style', description: 'Seven colors described for future visualizations at the time of publication. Colour values: exact, article HTML.', colors: ['#374E8E', '#4FBBAE', '#DF7C18', '#AD004F', '#2D87A9', '#E3B13E', '#CE4632'] },
  { id: 'cfpb-style', name: 'CFPB-style', description: 'Original colors first, followed by the added warm colors and blues. Colour values: combined, exact article HEX.', colors: ['#AEDB94', '#30A34C', '#80B8E6', '#1274CB', '#8BB6B5', '#297676', '#B5ACA6', '#63574F', '#FEC67E', '#DA732B', '#E2B1CC', '#9F2068', '#E59E90', '#CF422C', '#A6B6CF', '#274E85'] },
  { id: 'urban-institute-style', name: 'Urban Institute-style', description: 'Six unique colors from the guide’s illustrated combinations; original category roles remain source-specific. Colour values: combined, exact article HEX.', colors: ['#1696D2', '#000000', '#FDBF11', '#DB2B27', '#A2D4EC', '#0A4C6A'] },
  { id: 'oha-style-main-categorical', name: 'OHA-style, main categorical', description: 'Seven named colors from the style guide. Colour values: exact, printed HEX.', colors: ['#2057A7', '#1E87A5', '#C43D4D', '#F2BC40', '#8980CB', '#287C6F', '#E07653'] },
  { id: 'oha-style-light-counterparts', name: 'OHA-style, light counterparts', description: 'Lighter companions to the seven main colors, in matching order. Colour values: exact, printed HEX.', colors: ['#BFDDFF', '#83DBFB', '#FF939A', '#FFDDA2', '#DFD3FF', '#7ECFC0', '#FFCAA2'] },
  { id: 'new-york-times-style', name: 'New York Times-style', description: 'A collection of colors used across different graphics, rather than a single recommended combination. Colour values: approximate, image sample.', colors: ['#858585', '#D81412', '#EB9B90', '#FB743B', '#F5580E', '#FF8C2E', '#7F3B00', '#D8A97C', '#F4C17E', '#FDCB81', '#F7ED86', '#F8E71B', '#F7F5C3', '#F7F7E9', '#AEB985', '#F1F8D8', '#A1AD95', '#A2CF7E', '#90C4AC', '#B7D5CB', '#639685', '#6DCED2', '#8EB8BA', '#46AFC6', '#C9ECF6', '#00C6FF', '#52A0B8', '#6ED1F6', '#8FD8F4', '#3995C8', '#8FCAED', '#7D92A1', '#006FBF', '#769FBE', '#4799F0', '#5957A6', '#AAA6BB', '#B3ABCE', '#7F71AE', '#DBD4E7', '#7D6A89', '#D6ACE0', '#FF3EAF', '#D70958', '#BB7B92', '#E989A0'] },
  { id: 'dallas-morning-news-style', name: 'Dallas Morning News-style', description: 'The darker colors recommended for bars and lines in the historical stylebook. Colour values: exact, article HTML.', colors: ['#BB1018', '#4B94B0', '#D4CFA3', '#D1AB55', '#677D61'] },
  { id: 'cato-style', name: 'Cato-style', description: 'Blue and pink pair presented critically in the article, not as its recommended alternative. Colour values: exact, article HTML.', colors: ['#0976B1', '#C1145C'] },
];

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
    id: 'igv', group: 'Software and design systems', name: 'IGV', source: 'ggsci',
    description: 'Chromosome colours of the Integrative Genomics Viewer (ggsci pal_igv, "default"). The first ten are shown first; the palette has 51 entries (49 different).',
    colors: [
      '#5050FF', '#CE3D32', '#749B58', '#F0E685', '#466983', '#BA6338', '#5DB1DD', '#802268', '#6BD76B', '#D595A7',
      '#924822', '#837B8D', '#C75127', '#D58F5C', '#7A65A5', '#E4AF69', '#3B1B53', '#CDDEB7', '#612A79', '#AE1F63',
      '#E7C76F', '#5A655E', '#CC9900', '#99CC00', '#A9A9A9', '#CC9900', '#99CC00', '#33CC00', '#00CC33', '#00CC99',
      '#0099CC', '#0A47FF', '#4775FF', '#FFC20A', '#FFD147', '#990033', '#991A00', '#996600', '#809900', '#339900',
      '#00991A', '#009966', '#008099', '#003399', '#1A0099', '#660099', '#990080', '#D60047', '#FF1463', '#00D68F', '#14FFB1',
    ],
  },
  ...PUBLISHER_PALETTES.map((x): Palette => ({ ...x, group: 'Published styles' })),
  // The app's own palettes, kept so that charts saved with them still open.
  { id: 'vibrant', group: 'Other', name: 'Vibrant', colors: ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#42d4f4'] },
  { id: 'pastel', group: 'Other', name: 'Pastel', colors: ['#aec7e8', '#ffbb78', '#98df8a', '#ff9896', '#c5b0d5', '#c49c94'] },
  // Okabe & Ito (2008), designed to stay distinguishable under common colour-vision deficiencies.
  { id: 'colorblind', group: 'Other', name: 'Colorblind-friendly', description: 'Okabe & Ito (2008): stays distinguishable under common colour-vision deficiencies.', colors: ['#0072b2', '#e69f00', '#009e73', '#cc79a7', '#56b4e9', '#d55e00'] },
  // Darkest first, like Black and White.
  { id: 'monochrome', group: 'Other', name: 'Monochrome', colors: ['#08306b', '#2171b5', '#4292c6', '#6baed6', '#9ecae1', '#c6dbef'] },
  // Darkest first, so the first data set is the strongest.
  { id: 'classic', group: 'Other', name: 'Black and White', colors: ['#595959', '#737373', '#a6a6a6', '#bfbfbf', '#d9d9d9', '#f2f2f2'] },
  { id: 'retro', group: 'Other', name: 'Retro', description: 'Beige, orange, red, teal and dark blues.', colors: ['#D3B897', '#E5720F', '#D41D0D', '#317475', '#1A5877', '#10243B'] },
  { id: 'warm-cool', group: 'Other', name: 'Warm and cool', description: 'Six moderately saturated colours spanning warm and cool hues.', colors: ['#A4553B', '#9D3A5E', '#5D7A2B', '#2C8168', '#4269A0', '#FF9444'] },
];

/** The palette a new chart starts with: the first in the list (Science). */
export const DEFAULT_PALETTE_ID = 'aaas';

export const paletteById = (id: string | null): Palette | undefined => PALETTES.find((p) => p.id === id);

/** Colour of the data set at `index`; the palette repeats when there are more data sets than colours. */
export const paletteColor = (palette: Palette, index: number): string => palette.colors[index % palette.colors.length];

/** What each subcategory of the menu holds. */
export const PALETTE_GROUP_INFO: Record<PaletteGroup, string> = {
  Journals: 'Colours modelled on the figures of scientific and medical journals, so that a chart looks at home next to them.',
  'Software and design systems': 'Categorical colours of visualisation libraries, design systems and a genome browser (IGV), made to keep many categories apart on a screen.',
  'Published styles': 'Colours of published data-visualisation style guides, one entry per variant, named after the organisation whose guide it follows. Values printed in a style guide are exact; those read from an image are approximate.',
  Other: 'The palettes of the app itself: bright, pastel, a colour-vision-safe one (Okabe & Ito), single-hue, grey, retro, and warm and cool.',
};

/** The palettes of one subcategory, in menu order. */
export const palettesInGroup = (group: PaletteGroup): Palette[] => PALETTES.filter((p) => p.group === group);
