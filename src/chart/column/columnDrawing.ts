import type { Chart } from '../../model/types';
import { visibleAnnotations } from '../shared/scene/annotations';
import type { ChartDrawing } from '../shared/scene/SceneChart';
import { compileColumnScene } from './columnChrome';
import { compileColumnLabels, compileColumnMarks, compileColumnPointLabels, compileColumnSelection } from './columnMarks';
import type { ColumnModel } from './columnModel';

/**
 * What a chart over columns is drawn from, in order: the chrome behind the data, the marks (clipped to the plotting region),
 * the labels of the bars, the chrome in front, the labels of single points (outside the clip), then the annotations. The
 * editor adds the selection marks.
 */
export function columnDrawing(chart: Chart, model: ColumnModel): ChartDrawing {
  const scene = model.scene ?? compileColumnScene(chart, model);
  return {
    widthPt: model.widthPt,
    heightPt: model.heightPt,
    sections: [
      { nodes: scene.defs },
      { nodes: scene.back },
      { nodes: scene.marks ?? compileColumnMarks(chart, model) },
      { nodes: compileColumnLabels(chart, model) },
      { nodes: scene.front },
      { nodes: compileColumnPointLabels(chart, model) },
      { annotations: visibleAnnotations(chart.annotations, chart.hiddenLayerIds) },
    ],
    selection: (s) => compileColumnSelection(model, s.groupId, s.pointId),
  };
}
