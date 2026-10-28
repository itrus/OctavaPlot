import type { Chart } from '../../model/types';
import type { GroupedModel } from './groupedModel';
import type { ChromeScene } from '../shared/scene/scene';
import { compileCategoryChrome, lineAndSymbolKeys } from '../shared/scene/categoryChrome';
import { referenceLinesOf } from '../shared/scene/referenceLines';
import { el } from '../shared/scene/sceneElement';
import { n2 } from '../../model/units';

/** The chrome of a chart of grouped or contingency bars or lines. */
export function compileGroupedScene(chart: Chart, model: GroupedModel): ChromeScene {
  return compileCategoryChrome(chart, {
    widthPt: model.widthPt,
    heightPt: model.heightPt,
    layout: model.layout,
    orient: model.orient,
    y: model.y,
    yScale: model.yScale,
    y2: null,
    // Grouped by series: one tick and name for each column of each group; otherwise one for each category.
    categories: model.axisColumns ?? model.categories.map((cat) => ({ key: cat.row, centerX: cat.centerX, label: cat.label })),
    // A reference line that is hidden by its layer is not drawn.
    // The names of the factors: a rule under each cluster of bars, and its name centred below it.
    extraFront: model.factorLabels.flatMap((f) => [
      el('path', [['d', `M${n2(f.x1 + 1)},${n2(f.y + 1)}H${n2(f.x2 - 1)}`], ['fill', 'none'], ['stroke', chart.axisColor], ['stroke-width', 1], ['stroke-opacity', chart.axisOpacity < 1 ? chart.axisOpacity : undefined]]),
      el('text', [['x', n2((f.x1 + f.x2) / 2)], ['y', n2(f.y + 2 + chart.xAxis.tickFontSizePt * 0.9)], ['text-anchor', 'middle'], ['font-size', n2(f.fontPt)], ['font-weight', chart.xAxis.tickBold ? 'bold' : undefined], ['fill', chart.textColor]], { text: f.text }),
    ]),
    references: referenceLinesOf(chart, { family: 'grouped', model }).placed.filter((l) => !chart.hiddenLayerIds.includes(`${l.line.id}:referenceLine`)),
    keysOf: (it, w) => {
      const s = model.series[model.legendSeries[it.index]];
      const st = s.style;
      // Bars are a filled key; lines are the line and the symbol.
      const keys = !model.asLines
        ? [el('rect', [['x', n2(it.x)], ['y', n2(it.y - 10)], ['width', w], ['height', 20], ['fill', st.barFill], ['stroke', st.barBorderWidthPt > 0 ? st.barBorderColor : 'none'], ['stroke-width', st.barBorderWidthPt], ['stroke-opacity', st.barBorderOpacity < 1 ? st.barBorderOpacity : undefined]])]
        : lineAndSymbolKeys(st, it.x, it.y, w);
      return { groupId: s.groupId, keys };
    },
  });
}
