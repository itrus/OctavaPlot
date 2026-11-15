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

interface TextRun {
  text: string;
  script: TextScript;
}

/** The names a backslash can start, and what they stand for. */
const NAMES: Readonly<Record<string, string>> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', omicron: 'ο', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Alpha: 'Α', Beta: 'Β', Gamma: 'Γ', Delta: 'Δ', Epsilon: 'Ε', Zeta: 'Ζ', Eta: 'Η', Theta: 'Θ', Iota: 'Ι', Kappa: 'Κ', Lambda: 'Λ', Mu: 'Μ', Nu: 'Ν', Xi: 'Ξ', Omicron: 'Ο', Pi: 'Π', Rho: 'Ρ', Sigma: 'Σ', Tau: 'Τ', Upsilon: 'Υ', Phi: 'Φ', Chi: 'Χ', Psi: 'Ψ', Omega: 'Ω',
  varsigma: 'ς', vartheta: 'ϑ', varphi: 'ϕ', varpi: 'ϖ',
  pm: '±', times: '×', cdot: '·', deg: '°', leq: '≤', geq: '≥', neq: '≠', approx: '≈', infty: '∞',
  angstrom: 'Å', permil: '‰', half: '½', quarter: '¼', threequarters: '¾', neg: '¬', pound: '£', yen: '¥', cent: '¢', guillemotleft: '«', guillemotright: '»', pilcrow: '¶',
  div: '÷', minus: '−', sqrt: '√', sum: '∑', prod: '∏', int: '∫', partial: '∂', propto: '∝', equiv: '≡',
  leftarrow: '←', rightarrow: '→', uparrow: '↑', downarrow: '↓',
  ndash: '–', mdash: '—', bullet: '•', dagger: '†', ddagger: '‡', ellipsis: '…', section: '§', copyright: '©', registered: '®', trademark: '™', euro: '€',
};

/**
 * The symbols the insert window offers, in groups. Only symbols that the PDF export can write (Latin-1, the extra WinAnsi characters and
 * the Symbol font, see chart/export/svgPdf.ts) are in it, so what is inserted looks the same on screen, in PNG, in SVG and in PDF.
 */
export const SYMBOL_GROUPS: ReadonlyArray<{ title: string; names: readonly string[]; /** Starts a new line in the window. */ newLine?: boolean }> = [
  { title: 'Greek', names: [...['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'omicron', 'pi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega'], ...['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa', 'Lambda', 'Mu', 'Nu', 'Xi', 'Omicron', 'Pi', 'Rho', 'Sigma', 'Tau', 'Upsilon', 'Phi', 'Chi', 'Psi', 'Omega']] },
  { title: 'Signs', names: ['pm', 'times', 'cdot', 'deg', 'div', 'minus', 'sqrt'] },
  { title: 'Relations', names: ['leq', 'geq', 'neq', 'approx', 'equiv', 'infty'] },
  { title: 'Greek, variants', names: ['varsigma', 'vartheta', 'varphi', 'varpi'] },
  { title: 'Arrows', names: ['leftarrow', 'rightarrow', 'uparrow', 'downarrow'], newLine: true },
  { title: 'Calculus and sums', names: ['sum', 'prod', 'int', 'partial', 'propto'] },
  { title: 'Other', names: ['angstrom', 'permil', 'half', 'quarter', 'threequarters', 'neg', 'pound', 'yen', 'cent', 'guillemotleft', 'guillemotright', 'pilcrow'] },
  { title: 'Typography', names: ['ndash', 'mdash', 'bullet', 'dagger', 'ddagger', 'ellipsis', 'section', 'copyright', 'registered', 'trademark', 'euro'] },
];

/** The character a name stands for (for the insert window). */
export const symbolOf = (name: string): string => NAMES[name] ?? '';

/**
 * The text with a backslash name put in place of the selection (start to end). A letter right after it would run into the name
 * (\mum), so an empty {} ends the name then. Returns the new text and where the cursor goes: after what was inserted.
 */
export function insertSymbol(text: string, start: number, end: number, name: string): { text: string; caret: number } {
  const [a, b] = [Math.max(0, Math.min(start, end)), Math.min(text.length, Math.max(start, end))];
  const insert = `\\${name}${/^[A-Za-z]/.test(text.slice(b, b + 1)) ? '{}' : ''}`;
  return { text: text.slice(0, a) + insert + text.slice(b), caret: a + insert.length };
}

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
    if (Object.hasOwn(NAMES, name)) {
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
