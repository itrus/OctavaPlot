import type { LayerSpec } from '../../model/graph/layers';
import type { Chart } from '../../model/types';
import { n2 } from '../../model/units';
import type { HeatModel } from './heatmapModel';
import { el, type SceneElement } from '../shared/scene/sceneElement';
import { svgId } from '../shared/scene/svgIds';
import { measureText } from '../shared/parts/text';

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
        return cells.map((c) => el('rect', [['x', n2(c.x)], ['y', n2(c.y)], ['width', n2(c.width)], ['height', n2(c.height)], ['fill', c.fill]], { hit: { kind: 'bar', groupId: c.seriesId, objectId: c.id }, id: svgId(layer.id, c.obsId ?? c.id) }));
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
