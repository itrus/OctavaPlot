import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { parseSync } from 'vite';
import { describe, expect, it } from 'vitest';

/**
 * What the markup of the app must have to be usable without a mouse or a screen, checked in the syntax tree of every component
 * (the parser is the oxc one that comes with vite, as in src/architecture.test.ts): a name for every field, a name for a button
 * that shows only a picture, an alternative text for an image, a name for a dialog, and no control made of a div. It sees what
 * is written, not what is drawn: a field named through a spread of props, or by a component that is not the field itself, is
 * listed in SPREADS below and checked by hand in the browser (see docs/BACKLOG.md).
 */
const SRC = resolve(__dirname, '../..');
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
const components = walk(SRC).filter((f) => f.endsWith('.tsx') && !/\.test\.tsx$/.test(f));
const rel = (f: string): string => relative(SRC, f).split(sep).join('/');

type Node = { type?: string; [key: string]: unknown };
type Attr = { name: string; value: Node | null };

const tagOf = (el: Node): string => {
  const n = (el.openingElement as Node).name as Node;
  return n.type === 'JSXIdentifier' ? (n.name as string) : '';
};
const attrsOf = (el: Node): { attrs: Map<string, Attr>; spread: boolean } => {
  const attrs = new Map<string, Attr>();
  let spread = false;
  for (const a of (el.openingElement as Node).attributes as Node[]) {
    if (a.type === 'JSXSpreadAttribute') spread = true;
    else attrs.set(((a.name as Node).name as string) ?? '', { name: (a.name as Node).name as string, value: (a.value as Node | null) ?? null });
  }
  return { attrs, spread };
};
const literal = (a: Attr | undefined): string | null => (a?.value && a.value.type === 'Literal' && typeof a.value.value === 'string' ? (a.value.value as string) : null);

/** Whether the children show something to read: text, or an expression (which may be text), not only pictures. */
const hasReadableChild = (el: Node): boolean =>
  (el.children as Node[]).some((c) => (c.type === 'JSXText' && String(c.value).trim() !== '') || c.type === 'JSXExpressionContainer' || (c.type === 'JSXElement' && !['svg', 'img', 'Icon'].includes(tagOf(c)) && !/^[A-Z]\w*Icon$|^Icon[A-Z]/.test(tagOf(c)) && (hasReadableChild(c) || false)));

interface Finding {
  file: string;
  tag: string;
  line: number;
  rule: string;
}

function audit(file: string, text: string): { findings: Finding[]; spreads: Finding[] } {
  const findings: Finding[] = [];
  const spreads: Finding[] = [];
  const lineAt = (node: Node): number => text.slice(0, node.start as number).split('\n').length;
  const visit = (value: unknown, inLabel: boolean): void => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) return value.forEach((v) => visit(v, inLabel));
    const node = value as Node;
    let label = inLabel;
    if (node.type === 'JSXElement') {
      const tag = tagOf(node);
      const { attrs, spread } = attrsOf(node);
      // What is hidden from the screen reader (`hidden`, aria-hidden) needs no name: a file picker the buttons open, the field that catches a paste.
      if (attrs.has('hidden') || literal(attrs.get('aria-hidden')) === 'true') return;
      const add = (rule: string) => (spread ? spreads : findings).push({ file: rel(file), tag, line: lineAt(node), rule });
      const named = attrs.has('aria-label') || attrs.has('aria-labelledby');
      if (tag === 'label') label = true;
      if ((tag === 'input' || tag === 'select' || tag === 'textarea') && literal(attrs.get('type')) !== 'hidden' && !named && !attrs.has('title') && !label) add('field has no name (aria-label, aria-labelledby, title, or an enclosing label)');
      if (tag === 'button' && !named && !attrs.has('title') && !hasReadableChild(node)) add('button shows only a picture and has no name');
      if (tag === 'img' && !attrs.has('alt') && !named) add('image has no alt');
      if (literal(attrs.get('role')) === 'dialog' && !named) add('dialog has no name');
      if (attrs.has('tabIndex') && attrs.get('tabIndex')?.value?.type === 'JSXExpressionContainer') {
        const v = (attrs.get('tabIndex')!.value!.expression as Node);
        if (v.type === 'Literal' && typeof v.value === 'number' && v.value > 0) add('positive tabIndex changes the order of the keyboard');
      }
      if ((tag === 'div' || tag === 'span') && attrs.has('onClick') && !attrs.has('role') && !attrs.has('tabIndex') && !attrs.has('onKeyDown') && !attrs.has('onMouseDown') && !attrs.has('aria-hidden')) add('click on a div or span that the keyboard cannot reach');
    }
    for (const key in node) visit(node[key], label);
  };
  visit(parseSync(file, text).program, false);
  return { findings, spreads };
}

