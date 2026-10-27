import type { Chart } from '../../model/types';
import { visibleAnnotations } from '../shared/scene/annotations';
import { backgroundElements, plotClipElement, titleElements } from '../shared/scene/chrome';
import type { ChartDrawing } from '../shared/scene/SceneChart';
import { compileHeatMarks, heatAxisLabelElements } from './heatMarks';
import type { HeatModel } from './heatmapModel';

/** What a heat map is drawn from, in order: the clip and backgrounds, the cells, numbers and colour bar, the labels of the rows and columns, the titles, then the annotations. */
export function heatDrawing(chart: Chart, model: HeatModel): ChartDrawing {
  const { widthPt: W, heightPt: H, layout } = model;
  return {
    widthPt: W,
    heightPt: H,
    sections: [
      { nodes: [plotClipElement(layout.plot)] },
      { nodes: backgroundElements(chart, W, H, layout.plot) },
      { nodes: model.marks ?? compileHeatMarks(chart, model) },
      { nodes: heatAxisLabelElements(chart, model) },
      { nodes: titleElements(chart, layout, chart.xAxis, chart.yAxis) },
      { annotations: visibleAnnotations(chart.annotations, chart.hiddenLayerIds) },
    ],
  };
}
