import type { LayerSpec } from '../../model/graph/layers';
import type { Chart } from '../../model/types';
import { n2 } from '../../model/units';
import { SELECT_COLOR, visibleAnnotations } from '../shared/scene/annotations';
import type { PieModel } from './pieModel';
import { legendElements, backgroundElements, plotClipElement, titleElements } from '../shared/scene/chrome';
import { el, type SceneElement } from '../shared/scene/sceneElement';
import { svgId } from '../shared/scene/svgIds';
import { annotationPlacer } from '../shared/scene/annotationPlace';
import type { ChartDrawing } from '../shared/scene/SceneChart';

/**
 * The marks of a pie or doughnut chart as scene elements, in the order of the chart's layers (model.layers): the slices of each
 * part (outcome) across all the pies, the text beside the slices, and the total of the pie (it has no title of its own: the chart's title names it). A layer hidden by its ID
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
            ...(pie.totalText
              ? [
                  pie.totalInHole
                    ? el('text', [['x', n2(pie.cx)], ['y', n2(pie.cy)], ['dy', '0.35em'], ['text-anchor', 'middle'], ['font-size', fontPt], ['fill', chart.textColor]], { text: pie.totalText, id: svgId(layer.id, name, 'total') })
                    : el('text', [['x', n2(pie.totalAt.x)], ['y', n2(pie.totalAt.y)], ['text-anchor', 'middle'], ['font-size', fontPt], ['fill', chart.textColor]], { text: pie.totalText, id: svgId(layer.id, name, 'total') }),
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

/** The legend of a pie or doughnut chart as scene elements: a key in the colours of each part, and its name. Nothing without a legend. */
export function pieLegendElements(chart: Chart, model: PieModel): SceneElement[] {
  return legendElements(chart, model.layout, (it, w) => {
    const part = model.parts[model.legendParts[it.index]];
    const st = part.style;
    return { groupId: part.groupId, keys: [el('rect', [['x', n2(it.x)], ['y', n2(it.y - 10)], ['width', w], ['height', 20], ['fill', st.barFill], ['fill-opacity', st.barOpacity], ['stroke', st.barBorderColor], ['stroke-width', st.barBorderWidthPt], ['stroke-opacity', st.barBorderOpacity < 1 ? st.barBorderOpacity : undefined]], { id: svgId('legend', part.groupId) })] };
  });
}

/** What a pie or doughnut chart is drawn from, in order: the clip and backgrounds, the slices and their text, the titles, the annotations, then the legend. */
export function pieDrawing(chart: Chart, model: PieModel): ChartDrawing {
  const { widthPt: W, heightPt: H, layout } = model;
  return {
    widthPt: W,
    heightPt: H,
    sections: [
      { nodes: [plotClipElement(layout.plot)] },
      { nodes: backgroundElements(chart, W, H, layout.plot) },
      { nodes: model.marks ?? compilePieMarks(chart, model) },
      { nodes: titleElements(chart, layout, chart.xAxis, chart.yAxis) },
      { annotations: visibleAnnotations(chart.annotations, chart.hiddenLayerIds), drawings: chart.drawings, place: annotationPlacer({ family: 'pie', model }, W, H).place },
      { nodes: pieLegendElements(chart, model) },
    ],
  };
}
