import { annotationElements } from './annotations';
import type { ChartDrawing } from './SceneChart';
import type { SceneElement } from './sceneElement';

const textsOf = (nodes: ReadonlyArray<SceneElement>): string[] =>
  nodes.flatMap((n) => [...(n.tag === 'text' || n.tag === 'tspan' ? (n.text !== undefined ? [n.text] : []) : []), ...textsOf(n.children ?? [])]);

/**
 * Every text a drawing writes (titles, tick labels, legend entries, labels, annotations, ...), one string for each text element
 * or line: what an export puts in its SVG. The editor's own marks are not texts and are not here.
 */
export function drawingTexts(drawing: ChartDrawing): string[] {
  return drawing.sections.flatMap((s) => ('nodes' in s ? textsOf(s.nodes) : 'annotations' in s ? textsOf(annotationElements(s.annotations, drawing.widthPt, drawing.heightPt, null, s.place)) : []));
}
