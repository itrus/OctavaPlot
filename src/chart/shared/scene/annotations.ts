import type { Annotation } from '../../../model/types';
import { n2 } from '../../../model/units';
import { measureText } from '../parts/text';
import { el, type SceneElement } from './sceneElement';
import { svgId } from './svgIds';

/** Colour of the editor's selection outlines (never drawn in an export). */
export const SELECT_COLOR = '#2b7fff';

/** The live position (fractions of the chart size) of an annotation being dragged; it overrides the stored one. */
export interface AnnotationDrag {
  id: string;
  xFrac: number;
  yFrac: number;
}

function annotationBox(a: Annotation, x: number, y: number) {
  const lines = a.text.split('\n');
  const w = Math.max(...lines.map((l) => measureText(l, a.fontSizePt)), 8);
  const h = lines.length * a.fontSizePt * 1.2;
  return { x, y, w, h, lines };
}

/**
 * The text annotations of a chart as scene elements, positioned as fractions of its size. The drag is a parameter, not editor
 * state: the scene itself knows nothing of the editor. The hit pad and the selection frame are editor-only; the frame shows
 * while the annotation with its ID is selected (`whenAnnotationSelected`).
 */
export function annotationElements(annotations: ReadonlyArray<Annotation>, width: number, height: number, drag?: AnnotationDrag | null): SceneElement[] {
  return annotations.map((a) => {
    const d = drag?.id === a.id ? drag : null;
    const x = (d ? d.xFrac : a.xFrac) * width;
    const y = (d ? d.yFrac : a.yFrac) * height;
    const box = annotationBox(a, x, y);
    const frame = [['x', n2(box.x - 6)], ['y', n2(box.y - 6)], ['width', n2(box.w + 12)], ['height', n2(box.h + 12)]] as const;
    return el('g', [], {
      hit: { kind: 'annotation', annotationId: a.id },
      id: svgId('annotation', a.id),
      children: [
        el('rect', [...frame, ['fill', 'transparent']], { editorOnly: true }),
        el('text', [['x', n2(x)], ['font-size', a.fontSizePt], ['fill', a.color], ['fill-opacity', a.opacity < 1 ? a.opacity : undefined]], {
          children: box.lines.map((line, i) => el('tspan', [['x', n2(x)], ['y', n2(y + a.fontSizePt * 0.9 + i * a.fontSizePt * 1.2)]], { text: line === '' ? ' ' : line })),
        }),
        el('rect', [['data-editor-only', 'true'], ...frame, ['fill', 'none'], ['stroke', SELECT_COLOR], ['stroke-width', 2], ['stroke-dasharray', '6 4'], ['pointer-events', 'none']], { whenAnnotationSelected: a.id }),
      ],
    });
  });
}

/** The annotations that are not hidden: a hidden one is taken out of the drawing by the ID of its layer (`<id>:annotation`). */
export const visibleAnnotations = (annotations: ReadonlyArray<Annotation>, hiddenLayerIds: ReadonlyArray<string>): Annotation[] =>
  hiddenLayerIds.length === 0 ? [...annotations] : annotations.filter((a) => !hiddenLayerIds.includes(`${a.id}:annotation`));
