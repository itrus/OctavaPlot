/**
 * Rich text for the text of a figure: subscripts, superscripts and Greek letters written as plain text.
 *
 *   H_{2}O       subscript:   H₂O          (the braces are required)
 *   m^{2}        superscript: m²
 *   x^{-1}       superscript: x⁻¹
 *   \mu mol/L    Greek by name: μ mol/L    (\alpha \beta ... \Omega, and \pm \times \deg \cdot \leq \geq \neq \approx \infty)
 *   \mu{}m       an empty {} ends a name, so that a letter can follow it directly: μm
 *   \_  \^  \\  \{  \}   the character itself
 *
 * The braces are required on purpose: names such as "Mouse_3", "Run_2" or "p_value" are in the data of every lab and must not
 * change into subscripts. Text without a backslash and without "_{" or "^{" is not touched at all. Anything that is not understood
 * (an unknown name, a brace that never closes) is kept exactly as it was typed. Pure; no layers below.
 */

type TextScript = 'normal' | 'sub' | 'sup';

export interface TextRun {
  text: string;
  script: TextScript;
}

/** The names a backslash can start, and what they stand for. */
const NAMES: Readonly<Record<string, string>> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', omicron: 'ο', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  pm: '±', times: '×', cdot: '·', deg: '°', leq: '≤', geq: '≥', neq: '≠', approx: '≈', infty: '∞',
};

/** True when the text may hold markup: a backslash, or a script marker with its brace. Text that fails this test is left exactly as it is. */
export const hasMarkup = (source: string): boolean => source.includes('\\') || source.includes('_{') || source.includes('^{');

/** One piece of text with escapes and names resolved (no scripts): what is inside braces, and what is outside them. */
function resolve(source: string): string {
  let out = '';
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c !== '\\') {
      out += c;
      continue;
    }
    const next = source[i + 1];
    if (next !== undefined && '\\_^{}'.includes(next)) {
      out += next;
      i += 1;
      continue;
    }
    const name = /^[A-Za-z]+/.exec(source.slice(i + 1))?.[0] ?? '';
    if (name in NAMES) {
      out += NAMES[name];
      i += name.length;
      // An empty pair of braces ends the name, so that a letter can follow it: \mu{}m.
      if (source.startsWith('{}', i + 1)) i += 2;
    } else out += '\\';
  }
  return out;
}

/** The index of the brace that closes the one that opens at `open`, skipping escaped ones; -1 when it never closes. */
function closing(source: string, open: number): number {
  for (let i = open + 1; i < source.length; i++) {
    if (source[i] === '\\') i += 1;
    else if (source[i] === '}') return i;
  }
  return -1;
}

/** The text as runs: stretches of normal text, subscripts and superscripts, with adjacent runs of one kind joined. */
export function parseRichText(source: string): TextRun[] {
  if (!hasMarkup(source)) return source === '' ? [] : [{ text: source, script: 'normal' }];
  const runs: TextRun[] = [];
  const push = (text: string, script: TextScript) => {
    if (text === '') return;
    const last = runs[runs.length - 1];
    if (last && last.script === script) last.text += text;
    else runs.push({ text, script });
  };
  let plain = '';
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if ((c === '_' || c === '^') && source[i + 1] === '{') {
      const end = closing(source, i + 1);
      if (end > 0) {
        push(resolve(plain), 'normal');
        plain = '';
        push(resolve(source.slice(i + 2, end)), c === '_' ? 'sub' : 'sup');
        i = end;
        continue;
      }
    }
    // A backslash keeps the character after it with it, so that an escaped marker is not taken for one.
    if (c === '\\' && i + 1 < source.length) {
      plain += c + source[i + 1];
      i += 1;
      continue;
    }
    plain += c;
  }
  push(resolve(plain), 'normal');
  return runs;
}

/** What is written, without the markup: Greek letters and escapes resolved, scripts as ordinary characters. */
export const plainText = (source: string): string => (hasMarkup(source) ? parseRichText(source).map((r) => r.text).join('') : source);