const all = components.map((f) => ({ f, ...audit(f, readFileSync(f, 'utf8')) }));
const show = (list: Finding[]): string[] => list.map((x) => `${x.file}:${x.line} <${x.tag}> ${x.rule}`);

describe('accessibility of the markup', () => {
  it('finds a field, a button, an image and a dialog that lack their name, and a click that the keyboard cannot make (the check itself)', () => {
    const bad = 'export const A = () => (<div><input type="text" /><button><svg /></button><img src="x" /><div role="dialog" /><div onClick={f} /><span tabIndex={3} /></div>);';
    expect(audit('bad.tsx', bad).findings.map((x) => x.rule.split(' ').slice(0, 3).join(' '))).toEqual(['field has no', 'button shows only', 'image has no', 'dialog has no', 'click on a', 'positive tabIndex changes']);
    const good = 'export const A = () => (<div><label>Name <input type="text" /></label><input aria-label="x" /><button>Save</button><button aria-label="x"><svg /></button><img alt="" src="x" /><div role="dialog" aria-label="D" /><input type="file" hidden /><textarea aria-hidden="true" /><div className="corner" aria-hidden="true" onClick={f} /><div role="button" tabIndex={0} onClick={f} /><input {...p} /></div>);';
    const r = audit('good.tsx', good);
    expect(r.findings).toEqual([]);
    expect(r.spreads.map((x) => x.tag)).toEqual(['input']);
  });

  it('names every field, picture-only button, image and dialog', () => {
    expect(show(all.flatMap((a) => a.findings))).toEqual([]);
  });
});

/** WCAG 2 contrast ratio of two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const lum = (hex: string): number => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('contrast of the colours of the interface (styles.css)', () => {
  const css = readFileSync(join(SRC, 'styles.css'), 'utf8');
  const token = (name: string): string => css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1] ?? '';
  const surfaces = { page: token('bg'), panel: token('panel'), white: '#ffffff', 'selected row': token('accent-soft') };

  it('measures as WCAG does: black on white is 21 to 1, grey #767676 on white just passes 4.5 to 1', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#767676', '#ffffff')).toBeGreaterThan(4.5);
    expect(contrast('#777777', '#ffffff')).toBeLessThan(4.5);
  });

  it('reads the text colours at 4.5 to 1 or more on every surface they are drawn on (WCAG 1.4.3)', () => {
    for (const [name, on] of Object.entries(surfaces)) {
      expect([name, contrast(token('text'), on) >= 4.5]).toEqual([name, true]);
      expect([name, contrast(token('muted'), on) >= 4.5]).toEqual([name, true]);
    }
    expect(contrast(token('danger'), '#fff5f5')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('danger'), surfaces.page)).toBeGreaterThanOrEqual(4.5);
  });

  it('has white text on the primary button at 4.5 to 1 or more, which the plain accent does not give', () => {
    expect(css).toMatch(/button\.primary \{[^}]*background: var\(--accent-strong\)/);
    expect(contrast(token('accent-strong'), '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('accent'), '#ffffff')).toBeLessThan(4.5);
  });

  it('draws the focus ring of every control in the accent, at 3 to 1 or more against the surfaces (WCAG 1.4.11)', () => {
    expect(css).toMatch(/:focus-visible \{ outline: 2px solid var\(--accent\)/);
    for (const [name, on] of Object.entries(surfaces)) expect([name, contrast(token('accent'), on) >= 3]).toEqual([name, true]);
  });

  it('takes the ring away from no field: the rules that said outline: none are for containers that show the focus another way', () => {
    const none = [...css.matchAll(/([^{}]+)\{[^}]*outline:\s*none[^}]*\}/g)].map((m) => m[1].trim().replace(/\s+/g, ' ')).sort();
    // The grid and the results sheet draw the active cell, a dialog is focused by the program, the splitter fills itself,
    // the folder grid has its own ring.
    expect(none).toEqual(['.folder-grid', '.grid-scroller', '.modal', '.results-scroller:focus', '.splitter:focus-visible']);
  });
});
