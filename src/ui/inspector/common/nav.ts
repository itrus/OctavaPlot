import type { HitTarget } from '../../../chart/shared/scene/hitTest';
import type { InspectorPage, InspectorTarget } from '../../../state/inspectorNav';
import type { Chart } from '../../../model/types';
import { chartFamily } from '../../../model/graph/chartTypes';

/** The inspector page that holds the settings of a clicked chart element; null when it has none (the background). */
export function inspectorTargetFor(hit: HitTarget): InspectorTarget | null {
  switch (hit.kind) {
    case 'bar':
    case 'point':
    case 'error':
    case 'line':
    case 'meanLine':
    case 'label':
      return { page: 'plot' };
    case 'legend':
      return { page: 'legend' };
    case 'axis':
      return { page: 'axes' };
    case 'title':
      return { page: 'graph', part: 'text' };
    case 'annotation':
    case 'drawing':
    case 'handle':
      return { page: 'notes' };
    default:
      return null;
  }
}

/** The parts of the settings an inspector draws; a page of the rail shows one or several of them one after the other. */
export type Part = 'type' | 'style' | 'datasets' | 'analysis' | 'axes' | 'frame' | 'text' | 'layout' | 'legend' | 'annotations' | 'export';

/** A page of the rail: its title, and its parts, which are shown one at a time under an underlined tab strip when it has several. */
export const PAGES: Array<{ id: InspectorPage; label: string; title: string; heading?: string; parts: ReadonlyArray<{ id: Part; label: string }> }> = [
  { id: 'graph', label: 'Graph', title: 'Graph: type, size and titles', parts: [{ id: 'type', label: 'Type' }, { id: 'layout', label: 'Layout' }, { id: 'text', label: 'Titles' }] },
  { id: 'plot', label: 'Plot', title: 'Plot: the look of the data sets and the frame', parts: [{ id: 'style', label: 'Style' }, { id: 'frame', label: 'Frame' }, { id: 'datasets', label: 'Data sets' }] },
  { id: 'axes', label: 'Axes', title: 'Axes: scales, ticks and grid', parts: [{ id: 'axes', label: 'Axes' }] },
  { id: 'legend', label: 'Legend', title: 'Legend', parts: [{ id: 'legend', label: 'Legend' }] },
  { id: 'analysis', label: 'Analysis', title: 'Analysis: summary, error bars and fits', parts: [{ id: 'analysis', label: 'Analysis' }] },
  { id: 'notes', label: 'Notes', title: 'Notes: texts, shapes and guides', parts: [{ id: 'annotations', label: 'Notes' }] },
  { id: 'export', label: 'Export', title: 'Export this graph as a picture or a vector file', heading: 'Export Graph', parts: [{ id: 'export', label: 'Export' }] },
];

/**
 * The pages of the rail a graph of this type has, and the tabs its panel has no settings for. The panels (Xy, Column, Histogram, Pie, Heatmap)
 * and the Format menu both read it, so the menu offers exactly what the panel draws.
 */
export function inspectorShapeOf(type: Chart['type']): { pages: InspectorPage[]; lacks: Part[] } {
  const all: InspectorPage[] = ['graph', 'plot', 'axes', 'legend', 'analysis', 'notes', 'export'];
  switch (chartFamily(type)) {
    case 'pie':
      return { pages: ['graph', 'plot', 'legend', 'notes', 'export'], lacks: ['datasets', 'frame'] };
    case 'heatmap':
      return { pages: ['graph', 'plot', 'notes', 'export'], lacks: ['datasets', 'frame', 'legend'] };
    case 'histogram':
      return { pages: ['graph', 'plot', 'axes', 'legend', 'notes', 'export'], lacks: [] };
    case 'column':
      return { pages: type === 'box' || type === 'violin' || type === 'floating' ? all : all.filter((p) => p !== 'analysis'), lacks: [] };
    default:
      return { pages: all, lacks: [] };
  }
}
