/** Family names every browser resolves itself: they are never missing. */
const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded']);

type FontStatus = 'available' | 'missing' | 'generic';

export interface FontCheck {
  /** The CSS font-family list as the chart holds it. */
  requested: string;
  families: Array<{ family: string; status: FontStatus }>;
  /** The first family that is available (or generic): the one the browser draws with. Null when none is. */
  used: string | null;
  missing: string[];
  /** What is drawn instead when the first family of the list is missing; null when the first one is there. */
  replacedBy: string | null;
}

/** The family names of a CSS font-family list, without quotes ("Arial, 'Times New Roman'" gives Arial and Times New Roman). */
export function parseFontFamilies(list: string): string[] {
  const out: string[] = [];
  let current = '';
  let quote: string | null = null;
  const push = () => {
    const name = current.trim();
    if (name !== '') out.push(name);
    current = '';
  };
  for (const ch of list) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === ',') push();
    else current += ch;
  }
  push();
  return out;
}

/** Checks a font-family list. The availability test is a parameter: the browser one is in ui/export/browserFonts.ts, tests pass a fake. */
export function checkFonts(list: string, isAvailable: (family: string) => boolean): FontCheck {
  const families = parseFontFamilies(list).map((family) => ({
    family,
    status: (GENERIC.has(family.toLowerCase()) ? 'generic' : isAvailable(family) ? 'available' : 'missing') as FontStatus,
  }));
  const used = families.find((f) => f.status !== 'missing')?.family ?? null;
  const first = families[0];
  return {
    requested: list,
    families,
    used,
    missing: families.filter((f) => f.status === 'missing').map((f) => f.family),
    replacedBy: first?.status === 'missing' ? used : null,
  };
}
