import type { Chart } from '../../model/types';
import { visibleAnnotations } from '../shared/scene/annotations';
import type { ChartDrawing } from '../shared/scene/SceneChart';
import { compileGroupedScene } from './groupedChrome';
import type { GroupedModel } from './groupedModel';
import { compileGroupedLabels, compileGroupedMarks } from './groupedMarks';

/** What a grouped or contingency chart is drawn from, in order: the chrome behind the data, the marks, the labels of the bars, the chrome in front, then the annotations. */
export function groupedDrawing(chart: Chart, model: GroupedModel): ChartDrawing {
  const scene = model.scene ?? compileGroupedScene(chart, model);
  return {
    widthPt: model.widthPt,
    heightPt: model.heightPt,
    sections: [
      { nodes: scene.defs },
      { nodes: scene.back },
      { nodes: scene.marks ?? compileGroupedMarks(chart, model) },
      { nodes: compileGroupedLabels(chart, model) },
      { nodes: scene.front },
      { annotations: visibleAnnotations(chart.annotations, chart.hiddenLayerIds) },
    ],
  };
}
