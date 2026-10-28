import { FONT_FAMILY } from '../../../model/defaults';
import { hasMarkup, parseRichText } from '../../../util/richText';
import { SCRIPT_SCALE } from '../scene/richSvg';

let ctx: CanvasRenderingContext2D | null | undefined;

function getCtx(): CanvasRenderingContext2D | null {
  if (ctx !== undefined) return ctx;
  try {
    ctx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
  } catch {
    ctx = null;
  }
  return ctx;
}

/**
 * Text width in pt. Uses a canvas measurement when available (font size is
 * given in pt and the canvas is told the same number in "px", so the result is
 * already in pt units). Falls back to an average-glyph estimate in tests.
 */
export function measureText(text: string, fontSizePt: number, bold = false, italic = false, family: string = FONT_FAMILY): number {
  // Text with markup is measured as it is written: the names and escapes resolved, the scripts at their smaller size.
  if (hasMarkup(text)) return parseRichText(text).reduce((w, run) => w + measurePlain(run.text, run.script === 'normal' ? fontSizePt : fontSizePt * SCRIPT_SCALE, bold, italic, family), 0);
  return measurePlain(text, fontSizePt, bold, italic, family);
}

function measurePlain(text: string, fontSizePt: number, bold: boolean, italic: boolean, family: string): number {
  const c = getCtx();
  if (c) {
    c.font = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${fontSizePt}px ${family}`;
    return c.measureText(text).width;
  }
  return text.length * fontSizePt * (bold ? 0.58 : 0.54);
}
