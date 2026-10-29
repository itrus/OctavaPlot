import { createElement, memo, type ReactNode } from 'react';
import { hitAttrs } from './hitTest';
import { prefixed, scopeRefs, useSvgIdPrefix } from './idPrefix';
import type { SceneElement } from './sceneElement';
import { richPieces } from './richSvg';
import { RUN_SIZE, sameRun, type RunProps } from './sceneRuns';
import { hasMarkup } from '../../../util/richText';

/** `stroke-width` -> `strokeWidth`: React's name for the attribute; data- and aria- attributes are written as they are. */
const reactName = (name: string): string => (name === 'class' ? 'className' : name.startsWith('data-') || name.startsWith('aria-') ? name : name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()));

const NONE: ReadonlySet<string> = new Set();

function render(node: SceneElement, key: number, editor: boolean, selectedGroups: ReadonlySet<string>, selectedAnnotations: ReadonlySet<string>, prefix: string): ReactNode {
  if (node.editorOnly && !editor) return null;
  if (node.whenSelected !== undefined && !(editor && selectedGroups.has(node.whenSelected))) return null;
  if (node.whenAnnotationSelected !== undefined && !(editor && selectedAnnotations.has(node.whenAnnotationSelected))) return null;
  const props: Record<string, unknown> = { key };
  for (const [name, value] of node.attrs ?? []) if (value !== undefined) props[reactName(name)] = scopeRefs(prefix, value);
  if (editor) for (const [name, value] of node.editorAttrs ?? []) if (value !== undefined) props[reactName(name)] = scopeRefs(prefix, value);
  if (editor && node.hit) Object.assign(props, hitAttrs(node.hit.kind, node.hit.groupId, node.hit.objectId, node.hit.annotationId));
  if (node.id !== undefined) props.id = prefixed(prefix, node.id);
  const children = node.children && renderList(node.children, editor, selectedGroups, selectedAnnotations, prefix);
  // A text with markup (subscripts, superscripts, Greek names) is written as pieces; text without it is written exactly as it was.
  if ((node.tag === 'text' || node.tag === 'tspan') && node.text !== undefined && hasMarkup(node.text)) {
    const pieces = richPieces(node.text).map((p, i): ReactNode => (p.fontSize === undefined && p.dy === undefined ? p.text : createElement('tspan', { key: `r${i}`, ...(p.fontSize !== undefined ? { fontSize: p.fontSize } : {}), ...(p.dy !== undefined ? { dy: p.dy } : {}) }, p.text)));
    return createElement(node.tag, props, ...pieces);
  }
  return createElement(node.tag, props, ...(node.text !== undefined ? [node.text] : children ?? []));
}

/** A run of a long list: written again only when its shapes or the editor's choices changed (see sceneRuns.ts). */
const Run = memo(function Run({ nodes, start, editor, selectedGroups, selectedAnnotations, prefix }: RunProps) {
  return <>{nodes.map((n, i) => render(n, start + i, editor, selectedGroups, selectedAnnotations, prefix))}</>;
}, sameRun);

/** Shapes in order; a long list is cut into runs, which are fragments, so the markup is the same as without them. */
function renderList(nodes: ReadonlyArray<SceneElement>, editor: boolean, selectedGroups: ReadonlySet<string>, selectedAnnotations: ReadonlySet<string>, prefix: string): ReactNode[] {
  if (nodes.length <= RUN_SIZE) return nodes.map((n, i) => render(n, i, editor, selectedGroups, selectedAnnotations, prefix));
  const runs: ReactNode[] = [];
  for (let start = 0; start < nodes.length; start += RUN_SIZE) runs.push(<Run key={start} nodes={nodes.slice(start, start + RUN_SIZE)} start={start} editor={editor} selectedGroups={selectedGroups} selectedAnnotations={selectedAnnotations} prefix={prefix} />);
  return runs;
}

/** The elements of a scene as SVG, in order. In the editor they carry their hit attributes; in an export they do not. */
export function SceneElements({ nodes, editor, selectedGroups = NONE, selectedAnnotations = NONE }: { nodes: ReadonlyArray<SceneElement>; editor: boolean; selectedGroups?: ReadonlySet<string>; selectedAnnotations?: ReadonlySet<string> }) {
  const prefix = useSvgIdPrefix();
  return <>{renderList(nodes, editor, selectedGroups, selectedAnnotations, prefix)}</>;
}
