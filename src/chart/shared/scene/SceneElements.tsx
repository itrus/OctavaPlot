import { createElement, type ReactNode } from 'react';
import { hitAttrs } from './hitTest';
import { prefixed, scopeRefs, useSvgIdPrefix } from './idPrefix';
import type { SceneElement } from './sceneElement';

/** `stroke-width` -> `strokeWidth`: React's name for the attribute; data- and aria- attributes are written as they are. */
const reactName = (name: string): string => (name === 'class' ? 'className' : name.startsWith('data-') || name.startsWith('aria-') ? name : name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()));

function render(node: SceneElement, key: number, editor: boolean, selectedGroup: string | null, selectedAnnotation: string | null, prefix: string): ReactNode {
  if (node.editorOnly && !editor) return null;
  if (node.whenSelected !== undefined && !(editor && selectedGroup === node.whenSelected)) return null;
  if (node.whenAnnotationSelected !== undefined && !(editor && selectedAnnotation === node.whenAnnotationSelected)) return null;
  const props: Record<string, unknown> = { key };
  for (const [name, value] of node.attrs ?? []) if (value !== undefined) props[reactName(name)] = scopeRefs(prefix, value);
  if (editor) for (const [name, value] of node.editorAttrs ?? []) if (value !== undefined) props[reactName(name)] = scopeRefs(prefix, value);
  if (editor && node.hit) Object.assign(props, hitAttrs(node.hit.kind, node.hit.groupId, node.hit.objectId, node.hit.annotationId));
  if (node.id !== undefined) props.id = prefixed(prefix, node.id);
  const children = node.children?.map((c, i) => render(c, i, editor, selectedGroup, selectedAnnotation, prefix));
  return createElement(node.tag, props, ...(node.text !== undefined ? [node.text] : children ?? []));
}

/** The elements of a scene as SVG, in order. In the editor they carry their hit attributes; in an export they do not. */
export function SceneElements({ nodes, editor, selectedGroup = null, selectedAnnotation = null }: { nodes: ReadonlyArray<SceneElement>; editor: boolean; selectedGroup?: string | null; selectedAnnotation?: string | null }) {
  const prefix = useSvgIdPrefix();
  return <>{nodes.map((n, i) => render(n, i, editor, selectedGroup, selectedAnnotation, prefix))}</>;
}
