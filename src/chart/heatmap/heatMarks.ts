import type { LayerSpec } from '../../model/graph/layers';
import type { Chart } from '../../model/types';
import { n2 } from '../../model/units';
import type { HeatCell, HeatModel } from './heatmapModel';
import { el, type SceneElement } from '../shared/scene/sceneElement';
import { svgId } from '../shared/scene/svgIds';
import { measureText } from '../shared/parts/text';
import { numberStartPt } from '../../model/graph/axis';
import { X_TICK_LABEL_GAP, Y_TICK_LABEL_GAP } from '../shared/parts/layout';

const SMALLEST_LABEL_PT = 8;

/**
 * The font size at which a cell's text fits both its width and its height, or null when even the smallest legible size does
 * not fit: a label that cannot be read is left out (its value stays in the tooltip), not squeezed or spilled over the neighbours.
 */
export function fitCellLabel(text: string, widthPt: number, heightPt: number, maxFontPt: number, family?: string): number | null {
  const room = Math.min(maxFontPt, heightPt * 0.8);
  if (!(room >= SMALLEST_LABEL_PT) || !(widthPt > 0)) return null;
  const wide = measureText(text, room, false, false, family);
  const size = wide <= widthPt * 0.95 ? room : (room * widthPt * 0.95) / wide;
  return size >= SMALLEST_LABEL_PT ? size : null;
}

/** The mark of a cell of a special kind: lines or an outline over it, in the colour of the text on it, never taking a click from the cell. */
function cellMark(c: HeatCell): SceneElement[] {
  if (c.mark === 'none' || !(c.width > 0 && c.height > 0)) return [];
  const stroke = c.textColour;
  const [x0, y0, x1, y1] = [c.x, c.y, c.x + c.width, c.y + c.height];
  if (c.mark === 'outline') {
    const inset = Math.min(1, c.width / 4, c.height / 4);
    return [el('rect', [['x', n2(x0 + inset)], ['y', n2(y0 + inset)], ['width', n2(c.width - 2 * inset)], ['height', n2(c.height - 2 * inset)], ['fill', 'none'], ['stroke', stroke], ['stroke-width', 1.5], ['pointer-events', 'none']])];
  }
  const d = c.mark === 'cross' ? `M${n2(x0)},${n2(y0)}L${n2(x1)},${n2(y1)}M${n2(x0)},${n2(y1)}L${n2(x1)},${n2(y0)}` : `M${n2(x0)},${n2(y1)}L${n2(x1)},${n2(y0)}`;
  return [el('path', [['d', d], ['stroke', stroke], ['stroke-width', 1], ['fill', 'none'], ['pointer-events', 'none']])];
}

/** The title of the colour bar, above it and shrunk to the room at the right (left out when it cannot be read there). */
function heatBarTitle(chart: Chart, model: HeatModel, bar: NonNullable<HeatModel['bar']>): SceneElement[] {
  if (bar.title === null) return [];
  const size = fitCellLabel(bar.title, model.widthPt - bar.rect.x - 4, Infinity, chart.legend.fontSizePt, chart.fontFamily);
  return size === null ? [] : [el('text', [['x', n2(bar.rect.x)], ['y', n2(Math.max(size, bar.rect.y - 6))], ['font-size', n2(size)], ['fill', chart.textColor]], { text: bar.title })];
}

/**
 * The marks of a heat map as scene elements, in the order of the chart's layers (model.layers): the cells, the numbers in them
 * and the colour bar. A layer hidden by its ID draws nothing. Every mark has an id made from its layer and the cell it draws (the
 * series and the row, so it follows the cell when the map is transposed), the same whatever the style.
 */
