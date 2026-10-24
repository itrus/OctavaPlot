import { createElement, type ReactNode } from 'react';
import { hitAttrs } from './hitTest';
import type { SceneElement } from './sceneElement';

/** `stroke-width` -> `strokeWidth`: React's name for the attribute; data- and aria- attributes are written as they are. */
const reactName = (name: string): string => (name === 'class' ? 'className' : name.startsWith('data-') || name.startsWith('aria-') ? name : name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()));

function render(node: SceneElement, key: number, editor: boolean): ReactNode {
  if (node.editorOnly && !editor) return null;
  const props: Record<string, unknown> = { key };
  for (const [name, value] of node.attrs ?? []) if (value !== undefined) props[reactName(name)] = value;
  if (editor) for (const [name, value] of node.editorAttrs ?? []) if (value !== undefined) props[reactName(name)] = value;
  if (editor && node.hit) Object.assign(props, hitAttrs(node.hit.kind, node.hit.groupId, node.hit.objectId, node.hit.annotationId));
  if (node.id !== undefined) props.id = node.id;
  const children = node.children?.map((c, i) => render(c, i, editor));
  return createElement(node.tag, props, ...(node.text !== undefined ? [node.text] : children ?? []));
}

/** The elements of a scene as SVG, in order. In the editor they carry their hit attributes; in an export they do not. */
export function SceneElements({ nodes, editor }: { nodes: ReadonlyArray<SceneElement>; editor: boolean }) {
  return <>{nodes.map((n, i) => render(n, i, editor))}</>;
}
