import type { Chart } from '../../model/types';
import { visibleAnnotations } from '../shared/scene/annotations';
import type { ChartDrawing } from '../shared/scene/SceneChart';
import type { XyModel } from './xyModel';
import { compileXyScene, compileXySelection } from './xyScene';

/** What an XY, survival, histogram or distribution chart is drawn from, in order: the chrome behind the data, the data layers (clipped), the chrome in front, then the annotations. */
export function xyDrawing(chart: Chart, model: XyModel): ChartDrawing {
  const scene = model.scene ?? compileXyScene(chart, model);
  return {
    widthPt: model.widthPt,
    heightPt: model.heightPt,
    sections: [
      { nodes: scene.defs },
      { nodes: scene.back },
      { xyData: scene },
      { nodes: scene.front },
      // Layers can be taken out of the drawing by ID only in a chart drawn from layers.
      { annotations: visibleAnnotations(chart.annotations, model.layers ? chart.hiddenLayerIds : []) },
    ],
    selection: (s) => compileXySelection(model, s.pointId),
  };
}
