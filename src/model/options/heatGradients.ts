/**
 * The colour gradients of heat maps: 16 continuous scales from the ggsci R package (Xiao N.; https://github.com/nanxstats/ggsci) and 6 sampled from the
 * default sequential gradients pictured in a Datawrapper article (Muth LC, 30 March 2022; approximate), each a list of colour stops from the low end to the
 * high end of the scale. The published gradients run dark to light, the ggsci ones light to dark (Reverse the colours flips either). GSEA and the two
 * ColorBrewer maps (RdBu, BrBG) are diverging. Added: three colour maps of the viridis family and the two ColorBrewer maps, 11 stops each, as supplied.
 */

interface HeatGradient {
  value: string;
  family: 'GSEA' | 'Bootstrap 5' | 'Material Design' | 'Published' | 'Viridis family' | 'ColorBrewer';
  name: string;
  diverging: boolean;
  colors: readonly string[];
}

const g = (value: string, family: HeatGradient['family'], name: string, colors: readonly string[], diverging = false): HeatGradient => ({ value, family, name, diverging, colors });

export const HEAT_GRADIENTS: readonly HeatGradient[] = [
  g('gsea', 'GSEA', 'Default', ['#4500AD', '#2700D1', '#6B58EF', '#8888FF', '#C7C1FF', '#D5D5FF', '#FFC0E5', '#FF8989', '#FF7080', '#FF5A5A', '#EF4040', '#D60C00'], true),
  g('bs-blue', 'Bootstrap 5', 'Blue', ['#CFE2FF', '#9EC5FE', '#6EA8FE', '#3D8BFD', '#0D6EFD', '#0A58CA', '#084298', '#052C65', '#031633']),
  g('bs-indigo', 'Bootstrap 5', 'Indigo', ['#E0CFFC', '#C29FFA', '#A370F7', '#8540F5', '#6610F2', '#520DC2', '#3D0A91', '#290661', '#140330']),
  g('bs-purple', 'Bootstrap 5', 'Purple', ['#E2D9F3', '#C5B3E6', '#A98EDA', '#8C68CD', '#6F42C1', '#59359A', '#432874', '#2C1A4D', '#160D27']),
  g('bs-pink', 'Bootstrap 5', 'Pink', ['#F7D6E6', '#EFADCE', '#E685B5', '#DE5C9D', '#D63384', '#AB296A', '#801F4F', '#561435', '#2B0A1A']),
  g('bs-red', 'Bootstrap 5', 'Red', ['#F8D7DA', '#F1AEB5', '#EA868F', '#E35D6A', '#DC3545', '#B02A37', '#842029', '#58151C', '#2C0B0E']),
  g('bs-orange', 'Bootstrap 5', 'Orange', ['#FFE5D0', '#FECBA1', '#FEB272', '#FD9843', '#FD7E14', '#CA6510', '#984C0C', '#653208', '#331904']),
  g('bs-yellow', 'Bootstrap 5', 'Yellow', ['#FFF3CD', '#FFE69C', '#FFDA6A', '#FFCD39', '#FFC107', '#CC9A06', '#997404', '#664D03', '#332701']),
  g('bs-green', 'Bootstrap 5', 'Green', ['#D1E7DD', '#A3CFBB', '#75B798', '#479F76', '#198754', '#146C43', '#0F5132', '#0A3622', '#051B11']),
  g('bs-teal', 'Bootstrap 5', 'Teal', ['#D2F4EA', '#A6E9D5', '#79DFC1', '#4DD4AC', '#20C997', '#1AA179', '#13795B', '#0D503C', '#06281E']),
  g('bs-cyan', 'Bootstrap 5', 'Cyan', ['#CFF4FC', '#9EEAF9', '#6EDFF6', '#3DD5F3', '#0DCAF0', '#0AA2C0', '#087990', '#055160', '#032830']),
  g('bs-gray', 'Bootstrap 5', 'Gray', ['#F8F9FA', '#E9ECEF', '#DEE2E6', '#CED4DA', '#ADB5BD', '#6C757D', '#495057', '#343A40', '#212529']),
  g('md-red', 'Material Design', 'Red', ['#FFEBEE', '#FFCDD2', '#EF9A9A', '#E57373', '#EF5350', '#F44336', '#E53935', '#D32F2F', '#C62828', '#B71C1C']),
  g('md-pink', 'Material Design', 'Pink', ['#FCE4EC', '#F8BBD0', '#F48FB1', '#F06292', '#EC407A', '#E91E63', '#D81B60', '#C2185B', '#AD1457', '#880E4F']),
  g('md-purple', 'Material Design', 'Purple', ['#F3E5F5', '#E1BEE7', '#CE93D8', '#BA68C8', '#AB47BC', '#9C27B0', '#8E24AA', '#7B1FA2', '#6A1B9A', '#4A148C']),
  g('md-deep-purple', 'Material Design', 'Deep purple', ['#EDE7F6', '#D1C4E9', '#B39DDB', '#9575CD', '#7E57C2', '#673AB7', '#5E35B1', '#512DA8', '#4527A0', '#311B92']),

  g('pub-green', 'Published', 'Green', ['#3D892C', '#4C933A', '#629F4A', '#77AB5A', '#8AB76A', '#9DC27A', '#B0CD8A', '#C4D89B', '#D6E4AC', '#E9EFBE', '#FCFACF']),
  g('pub-blue', 'Published', 'Blue', ['#244C8B', '#2E5D9A', '#356FA9', '#4280B5', '#5393BE', '#65A6C4', '#7CB9C5', '#98CBC1', '#B4DDC1', '#D2EBD5', '#EFF8E6']),
  g('pub-purple-pink', 'Published', 'Purple–pink', ['#701473', '#91217D', '#B23387', '#CD4E93', '#E06D9F', '#E98AAB', '#EDA2B5', '#F0B5BC', '#F4C6C3', '#F7D9D2', '#F9ECE3']),
  g('pub-blue-teal-yellow', 'Published', 'Blue–teal–yellow', ['#28358E', '#3557A1', '#447BB0', '#5499BA', '#66B0BF', '#7BBFBF', '#93CBBD', '#AED9BA', '#CDE7B9', '#E5F4C5', '#FEFED1']),
  g('pub-purple-orange-yellow', 'Published', 'Purple–orange–yellow', ['#0C0881', '#3A0E8D', '#681B93', '#8E2E8C', '#AD467D', '#C7606C', '#D97D60', '#E49955', '#EEB850', '#F0D754', '#F1F658']),
  g('pub-magma', 'Published', 'Magma', ['#29125B', '#4C1D6A', '#6F2A73', '#923974', '#B44B6F', '#D16069', '#E27E6D', '#EA9F7C', '#F2BF8E', '#F8DDA9', '#FCFBC3']),

  g('cm-viridis', 'Viridis family', 'Violet–green–yellow · Viridis', ['#440154', '#482475', '#414487', '#355F8D', '#2A788E', '#21918C', '#22A884', '#44BF70', '#7AD151', '#BDDF26', '#FDE725']),
  g('cm-cividis', 'Viridis family', 'Blue–yellow · Cividis', ['#00224E', '#083370', '#35456C', '#4F576C', '#666970', '#7D7C78', '#948E77', '#AEA371', '#C8B866', '#E5CF52', '#FEE838']),
  g('cm-inferno', 'Viridis family', 'Black–orange–yellow · Inferno', ['#000004', '#160B39', '#420A68', '#6A176E', '#932667', '#BC3754', '#DD513A', '#F37819', '#FCA50A', '#F6D746', '#FCFFA4']),
  g('cb-rdbu', 'ColorBrewer', 'Red–blue · RdBu', ['#67001F', '#B2182B', '#D6604D', '#F4A582', '#FDDBC7', '#F7F7F7', '#D1E5F0', '#92C5DE', '#4393C3', '#2166AC', '#053061'], true),
  g('cb-brbg', 'ColorBrewer', 'Brown–teal · BrBG', ['#543005', '#8C510A', '#BF812D', '#DFC27D', '#F6E8C3', '#F5F5F5', '#C7EAE5', '#80CDC1', '#35978F', '#01665E', '#003C30'], true),
];

/** Names of the five earlier colour scales, so that files saved with them still open with the nearest of the new ones. */
export const LEGACY_HEAT_PALETTES: Readonly<Record<string, string>> = {
  viridis: 'bs-blue',
  magma: 'bs-purple',
  blue: 'bs-blue',
  greenred: 'gsea',
  grayscale: 'bs-gray',
};
