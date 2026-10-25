import type { HitKind } from './hitTest';

/**
 * A shape or a piece of text of a scene, with its attributes in the order they are written. It is the neutral form the
 * chrome of a chart (backgrounds, grids, axes, ticks, titles, legend, ...) is compiled to: geometry in pt, style, what a
 * click on it selects. The SVG of the screen and of an export is made from it, and any other writer (a string, a canvas)
 * can be made from it as well.
 */
export interface SceneElement {
  tag: 'g' | 'path' | 'rect' | 'text' | 'tspan' | 'circle' | 'defs' | 'clipPath';
  /** SVG attribute names (hyphenated) and values, in the order they are written; an undefined value is left out. */
  attrs?: ReadonlyArray<readonly [string, string | number | undefined]>;
  /** The text of a text element. */
  text?: string;
  /** Attributes written after the others in the editor only (for example pointer-events). */
  editorAttrs?: ReadonlyArray<readonly [string, string | number | undefined]>;
  children?: ReadonlyArray<SceneElement>;
  /** What a click on the element selects; the editor writes it as attributes, an export does not. */
  hit?: { kind: HitKind; groupId?: string; objectId?: string; annotationId?: string };
  /** Written after the attributes. */
  id?: string;
  /** Present only in the editor (a transparent twin that makes a thin line easy to hit). */
  editorOnly?: boolean;
  /** Present only in the editor, while the series (data set) with this ID is selected (its glow, its frame). */
  whenSelected?: string;
}

type Attrs = NonNullable<SceneElement['attrs']>;

/** An element from its tag, its attributes and, optionally, its children and the other fields. */
export const el = (tag: SceneElement['tag'], attrs: Attrs = [], rest: Omit<SceneElement, 'tag' | 'attrs'> = {}): SceneElement => ({ tag, attrs, ...rest });
