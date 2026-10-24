import type { Project, ViewRef } from './types';

/** The pages of the project in the order of the navigator: tables, results, graphs, layouts. */
export function viewOrder(p: Project): ViewRef[] {
  return [
    ...p.dataTables.map((t): ViewRef => ({ kind: 'table', id: t.id })),
    ...(p.analyses ?? []).map((a): ViewRef => ({ kind: 'analysis', id: a.id })),
    ...p.charts.map((c): ViewRef => ({ kind: 'chart', id: c.id })),
    ...(p.layouts ?? []).map((l): ViewRef => ({ kind: 'layout', id: l.id })),
  ];
}

const same = (a: ViewRef, b: ViewRef) => a.kind === b.kind && a.id === b.id;

/**
 * Where to go when the page on screen is gone (deleted, or its creation undone): the page above it in the navigator, which
 * is the last page of the section above when it was the first of its own; failing that the page below it; failing that the
 * first table. `before` is the project as it was while the page still existed.
 */
export function viewAfterRemoval(before: Project, now: Project, gone: ViewRef): ViewRef {
  const was = viewOrder(before);
  const exists = new Set(viewOrder(now).map((v) => `${v.kind}:${v.id}`));
  const at = was.findIndex((v) => same(v, gone));
  if (at >= 0) {
    for (let i = at - 1; i >= 0; i--) if (exists.has(`${was[i].kind}:${was[i].id}`)) return was[i];
    for (let i = at + 1; i < was.length; i++) if (exists.has(`${was[i].kind}:${was[i].id}`)) return was[i];
  }
  return { kind: 'table', id: now.dataTables[0].id };
}
