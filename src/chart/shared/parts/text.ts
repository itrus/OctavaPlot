import { FONT_FAMILY } from '../../../model/defaults';

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
  const c = getCtx();
  if (c) {
    c.font = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${fontSizePt}px ${family}`;
    return c.measureText(text).width;
  }
  return text.length * fontSizePt * (bold ? 0.58 : 0.54);
}
