import type { Id } from './types';

/** The ways the order of the data sets on a graph can be changed (the buttons of the Data Sets on Graph tab). */
export type MoveOp = 'top' | 'up' | 'down' | 'bottom' | 'reverse';

/** Items in the order asked for: those named in `order` first, in that order; any others after them in their own order. */
export function applyOrder<T extends { id: Id }>(items: readonly T[], order: readonly Id[]): T[] {
  if (order.length === 0) return [...items];
  const byId = new Map(items.map((i) => [i.id, i]));
  const listed: T[] = [];
  const used = new Set<Id>();
  for (const id of order) {
    const item = byId.get(id);
    if (item && !used.has(id)) {
      listed.push(item);
      used.add(id);
    }
  }
  return [...listed, ...items.filter((i) => !used.has(i.id))];
}

/** The order after moving one data set (or reversing all of them). `ids` is the current order; an unknown id changes nothing. */
export function moveGroup(ids: readonly Id[], id: Id, op: MoveOp): Id[] {
  const out = [...ids];
  if (op === 'reverse') return out.reverse();
  const i = out.indexOf(id);
  if (i < 0) return out;
  out.splice(i, 1);
  const to = op === 'top' ? 0 : op === 'bottom' ? out.length : op === 'up' ? Math.max(0, i - 1) : Math.min(out.length, i + 1);
  out.splice(to, 0, id);
  return out;
}

/** Stored order from a file or a patch: only ids as text. */
export function sanitizeOrder(raw: unknown): Id[] {
  return Array.isArray(raw) ? [...new Set(raw.filter((id): id is string => typeof id === 'string'))] : [];
}
