import { useEffect, useLayoutEffect, useRef, useState, type UIEvent } from 'react';
import { useApp } from '../../../state/AppContext';
import { recallPlace, rememberPlace, type InspectorPage } from '../../../state/inspectorNav';
import { PAGES, type Part } from './nav';

/**
 * The page of the rail an inspector shows, and the tab of that page when it has several. A click on the chart sends it to the
 * settings of what was clicked; a page the panel does not list is ignored. `lacks` are the parts this panel has no settings for.
 * `shows(part)` tells whether the page and tab in view draw a part of the settings.
 *
 * The place is kept for each graph (`graphId`): the inspector is built again when a table is opened and the graph comes back, and
 * it then shows the page and the tab it was left on, scrolled as far as it was (see state/inspectorMemory.ts).
 */
export function useInspectorNav(graphId: string, pages: readonly InspectorPage[], lacks: readonly Part[] = []) {
  const { inspectorNav } = useApp();
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
