import { useState } from 'react';
import { useApp } from '../../../state/AppContext';
import type { InspectorPage } from '../../../state/inspectorNav';
import { PAGES, type Part } from './nav';

/**
 * The page of the rail an inspector shows, and the tab of that page when it has several. A click on the chart sends it to the
 * settings of what was clicked; a page the panel does not list is ignored. `lacks` are the parts this panel has no settings for.
 * `shows(part)` tells whether the page and tab in view draw a part of the settings.
 */
export function useInspectorNav(pages: readonly InspectorPage[], lacks: readonly Part[] = []) {
  const { inspectorNav } = useApp();
  const [page, setPage] = useState<InspectorPage>(pages.includes('plot') ? 'plot' : pages[0]);
  const [chosen, setChosen] = useState<Partial<Record<InspectorPage, Part>>>({});
  const [seenNav, setSeenNav] = useState(inspectorNav.n);
  if (seenNav !== inspectorNav.n) {
    setSeenNav(inspectorNav.n);
    const t = inspectorNav.target;
    if (t && pages.includes(t.page)) {
      setPage(t.page);
      if (t.part) setChosen({ ...chosen, [t.page]: t.part });
    }
  }
  const current = pages.includes(page) ? page : pages.includes('plot') ? 'plot' : pages[0];
  const parts = (PAGES.find((p) => p.id === current)?.parts ?? []).filter((p) => !lacks.includes(p.id));
  const wanted = chosen[current];
  const part = parts.find((p) => p.id === wanted)?.id ?? parts[0]?.id;
  return {
    page: current,
    setPage,
    pages,
    parts,
    part,
    setPart: (p: Part) => setChosen({ ...chosen, [current]: p }),
    shows: (p: Part) => p === part,
  };
}
