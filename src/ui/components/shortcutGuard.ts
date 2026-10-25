/** Input types that accept typed text, where native text undo must win over the global shortcuts. */
const TEXT_INPUT_TYPES = new Set(['text', 'search', 'number', 'email', 'url', 'tel', 'password']);

/**
 * True when the event target is a text-entry control or an editable element.
 * Structural on purpose, so it works without a DOM (checkbox, radio, colour, range, file,
 * select, button and the grid div are not text entry).
 */
export function isTextEntryTarget(target: unknown): boolean {
  if (typeof target !== 'object' || target === null) return false;
  const t = target as { tagName?: unknown; type?: unknown; isContentEditable?: unknown; contentEditable?: unknown };
  if (t.isContentEditable === true) return true;
  if (typeof t.contentEditable === 'string' && t.contentEditable.toLowerCase() === 'true') return true;
  if (typeof t.tagName !== 'string') return false;
  const tag = t.tagName.toUpperCase();
  if (tag === 'TEXTAREA') return true;
  if (tag !== 'INPUT') return false;
  // An input without a type attribute is a text input.
  const type = typeof t.type === 'string' && t.type !== '' ? t.type.toLowerCase() : 'text';
  return TEXT_INPUT_TYPES.has(type);
}
