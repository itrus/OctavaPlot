import { newId } from '../../model/ids';
import type { Annotation, Drawing } from '../../model/types';
import { cleanAnnotations, cleanDrawings } from '../../state/serialize';
import { isObj } from '../../state/tableCodec';

/**
 * Texts and shapes on the clipboard. They are written as plain text, JSON with a mark, so that a copy also works between tabs and
 * windows (as drawing programs on the web do); pasted elsewhere it is that JSON.
 */
const CLIPBOARD_TYPE = 'octavaplot/objects';

export interface CopiedObjects {
  annotations: Annotation[];
  drawings: Drawing[];
}

/** The clipboard text of these texts and shapes. */
export const objectsToText = (o: CopiedObjects): string => JSON.stringify({ type: CLIPBOARD_TYPE, version: 1, annotations: o.annotations, drawings: o.drawings });

/**
 * The texts and shapes in a clipboard text, checked field by field as a file's are and given new IDs; null when the text is not
 * OctavaPlot's or holds nothing that can be read. A page (`page`) has no axes, so there a data anchor is dropped: each object goes
 * where it stood on its graph.
 */
export function objectsFromText(text: string, page: boolean): CopiedObjects | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObj(raw) || raw.type !== CLIPBOARD_TYPE) return null;
  const notes: string[] = [];
  const annotations = cleanAnnotations(raw.annotations, 'clipboard.annotations', notes).map((a): Annotation => {
    const copy = { ...a, id: newId('ann') };
    if (!page) return copy;
    const { anchor: _a, x: _x, y: _y, ...onPage } = copy;
    return onPage;
  });
  const drawings = cleanDrawings(raw.drawings, 'clipboard.drawings', notes, page).map((d): Drawing => ({ ...d, id: newId('drw') }));
  return annotations.length + drawings.length > 0 ? { annotations, drawings } : null;
}

let lastPaste = { text: '', count: 0 };

/**
 * How far a paste moves the copies from where the originals stood, as a fraction of the graph or page: 2% for the first paste of a
 * copy, 4% for the next paste of the same copy, and so on, so that copies pasted again do not hide under each other.
 */
export function pasteStep(text: string): number {
  lastPaste = lastPaste.text === text ? { text, count: lastPaste.count + 1 } : { text, count: 1 };
  return 0.02 * lastPaste.count;
}

/** "2 texts and 1 shape": what a copy or paste holds, for the status line. */
export function objectsCount(o: CopiedObjects): string {
  const part = (n: number, one: string, many: string) => (n === 0 ? [] : [`${n} ${n === 1 ? one : many}`]);
  return [...part(o.annotations.length, 'text', 'texts'), ...part(o.drawings.length, 'shape', 'shapes')].join(' and ');
}
