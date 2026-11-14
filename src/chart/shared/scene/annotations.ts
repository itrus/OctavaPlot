import type { Annotation } from '../../../model/types';
import { ANNOTATION_LINE_SPACING } from '../../../model/defaults';
import { n2 } from '../../../model/units';
import { measureText } from '../parts/text';
import { el, type SceneElement } from './sceneElement';
import { svgId } from './svgIds';

/** Colour of the editor's selection outlines (never drawn in an export). */
export const SELECT_COLOR = '#2b7fff';

/** The live position (fractions of the chart size) of an annotation being dragged; it overrides the stored one. */
interface AnnotationDrag {
  id: string;
  xFrac: number;
  yFrac: number;
}

/** Where the lines of an annotation are written and how much room it takes, in the font, weight and spacing it is drawn in. */
export function annotationBox(a: Annotation, x: number, y: number, chartFont?: string) {
  const lines = a.text.split('\n');
  const family = a.fontFamily ?? chartFont;
  const widths = lines.map((l) => measureText(l, a.fontSizePt, !!a.bold, !!a.italic, family));
  const w = Math.max(...widths, 8);
  const step = a.fontSizePt * (a.lineSpacing ?? ANNOTATION_LINE_SPACING.default);
  // The first baseline is where a text of one line has always had it; the box ends a font size under the last baseline's line.
  const baselines = lines.map((_, i) => y + a.fontSizePt * 0.9 + i * step);
  const h = (lines.length - 1) * step + a.fontSizePt * 1.2;
  // The x of each line for its alignment: the box's left edge is the position, whatever the alignment.
  const anchorX = a.align === 'center' ? x + w / 2 : a.align === 'right' ? x + w : x;
  const lineStart = widths.map((lw) => (a.align === 'center' ? x + (w - lw) / 2 : a.align === 'right' ? x + w - lw : x));
  return { x, y, w, h, lines, widths, baselines, anchorX, lineStart };
}

/**
 * The text annotations of a chart as scene elements. `place` says where each goes (see annotationPlace.ts: its page fractions, or
 * its values on the axes) and leaves out one that has no place; without it every annotation is at its fractions of the size. The
 * drag is a parameter, not editor state: the scene itself knows nothing of the editor. The hit pad and the selection frame are editor-only; the frame shows
 * while the annotation with its ID is selected (`whenAnnotationSelected`). `chartFont` is the font of the chart, which a text without
 * its own font is drawn in (it is measured in it; the SVG inherits it). An underline is drawn as a line under each line of text, so that
 * every export (SVG, PNG, PDF) shows it.
 */
export function annotationElements(annotations: ReadonlyArray<Annotation>, width: number, height: number, drag?: AnnotationDrag | null, place?: (a: Annotation) => { x: number; y: number } | null, chartFont?: string): SceneElement[] {
  return annotations.flatMap((a) => {
    const d = drag?.id === a.id ? drag : null;
    const at = d ? { x: d.xFrac * width, y: d.yFrac * height } : place ? place(a) : { x: a.xFrac * width, y: a.yFrac * height };
    if (!at) return [];
    const { x, y } = at;
    const box = annotationBox(a, x, y, chartFont);
    const frame = [['x', n2(box.x - 6)], ['y', n2(box.y - 6)], ['width', n2(box.w + 12)], ['height', n2(box.h + 12)]] as const;
    const anchor = a.align === 'center' ? 'middle' : a.align === 'right' ? 'end' : undefined;
    const underlines = a.underline
      ? box.lines.flatMap((line, i) => (line.trim() === '' ? [] : [el('path', [['d', `M${n2(box.lineStart[i])},${n2(box.baselines[i] + a.fontSizePt * 0.12)}H${n2(box.lineStart[i] + box.widths[i])}`], ['fill', 'none'], ['stroke', a.color], ['stroke-width', n2(Math.max(0.5, a.fontSizePt * 0.06))], ['stroke-opacity', a.opacity < 1 ? a.opacity : undefined]])]))
      : [];
    return [el('g', [], {
      hit: { kind: 'annotation', annotationId: a.id },
      id: svgId('annotation', a.id),
      children: [
        el('rect', [...frame, ['fill', 'transparent']], { editorOnly: true }),
        el('text', [['x', n2(box.anchorX)], ['font-size', a.fontSizePt], ['font-family', a.fontFamily], ['font-weight', a.bold ? 'bold' : undefined], ['font-style', a.italic ? 'italic' : undefined], ['text-anchor', anchor], ['fill', a.color], ['fill-opacity', a.opacity < 1 ? a.opacity : undefined]], {
          children: box.lines.map((line, i) => el('tspan', [['x', n2(box.anchorX)], ['y', n2(box.baselines[i])]], { text: line === '' ? ' ' : line })),
        }),
        ...underlines,
        el('rect', [['data-editor-only', 'true'], ...frame, ['fill', 'none'], ['stroke', SELECT_COLOR], ['stroke-width', 2], ['stroke-dasharray', '6 4'], ['pointer-events', 'none']], { whenAnnotationSelected: a.id }),
      ],
    })];
  });
}

/** The annotations that are not hidden: a hidden one is taken out of the drawing by the ID of its layer (`<id>:annotation`). */
export const visibleAnnotations = (annotations: ReadonlyArray<Annotation>, hiddenLayerIds: ReadonlyArray<string>): Annotation[] =>
  hiddenLayerIds.length === 0 ? [...annotations] : annotations.filter((a) => !hiddenLayerIds.includes(`${a.id}:annotation`));
