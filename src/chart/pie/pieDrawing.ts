import type { Chart } from '../../model/types';
import { visibleAnnotations } from '../shared/scene/annotations';
import { annotationPlacer } from '../shared/scene/annotationPlace';
import { backgroundElements, plotClipElement, titleElements } from '../shared/scene/chrome';
import type { ChartDrawing } from '../shared/scene/SceneChart';
import { compilePieMarks, pieLegendElements } from './pieMarks';
import type { PieModel } from './pieModel';

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
      { annotations: visibleAnnotations(chart.annotations, chart.hiddenLayerIds), place: annotationPlacer({ family: 'pie', model }, W, H).place },
      { nodes: pieLegendElements(chart, model) },
    ],
  };
}
