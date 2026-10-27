/**
 * The colour gradients of heat maps: 16 continuous scales from the ggsci R package (Xiao N.; https://github.com/nanxstats/ggsci),
 * each a list of colour stops from the low end to the high end of the scale. Only GSEA is diverging (its middle is the centre).
 */

export interface HeatGradient {
  value: string;
  family: 'GSEA' | 'Bootstrap 5' | 'Material Design';
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
];

/** Names of the five earlier colour scales, so that files saved with them still open with the nearest of the new ones. */
export const LEGACY_HEAT_PALETTES: Readonly<Record<string, string>> = {
  viridis: 'bs-blue',
  magma: 'bs-purple',
  blue: 'bs-blue',
  greenred: 'gsea',
  grayscale: 'bs-gray',
};