export function compileHeatMarks(chart: Chart, model: HeatModel): SceneElement[] {
  const hidden = new Set(chart.hiddenLayerIds);
  const { cells, bar } = model;

  const elementsOf = (layer: LayerSpec): SceneElement[] => {
    switch (layer.kind) {
      case 'bars':
        return cells.flatMap((c) => [el('rect', [['x', n2(c.x)], ['y', n2(c.y)], ['width', n2(c.width)], ['height', n2(c.height)], ['fill', c.fill]], { hit: { kind: 'bar', groupId: c.seriesId, objectId: c.id }, id: svgId(layer.id, c.obsId ?? c.id) }), ...cellMark(c)]);
      case 'labels':
        return cells.flatMap((c) => {
          const size = c.text ? fitCellLabel(c.text, c.width, c.height, chart.legend.fontSizePt, chart.fontFamily) : null;
          return c.text && size !== null ? [el('text', [['x', n2(c.x + c.width / 2)], ['y', n2(c.y + c.height / 2)], ['dy', '0.35em'], ['text-anchor', 'middle'], ['font-size', n2(size)], ['fill', c.textColour], ['pointer-events', 'none']], { text: c.text, id: svgId(layer.id, c.obsId ?? c.id) })] : [];
        });
      case 'colourBar':
        return bar
          ? [
              el('g', [], {
                id: svgId(layer.id),
                children: [
                  ...bar.strips.map((s) => el('rect', [['x', n2(bar.rect.x)], ['y', n2(s.y)], ['width', n2(bar.rect.width)], ['height', n2(s.height)], ['fill', s.fill]])),
                  el('rect', [['x', n2(bar.rect.x)], ['y', n2(bar.rect.y)], ['width', n2(bar.rect.width)], ['height', n2(bar.rect.height)], ['fill', 'none'], ['stroke', chart.axisColor], ['stroke-width', 1.5]]),
                  ...heatBarTitle(chart, model, bar),
                  ...bar.ticks.map((t) =>
                    el('g', [], {
                      children: [
                        el('path', [['d', `M${n2(bar.rect.x + bar.rect.width)},${n2(t.y)}h6`], ['stroke', chart.axisColor], ['stroke-width', 1.5], ['fill', 'none']]),
                        el('text', [['x', n2(bar.rect.x + bar.rect.width + 12)], ['y', n2(t.y)], ['dy', '0.35em'], ['font-size', chart.legend.fontSizePt], ['fill', chart.textColor]], { text: String(Number(t.value.toPrecision(6))) }),
                      ],
                    }),
                  ),
                ],
              }),
            ]
          : [];
      default:
        return [];
    }
  };

  return model.layers.flatMap((layer) => (hidden.has(layer.id) ? [] : elementsOf(layer)));
}

/**
 * The labels of the rows (on the left) and of the columns (along the bottom, turned when they are crowded) of a heat map as scene
 * elements, with the axis they belong to as their hit target. Each axis is drawn only when it is visible.
 */
export function heatAxisLabelElements(chart: Chart, model: HeatModel): SceneElement[] {
  const { plot } = model.layout;
  const xa = chart.xAxis;
  const ya = chart.yAxis;
  const bottom = model.colLabelY;
  const rows = ya.visible
    ? model.rowLabelAt.map(({ text: label, index: i, at }) =>
        el('text', [['x', n2(plot.x - numberStartPt(ya) - Y_TICK_LABEL_GAP)], ['y', n2(at)], ['dy', '0.35em'], ['text-anchor', 'end'], ['font-size', ya.tickFontSizePt], ['font-weight', ya.tickBold ? 'bold' : undefined], ['fill', chart.textColor]], { text: label, hit: { kind: 'axis', objectId: 'y' }, id: svgId('row-label', i) }),
      )
    : [];
  const cols = xa.visible
    ? model.colLabelAt.map(({ text: label, index: i, at: x }) => {
        const y = bottom + numberStartPt(xa) + X_TICK_LABEL_GAP + xa.tickFontSizePt * 0.8;
        const common = [['font-size', xa.tickFontSizePt], ['font-weight', xa.tickBold ? 'bold' : undefined], ['fill', chart.textColor]] as const;
        const opts = { text: label, hit: { kind: 'axis' as const, objectId: 'x' }, id: svgId('col-label', i) };
        if (!model.layout.xTickRotated) return el('text', [['x', n2(x)], ['y', n2(y)], ['text-anchor', 'middle'], ...common], opts);
        const ry = n2(y - xa.tickFontSizePt * 0.4);
        return el('text', [['x', n2(x)], ['y', ry], ['text-anchor', 'end'], ['transform', `rotate(-45 ${n2(x)} ${ry})`], ...common], opts);
      })
    : [];
  return [...rows, ...cols];
}
