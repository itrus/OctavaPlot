import type { Chart } from '../../model/types';
import { keyWidthOf, LEGEND_KEY } from '../shared/parts/layout';
import { measureText } from '../shared/parts/text';
import type { ChartDrawing } from '../shared/scene/SceneChart';
import type { SceneElement } from '../shared/scene/sceneElement';

/** The master legend of a page: the entries of the legends of its graphs, merged; and where each stands in its band. Pure; the drawing is in layoutExport. */

/** One entry of a graph's legend as the graph drew it: its key and its name, at the place in the graph, with what is needed to move and scale it. */
export interface LegendEntry {
  /** The index of the panel it comes from (its ids, fill patterns for instance, are the ones of that graph). */
  panel: number;
  label: string;
  /** What makes two entries one: the name and the look of the key, without where it stands. */
  signature: string;
  fontFamily: string;
  /** Size of the legend text in the graph, pt. */
  fontSizePt: number;
  /** Width of the key and the gap before the name, pt, in the graph. */
  keyPt: number;
  /** Width of the name, pt, in the graph. */
  nameWidthPt: number;
  /** Where the key begins and the vertical centre of the entry in the graph; the entry is moved from here. */
  originX: number;
  originY: number;
  /** The key and the text as the graph drew them. */
  nodes: ReadonlyArray<SceneElement>;
}

const num = (v: string | number | undefined): number => (typeof v === 'number' ? v : Number(v));
const attr = (node: SceneElement, name: string): string | number | undefined => node.attrs?.find(([n]) => n === name)?.[1];

/** Attributes that say where a shape is, not what it looks like: left out of the signature, so that the same key at two places is one. */
const PLACE = new Set(['x', 'y', 'cx', 'cy', 'x1', 'x2', 'y1', 'y2', 'transform']);

/** The look of a key: its elements and their attributes, without their places; a path is reduced to its commands and number of numbers. */
function lookOf(node: SceneElement): unknown {
  return [
    node.tag,
    (node.attrs ?? []).filter(([n, v]) => v !== undefined && !PLACE.has(n)).map(([n, v]) => (n === 'd' ? [n, String(v).replace(/[^A-Za-z]/g, ''), (String(v).match(/-?\d*\.?\d+/g) ?? []).length] : [n, v])),
    (node.children ?? []).map(lookOf),
  ];
}

/**
 * The entries of the legend of a drawing, in the order the graph lists them; none when the graph has no legend. Each entry is the
 * group the graph drew for it: keys and the text last. The text says where the entry stands (its x is the key's width and gap to the right of the key).
 */
export function legendEntriesOf(chart: Chart, drawing: ChartDrawing, panel: number): LegendEntry[] {
  const legend = drawing.sections.flatMap((s) => ('nodes' in s ? s.nodes : [])).find((n) => n.id === 'legend');
  if (!legend) return [];
  const key = keyWidthOf(chart.legend);
  return (legend.children ?? []).flatMap((entry): LegendEntry[] => {
    const text = (entry.children ?? []).find((c) => c.tag === 'text');
    if (!text || text.text === undefined) return [];
    const fontSizePt = num(attr(text, 'font-size'));
    if (!Number.isFinite(fontSizePt) || fontSizePt <= 0) return [];
    const keys = (entry.children ?? []).filter((c) => c !== text);
    return [
      {
        panel,
        label: text.text,
        signature: JSON.stringify([text.text, attr(text, 'fill'), key, keys.map(lookOf)]),
        fontFamily: chart.fontFamily,
        fontSizePt,
        keyPt: key + LEGEND_KEY.gap,
        nameWidthPt: measureText(text.text, fontSizePt, false, false, chart.fontFamily),
        originX: num(attr(text, 'x')) - key - LEGEND_KEY.gap,
        originY: num(attr(text, 'y')),
        nodes: entry.children ?? [],
      },
    ];
  });
}

/** The entries of several graphs as one list: in the order of the panels, each name and look once. */
export const mergeLegendEntries = (lists: ReadonlyArray<readonly LegendEntry[]>): LegendEntry[] => {
  const seen = new Set<string>();
  return lists.flat().filter((e) => (seen.has(e.signature) ? false : (seen.add(e.signature), true)));
};

/** The gap between two entries of a row, pt at the page's size. */
const ENTRY_GAP = 28;
/** The height of a row, as a share of the text size (the one of the graphs' legends). */
const ROW_SHARE = 1.55;

interface PlacedEntry {
  entry: LegendEntry;
  /** The left of the key and the vertical centre of the entry, pt, from the top left of the legend. */
  x: number;
  y: number;
  /** Scale of the entry from the graph to the page: the page's text size over the graph's. */
  scale: number;
}

export interface MasterLegendLayout {
  items: PlacedEntry[];
  /** Size of the legend block, pt; 0 × 0 when there are no entries. */
  widthPt: number;
  heightPt: number;
}

/**
 * Sets the entries out at a text size: along the bottom, in rows that wrap at `maxWidthPt`; or on the right, one under the other.
 * Rows are left-aligned in the block; the block is placed by the caller.
 */
export function layoutMasterLegend(entries: readonly LegendEntry[], fontSizePt: number, position: 'bottom' | 'right', maxWidthPt: number): MasterLegendLayout {
  if (entries.length === 0) return { items: [], widthPt: 0, heightPt: 0 };
  const rowHeight = fontSizePt * ROW_SHARE;
  const widths = entries.map((e) => (e.keyPt + e.nameWidthPt) * (fontSizePt / e.fontSizePt));
  const items: PlacedEntry[] = [];
  let x = 0;
  let row = 0;
  let widest = 0;
  entries.forEach((entry, i) => {
    // A row wraps when the next entry would pass the width; an entry alone in a row stays (a long name is not cut).
    const wraps = position === 'right' || (x > 0 && x + widths[i] > maxWidthPt);
    if (wraps && x > 0) {
      row += 1;
      x = 0;
    }
    items.push({ entry, x, y: (row + 0.5) * rowHeight, scale: fontSizePt / entry.fontSizePt });
    x += widths[i] + ENTRY_GAP;
    widest = Math.max(widest, x - ENTRY_GAP);
  });
  return { items, widthPt: widest, heightPt: (row + 1) * rowHeight };
}
