/** What was on screen when the status message appeared: the project, the selection and the view, compared by identity. */
export interface StatusMemo<P = unknown, S = unknown, V = unknown> {
  text: string;
  project: P;
  selection: S;
  view: V;
}

/**
 * The status line clears on the next action: the first change of the project (an edit, undo, redo, opening a file), of the selection
 * or of the view after the message appeared. A message that an action sets together with its change (the same render) is the message
 * of that action and stays until the next one. Pure, so that it can be tested without a screen.
 *
 * `seen` is what was remembered when the message appeared (null before one); the result says what the line shows now and what to remember.
 */
export function statusAfter<P, S, V>(status: string, seen: StatusMemo<P, S, V> | null, now: { project: P; selection: S; view: V }): { status: string; seen: StatusMemo<P, S, V> | null } {
  if (status === '') return { status, seen: null };
  if (seen === null || seen.text !== status) return { status, seen: { text: status, ...now } };
  const acted = seen.project !== now.project || seen.selection !== now.selection || seen.view !== now.view;
  return acted ? { status: '', seen: null } : { status, seen };
}
