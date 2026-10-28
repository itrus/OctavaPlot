import type { Chart } from '../../model/types';
import type { ColumnModel } from './columnModel';
import type { ChromeScene } from '../shared/scene/scene';
import { compileCategoryChrome, lineAndSymbolKeys } from '../shared/scene/categoryChrome';
import { referenceLinesOf } from '../shared/scene/referenceLines';
import { keyMarkElement } from '../shared/parts/fillElements';
import { bracketElements } from '../shared/parts/brackets';
import { el } from '../shared/scene/sceneElement';

/** The chrome of a chart of columns (bar, scatter, mean, box, violin, floating, paired). */
export function compileColumnScene(chart: Chart, model: ColumnModel): ChromeScene {
  const y2a = chart.y2Axis;
  // model.y2 is null while no data set is bound to the right axis; a hidden right axis draws nothing.
  const y2 = model.y2 && model.y2Scale && y2a.visible ? { scale: model.y2, map: model.y2Scale } : null;
  return compileCategoryChrome(chart, {
    widthPt: model.widthPt,
    heightPt: model.heightPt,
    layout: model.layout,
    orient: model.orient,
    y: model.y,
    yScale: model.yScale,
    y2,
    categories: model.groups.map((g) => ({ key: g.groupId, centerX: g.centerX, label: g.label })),
    // The comparison brackets stand in front of the data; one whose layer is hidden is not drawn.
    extraFront: bracketElements(model.brackets, model.orient, new Set(chart.hiddenLayerIds)),
    // A reference line that is hidden by its layer is not drawn.
    references: referenceLinesOf(chart, { family: 'column', model }).placed.filter((l) => !chart.hiddenLayerIds.includes(`${l.line.id}:referenceLine`)),
    keysOf: (it, w) => {
      const g = model.groups[model.legendGroups[it.index]];
      // A bar is a filled key; the others are the line and the symbol, together in a group.
      return { groupId: g.groupId, keys: g.style.showBars ? [keyMarkElement(g.style, it.x, it.y, chart.id, g.groupId, w)] : [el('g', [], { children: lineAndSymbolKeys(g.style, it.x, it.y, w) })] };
    },
  });
}
