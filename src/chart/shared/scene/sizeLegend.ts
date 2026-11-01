import { n2 } from '../../../model/units';
import { measureText } from '../parts/text';
import { el, type SceneElement } from './sceneElement';

/**
 * The size legend of a bubble chart: a row under the plot with circles of chosen sizes and their numbers, drawn on the one scale of the
 * chart (the area of a bubble follows its size, so the diameter of a circle of size v is the largest bubble's times the square root of v
 * over the largest size). Pure: the model gives the sizes and the symbol size, the scene draws the row.
 */

export interface SizeKey {
  /** What the row is called: the name of the size column. */
  title: string;
  items: Array<{ value: number; diameterPt: number; label: string }>;
  /** The room the row needs under the plot, pt. */
  heightPt: number;
  fontSizePt: number;
}

/** The most sizes a legend shows. */
export const MAX_LEGEND_SIZES = 6;

const GAP_KEY_LABEL = 5;
const GAP_ITEMS = 16;

/** Sizes of the legend when the owner chose none: the three round values (1, 2 or 5 times a power of ten) at and below the largest size, smallest first. */
export function niceSizes(largest: number): number[] {
  if (!(largest > 0) || !Number.isFinite(largest)) return [];
  const k = Math.floor(Math.log10(largest));
  const values: number[] = [];
  for (let e = k; e >= k - 2 && values.length < 3; e--) {
    for (const m of [5, 2, 1]) {
      const v = Number((m * 10 ** e).toPrecision(12));
      if (v <= largest * (1 + 1e-12) && values.length < 3) values.push(v);
    }
  }
  return values.reverse();
}

/** A number as written in the legend: no more digits than needed, no exponent for the sizes bubbles have. */
export const sizeLabel = (v: number): string => String(Number(v.toPrecision(10)));

/**
 * The key of a bubble chart, or null when there is nothing to show (no valid size). `chosen` are the sizes the owner typed (any number above
 * 0, shown from the smallest); none means the round values below the largest.
 */
export function sizeKeyOf(options: { chosen: readonly number[]; largest: number; symbolSizePt: number; title: string; fontSizePt: number }): SizeKey | null {
  const { chosen, largest, symbolSizePt, title, fontSizePt } = options;
  if (!(largest > 0) || !(symbolSizePt > 0)) return null;
  const values = chosen.length > 0 ? [...new Set(chosen.filter((v) => Number.isFinite(v) && v > 0))].sort((a, b) => a - b).slice(0, MAX_LEGEND_SIZES) : niceSizes(largest);
  if (values.length === 0) return null;
  const items = values.map((value) => ({ value, diameterPt: symbolSizePt * Math.sqrt(value / largest), label: sizeLabel(value) }));
  const tallest = Math.max(...items.map((i) => i.diameterPt));
  return { title: title.trim() === '' ? 'Size' : title, items, heightPt: Math.max(tallest + 10, fontSizePt * 1.8), fontSizePt };
}

/** The row as scene elements, centred on `centreX` and on the middle of the room `y` to `y + heightPt`: the title, then each circle with its number. */
export function sizeKeyElements(key: SizeKey, centreX: number, y: number, color: string, fontFamily: string): SceneElement[] {
  const width = (text: string) => measureText(text, key.fontSizePt, false, false, fontFamily);
  const titleWidth = width(key.title);
  const total = titleWidth + key.items.reduce((sum, i) => sum + GAP_ITEMS + i.diameterPt + GAP_KEY_LABEL + width(i.label), 0);
  const mid = y + key.heightPt / 2;
  let x = centreX - total / 2;
  const children: SceneElement[] = [el('text', [['x', n2(x)], ['y', n2(mid)], ['dy', '0.35em'], ['text-anchor', 'start'], ['font-size', key.fontSizePt], ['fill', color]], { id: 'size-legend-title', text: key.title })];
  x += titleWidth;
  key.items.forEach((item, i) => {
    x += GAP_ITEMS;
    children.push(el('circle', [['cx', n2(x + item.diameterPt / 2)], ['cy', n2(mid)], ['r', n2(item.diameterPt / 2)], ['fill', 'none'], ['stroke', color], ['stroke-width', 1]], { id: `size-legend-key-${i}` }));
    x += item.diameterPt + GAP_KEY_LABEL;
    children.push(el('text', [['x', n2(x)], ['y', n2(mid)], ['dy', '0.35em'], ['text-anchor', 'start'], ['font-size', key.fontSizePt], ['fill', color]], { id: `size-legend-label-${i}`, text: item.label }));
    x += width(item.label);
  });
  return [el('g', [], { id: 'size-legend', children })];
}
