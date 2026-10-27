/** Text measured in each font: wide, narrow and round letters, so that two different fonts hardly ever have the same width. */
const PROBE = 'mmmmmmmmmmlli WwQq 0123456789 ÅÖgjy';
const GENERIC_FAMILIES = ['monospace', 'serif', 'sans-serif'];
const answers = new Map<string, boolean>();
let context: CanvasRenderingContext2D | null | undefined;

const quoted = (family: string) => `"${family.replace(/["\\]/g, '')}"`;

function widthOf(font: string): number {
  context ??= document.createElement('canvas').getContext('2d');
  if (!context) return NaN;
  context.font = `72px ${font}`;
  return context.measureText(PROBE).width;
}

/**
 * Whether the browser has a font. `document.fonts.check` alone is not enough: it answers yes for any name it has never
 * heard of, because nothing would need loading. So the text is also measured in the font with each generic family as its
 * fallback: a font that is there changes the width from at least one of them; a font that is not draws the fallback itself.
 * When the browser cannot measure, the font is taken as available (the check cannot say it is not).
 */
export function browserFontAvailable(family: string): boolean {
  const known = answers.get(family);
  if (known !== undefined) return known;
  let ok = true;
  try {
    if (!document.fonts.check(`12px ${quoted(family)}`)) ok = false;
    else {
      const widths = GENERIC_FAMILIES.map((g) => [widthOf(`${quoted(family)}, ${g}`), widthOf(g)]);
      ok = widths.some(([withFont, fallback]) => Number.isNaN(withFont) || withFont !== fallback);
    }
  } catch {
    ok = true;
  }
  answers.set(family, ok);
  return ok;
}
