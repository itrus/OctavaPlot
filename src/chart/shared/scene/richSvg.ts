import { parseRichText } from '../../../util/richText';

/** Scripts are drawn at this share of the size of the text round them. */
export const SCRIPT_SCALE = 0.7;
/** How far a subscript sinks and a superscript rises, as a share of the size of the text round them (positive = down). */
const SUB_SHIFT = 0.28;
const SUP_SHIFT = -0.4;

/** One piece of a marked-up text as the SVG writes it: its text, and a size and a shift when it is a script. */
export interface RichPiece {
  text: string;
  /** A tspan attribute: a percentage of the size of the text it stands in; absent for normal text. */
  fontSize?: string;
  /** A tspan attribute: the shift from the baseline of the piece before it, in em of the piece itself; absent when there is none. */
  dy?: string;
}

const em = (v: number): string => `${Number(v.toFixed(3))}em`;

/**
 * The pieces a text with markup is written as. A script is a tspan at 70% of the size, lifted or lowered by a dy; the text after it
 * carries the dy that brings it back to the baseline (a dy is relative to the piece before, in the em of the piece it stands on, so
 * the shifts are worked out from where the baseline is). The same pieces are written on the screen and in every export.
 */
export function richPieces(source: string): RichPiece[] {
  let at = 0;
  return parseRichText(source).map((run) => {
    const target = run.script === 'sub' ? SUB_SHIFT : run.script === 'sup' ? SUP_SHIFT : 0;
    const scale = run.script === 'normal' ? 1 : SCRIPT_SCALE;
    const dy = (target - at) / scale;
    at = target;
    return { text: run.text, ...(scale !== 1 ? { fontSize: `${SCRIPT_SCALE * 100}%` } : {}), ...(dy !== 0 ? { dy: em(dy) } : {}) };
  });
}
