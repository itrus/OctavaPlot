import type { HitTarget } from '../../../chart/shared/scene/hitTest';
import type { Chart } from '../../../model/types';
import { chartFamily } from '../../../model/graph/chartTypes';
import { useEffect, useLayoutEffect, useRef, useState, type UIEvent } from 'react';
import { useNavigation } from '../../../state/AppContext';
import { recallPlace, rememberPlace, type InspectorPage, type InspectorTarget } from '../../../state/inspectorNav';

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
    case 'referenceLine':
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

/**
 * A field that should take the keyboard when it next appears: set by the place that creates something (the Text tool of a graph makes
 * an annotation), taken once by the field of that thing when it is drawn (the annotation's text box), so that typing replaces "Text".
 */
let pending: string | null = null;

export function focusWhenShown(key: string): void {
  pending = key;
}

/** True once for the key that was asked for; the request is then used up. */
export function takeFocusRequest(key: string): boolean {
  if (pending !== key) return false;
  pending = null;
  return true;
}

/**
 * The page of the rail an inspector shows, and the tab of that page when it has several. A click on the chart sends it to the
 * settings of what was clicked; a page the panel does not list is ignored. `lacks` are the parts this panel has no settings for.
 * `shows(part)` tells whether the page and tab in view draw a part of the settings.
 *
 * The place is kept for each graph (`graphId`): the inspector is built again when a table is opened and the graph comes back, and
 * it then shows the page and the tab it was left on, scrolled as far as it was (see state/inspectorMemory.ts).
 */
export function useInspectorNav(graphId: string, pages: readonly InspectorPage[], lacks: readonly Part[] = []) {
  const { inspectorNav } = useNavigation();
  // Read once, when the inspector is built: the place it is left at is written below.
  const [left] = useState(() => recallPlace(graphId));
  const [page, setPage] = useState<InspectorPage>(left && pages.includes(left.page) ? left.page : pages.includes('graph') ? 'graph' : pages[0]);
  const [chosen, setChosen] = useState<Partial<Record<InspectorPage, Part>>>(left?.parts ?? {});
  const [seenNav, setSeenNav] = useState(inspectorNav.n);
  if (seenNav !== inspectorNav.n) {
    setSeenNav(inspectorNav.n);
    const t = inspectorNav.target;
    if (t && pages.includes(t.page)) {
      setPage(t.page);
      if (t.part) setChosen({ ...chosen, [t.page]: t.part });
    }
  }
  const current = pages.includes(page) ? page : pages.includes('graph') ? 'graph' : pages[0];
  const parts = (PAGES.find((p) => p.id === current)?.parts ?? []).filter((p) => !lacks.includes(p.id));
  const wanted = chosen[current];
  const part = parts.find((p) => p.id === wanted)?.id ?? parts[0]?.id;

  useEffect(() => rememberPlace(graphId, { page: current, parts: chosen }), [graphId, current, chosen]);
  // The settings are scrolled to where they were left, once, before the first paint; after that the scroll is noted as it moves.
  const scrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (left && scrollRef.current) scrollRef.current.scrollTop = left.scrollTop;
  }, [left]);

  return {
    page: current,
    setPage,
    pages,
    parts,
    part,
    setPart: (p: Part) => setChosen({ ...chosen, [current]: p }),
    shows: (p: Part) => p === part,
    graphId,
    scrollRef,
    onScroll: (e: UIEvent<HTMLDivElement>) => rememberPlace(graphId, { scrollTop: e.currentTarget.scrollTop }),
  };
}
