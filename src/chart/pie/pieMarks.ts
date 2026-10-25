import type { LayerSpec } from '../../model/graph/layers';
import type { Chart } from '../../model/types';
import { n2 } from '../../model/units';
import { SELECT_COLOR } from '../shared/scene/ChartParts';
import type { PieModel } from './pieModel';
import { el, type SceneElement } from '../shared/scene/sceneElement';
import { svgId } from '../shared/scene/svgIds';

/**
 * The marks of a pie or doughnut chart as scene elements, in the order of the chart's layers (model.layers): the slices of each
 * part (outcome) across all the pies, the text beside the slices, and the title and total of each pie. A layer hidden by its ID
 * draws nothing. Every mark has an id made from its layer and the cell or row it draws, the same whatever the style. What shows
 * only while a data set is selected (the dashed outline of its slices) carries its ID (`whenSelected`).
 */
export function compilePieMarks(chart: Chart, model: PieModel): SceneElement[] {
  const hidden = new Set(chart.hiddenLayerIds);
  const fontPt = chart.xAxis.tickFontSizePt;

  const elementsOf = (layer: LayerSpec): SceneElement[] => {
    const group = layer.binding?.seriesId;
    switch (layer.kind) {
      case 'bars':
        return model.pies.flatMap((pie) =>
          pie.slices.flatMap((s) => {
            if (s.groupId !== group || s.path === '') return [];
            const st = s.style;
            return [
              el('path', [['d', s.path], ['fill', st.barFill], ['fill-opacity', st.barOpacity], ['fill-rule', 'evenodd'], ['stroke', st.barBorderColor], ['stroke-width', st.barBorderWidthPt], ['stroke-opacity', st.barBorderOpacity < 1 ? st.barBorderOpacity : undefined], ['stroke-linejoin', 'round']], { hit: { kind: 'bar', groupId: s.groupId, objectId: s.id }, id: svgId(layer.id, s.obsId ?? s.id) }),
              el('path', [['data-editor-only', 'true'], ['d', s.path], ['fill', 'none'], ['stroke', SELECT_COLOR], ['stroke-width', 3], ['stroke-dasharray', '6 4'], ['pointer-events', 'none']], { whenSelected: s.groupId }),
            ];
          }),
        );
      case 'labels':
        return model.pies.flatMap((pie) =>
          pie.slices.flatMap((s) => (s.groupId === group && s.text ? [el('text', [['x', n2(s.text.x)], ['y', n2(s.text.y)], ['dy', '0.35em'], ['text-anchor', s.text.anchor], ['font-size', chart.legend.fontSizePt], ['fill', chart.textColor]], { text: s.text.content, id: svgId(layer.id, s.obsId ?? s.id) })] : [])),
        );
      case 'titles':
        return model.pies.flatMap((pie) => {
          const name = pie.rowId ?? String(pie.row);
          return [
            el('text', [['x', n2(pie.titleAt.x)], ['y', n2(pie.titleAt.y)], ['text-anchor', 'middle'], ['font-size', fontPt], ['font-weight', chart.xAxis.tickBold ? 'bold' : undefined], ['fill', chart.textColor]], { text: pie.title, id: svgId(layer.id, name, 'title') }),
            ...(pie.totalText
              ? [
                  pie.totalInHole
                    ? el('text', [['x', n2(pie.cx)], ['y', n2(pie.cy)], ['dy', '0.35em'], ['text-anchor', 'middle'], ['font-size', fontPt], ['fill', chart.textColor]], { text: pie.totalText, id: svgId(layer.id, name, 'total') })
                    : el('text', [['x', n2(pie.titleAt.x)], ['y', n2(pie.titleAt.y + fontPt * 1.3)], ['text-anchor', 'middle'], ['font-size', fontPt], ['fill', chart.textColor]], { text: pie.totalText, id: svgId(layer.id, name, 'total') }),
                ]
              : []),
          ];
        });
      default:
        return [];
    }
  };

  return model.layers.flatMap((layer) => (hidden.has(layer.id) ? [] : elementsOf(layer)));
}
