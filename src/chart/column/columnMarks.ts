import type { LayerKind, LayerSpec } from '../../model/graph/layers';
import type { Chart } from '../../model/types';
import { barMarkElement } from '../shared/parts/fillElements';
import type { ColumnModel, GroupGeom } from './columnModel';
import { el, type SceneElement } from '../shared/scene/sceneElement';
import { svgId } from '../shared/scene/svgIds';
import { symbolPath } from '../shared/parts/symbols';

/**
 * The data marks of a column chart (bars, boxes and violins, connectors, error bars, mean lines, points) as scene elements,
 * in drawing order, clipped to the plotting region: what the drawing of the screen, an export and the editor's hit-testing are
 * made from. The order is that of the chart's layers (model.layers); a layer hidden by its ID draws nothing. Horizontal charts
 * are the vertical drawing under one matrix; the points stay upright at their turned positions.
 */

/**
 * The shapes of a layer are drawn in one of three passes: the body (bars, box, violin), the lines (joins, error bars, mean lines)
 * and the points. Layers that follow each other in the same pass share one matrix group on a horizontal chart; the points are
 * not turned.
 */
const PASS: Partial<Record<LayerKind, 'body' | 'lines' | 'points'>> = { bars: 'body', distribution: 'body', pairLines: 'lines', line: 'lines', errorBars: 'lines', meanLine: 'lines', points: 'points' };

export function compileColumnMarks(chart: Chart, model: ColumnModel): SceneElement[] {
  const { groups, orient } = model;
  const hidden = new Set(chart.hiddenLayerIds);
  const groupOf = new Map(groups.map((g) => [g.groupId, g]));
  /** Shapes of the vertical drawing: under the matrix of a horizontal chart, as they are otherwise. */
  const turned = (children: SceneElement[]): SceneElement[] => (orient.matrix ? [el('g', [['transform', orient.matrix]], { children })] : children);

  const distOf = (g: GroupGeom): SceneElement[] => {
    if (!g.dist) return [];
    const hit = { kind: 'bar' as const, groupId: g.groupId, objectId: `${g.groupId}:bar` };
    return [
      el('g', [['fill', 'none']], {
        children: [
          ...(g.dist.outline && g.style.showBars
            ? [el('path', [['d', g.dist.outline], ['fill', g.style.barFill], ['fill-opacity', g.style.barOpacity], ['stroke', g.style.barBorderColor], ['stroke-width', g.style.barBorderWidthPt], ['stroke-opacity', g.style.barBorderOpacity < 1 ? g.style.barBorderOpacity : undefined], ['stroke-linejoin', 'round']], { hit })]
            : []),
          ...g.dist.lines.map((l) => el('path', [['d', l.d], ['stroke', l.color], ['stroke-width', l.strokeWidth], ['stroke-opacity', l.opacity < 1 ? l.opacity : undefined], ['stroke-dasharray', l.dash], ['stroke-linecap', 'butt']], { hit })),
        ],
      }),
    ];
  };

  /** The shapes of one layer; each has an id made from its layer (and the observation it draws), the same whatever the style. */
  const elementsOf = (layer: LayerSpec): SceneElement[] => {
    const g = layer.binding ? groupOf.get(layer.binding.seriesId) : undefined;
    const named = (e: SceneElement, ...part: Array<string | number>): SceneElement => ({ ...e, id: svgId(layer.id, ...part) });
    switch (layer.kind) {
      case 'bars':
        return g?.bar ? [named(barMarkElement(g.bar, chart.id))] : [];
      case 'distribution':
        return g ? distOf(g).map((e) => named(e)) : [];
      case 'pairLines':
        return model.pairLines.map((l) => named(el('path', [['d', l.d], ['fill', 'none'], ['stroke', l.color], ['stroke-width', l.strokeWidth], ['stroke-opacity', l.opacity < 1 ? l.opacity : undefined], ['stroke-linecap', 'round'], ['stroke-linejoin', 'round']]), 'pair', l.obsId ?? l.id));
      case 'line':
        return g?.connector ? [named(el('path', [['d', g.connector.d], ['fill', 'none'], ['stroke', g.connector.color], ['stroke-width', g.connector.strokeWidth], ['stroke-opacity', g.connector.opacity < 1 ? g.connector.opacity : undefined], ['stroke-linecap', 'round']], { hit: { kind: 'line', groupId: g.groupId, objectId: g.connector.id } }))] : [];
      case 'errorBars':
        return g?.errorBar
          ? [
              named(el('g', [], {
                hit: { kind: 'error', groupId: g.groupId, objectId: g.errorBar.id },
                children: [
                  el('path', [['d', g.errorBar.d], ['fill', 'none'], ['stroke', g.errorBar.color], ['stroke-width', g.errorBar.strokeWidth], ['stroke-opacity', g.errorBar.opacity < 1 ? g.errorBar.opacity : undefined], ['stroke-linecap', 'butt']]),
                  // In the editor a thin error bar also has a transparent twin to be hit by.
                  el('path', [['d', g.errorBar.d], ['fill', 'none'], ['stroke', 'transparent'], ['stroke-width', 16]], { editorOnly: true }),
                ],
              })),
            ]
          : [];
      case 'meanLine':
        return g?.meanLine ? [named(el('path', [['d', g.meanLine.d], ['fill', 'none'], ['stroke', g.meanLine.color], ['stroke-width', g.meanLine.strokeWidth], ['stroke-opacity', g.meanLine.opacity < 1 ? g.meanLine.opacity : undefined], ['stroke-linecap', 'butt']], { hit: { kind: 'meanLine', groupId: g.groupId, objectId: g.meanLine.id } }))] : [];
      case 'points':
        return (g?.points ?? []).map((p) => {
          const at = orient.toScreen(p.cx, p.cy);
          return named(el('path', [['d', symbolPath(p.shape, at.x, at.y, p.size)], ['fill', p.color], ['fill-opacity', p.fillOpacity < 1 ? p.fillOpacity : undefined], ['stroke', p.borderColor], ['stroke-width', p.borderWidth], ['stroke-opacity', p.borderOpacity < 1 ? p.borderOpacity : undefined]], { hit: { kind: 'point', groupId: g!.groupId, objectId: p.id } }), p.id);
        });
      default:
        return [];
    }
  };

  // The layers in drawing order; the ones that follow each other in the same pass are one run.
  const out: SceneElement[] = [];
  let run: { pass: 'body' | 'lines' | 'points'; items: SceneElement[] } | null = null;
  const flush = () => {
    if (run) out.push(...(run.pass === 'points' ? run.items : turned(run.items)));
    run = null;
  };
  for (const layer of model.layers) {
    const pass = PASS[layer.kind];
    if (!pass || hidden.has(layer.id)) continue;
    if (!run || run.pass !== pass) {
      flush();
      run = { pass, items: [] };
    }
    run.items.push(...elementsOf(layer));
  }
  flush();
  return [el('g', [['clip-path', 'url(#plot-clip)']], { children: out })];
}
