import type { Id } from '../../model/types';

/** The items picked in a folder overview, and the one a range starts from. */
export interface PickState {
  picked: ReadonlySet<Id>;
  anchor: Id | null;
}

export const NOTHING_PICKED: PickState = { picked: new Set(), anchor: null };

/** What the keys held during a click say: Shift picks the range from the anchor, Ctrl or Cmd (or the check box) adds or drops one. */
export interface PickKeys {
  shift: boolean;
  toggle: boolean;
}

/**
 * The picks after a click on an item. `order` is the items as shown. A plain click picks that item alone; with Ctrl, Cmd or on
 * its check box it is added to the picks or taken out of them; with Shift the range from the anchor to it is picked (added to
 * the picks too when Ctrl is held).
 */
export function pick(order: readonly Id[], state: PickState, id: Id, keys: PickKeys): PickState {
  if (!order.includes(id)) return state;
  if (keys.shift) {
    const from = state.anchor !== null && order.includes(state.anchor) ? order.indexOf(state.anchor) : order.indexOf(id);
    const to = order.indexOf(id);
    const range = order.slice(Math.min(from, to), Math.max(from, to) + 1);
    return { picked: new Set([...(keys.toggle ? state.picked : []), ...range]), anchor: state.anchor !== null && order.includes(state.anchor) ? state.anchor : id };
  }
  if (keys.toggle) {
    const picked = new Set(state.picked);
    if (picked.has(id)) picked.delete(id);
    else picked.add(id);
    return { picked, anchor: id };
  }
  return { picked: new Set([id]), anchor: id };
}

/** Every item picked. */
export const pickAll = (order: readonly Id[]): PickState => ({ picked: new Set(order), anchor: order[0] ?? null });

/** The picks without the items that are no longer there (deleted, or undone), in the same state when none is gone. */
export function prune(order: readonly Id[], state: PickState): PickState {
  const there = new Set(order);
  const kept = [...state.picked].filter((id) => there.has(id));
  if (kept.length === state.picked.size && (state.anchor === null || there.has(state.anchor))) return state;
  return { picked: new Set(kept), anchor: state.anchor !== null && there.has(state.anchor) ? state.anchor : null };
}

/** The picked items in the order shown. */
export const pickedInOrder = (order: readonly Id[], state: PickState): Id[] => order.filter((id) => state.picked.has(id));
