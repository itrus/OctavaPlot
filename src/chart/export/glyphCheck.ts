/** Family names every browser resolves itself: what they draw for a character is up to the system, so the check cannot judge them. */
const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded']);

interface MissingGlyph {
  char: string;
  /** "U+03B1". */
  codePoint: string;
  /** How many times the character occurs in the texts of the drawing. */
  count: number;
}

export interface GlyphCheck {
  /** The font the characters were looked up in: the one the browser draws with. Null when none could be checked. */
  font: string | null;
  /** How many different characters outside basic Latin the texts hold (the ones that were looked up). */
  checked: number;
  /** Characters the font does not have: the browser draws each of them with another font, or with an empty box. */
  missing: MissingGlyph[];
  /** Why nothing was looked up (no font to ask, or a generic one); null when the check ran. */
  skipped: string | null;
}

const codePointText = (cp: number): string => `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;

/** Characters that are not looked up besides basic Latin: zero-width and line-separator characters and the byte-order mark. */
const INVISIBLE = new Set([0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x2028, 0x2029, 0xfeff]);

/** Basic Latin (printable ASCII), the controls and every kind of space are not looked up: a font that lacks them is not usable at all. */
const isLookedUp = (char: string): boolean => {
  const cp = char.codePointAt(0)!;
  if (cp <= 0x7e) return false;
  if (cp >= 0x7f && cp <= 0x9f) return false;
  return !/\s/u.test(char) && !INVISIBLE.has(cp);
};

/**
 * Which characters of the texts a font does not have. The lookup is a parameter: the browser one is in ui/export/browserFonts.ts,
 * tests pass a fake. `font` is the family the drawing ends up in (`FontCheck.used`); a generic family, or none, cannot be asked.
 */
export function checkGlyphs(texts: readonly string[], font: string | null, hasGlyph: (family: string, char: string) => boolean): GlyphCheck {
  const counts = new Map<string, number>();
  for (const text of texts) for (const char of text) if (isLookedUp(char)) counts.set(char, (counts.get(char) ?? 0) + 1);
  if (font === null) return { font: null, checked: counts.size, missing: [], skipped: 'No font of the list is installed.' };
  if (GENERIC.has(font.toLowerCase())) return { font, checked: counts.size, missing: [], skipped: `${font} is a generic family: the system chooses the font for each character.` };
  const missing = [...counts]
    .filter(([char]) => !hasGlyph(font, char))
    .map(([char, count]) => ({ char, codePoint: codePointText(char.codePointAt(0)!), count }))
    .sort((a, b) => a.codePoint.localeCompare(b.codePoint));
  return { font, checked: counts.size, missing, skipped: null };
}
