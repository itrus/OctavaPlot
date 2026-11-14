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
