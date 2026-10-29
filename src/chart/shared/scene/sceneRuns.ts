import type { SceneElement } from './sceneElement';

/**
 * A long list of shapes (the dots of a graph of 100 000 observations) is written to React in runs of this many, each of them one
 * memoised component that adds no element of its own to the drawing. When an edit changes only the text of a title, every run
 * holds the very same shape objects as before and React skips it, instead of building and comparing 100 000 elements again.
 */
export const RUN_SIZE = 256;

/** What a run of shapes reads: the shapes themselves, where it starts in its list (the keys) and what the editor chooses to show. */
export interface RunProps {
  nodes: ReadonlyArray<SceneElement>;
  start: number;
  editor: boolean;
  selectedGroups: ReadonlySet<string>;
  selectedAnnotations: ReadonlySet<string>;
  prefix: string;
}

/** True when drawing the run again would give the same markup: the same shape objects, in the same places, under the same choices. */
export function sameRun(a: RunProps, b: RunProps): boolean {
  if (a.start !== b.start || a.editor !== b.editor || a.prefix !== b.prefix) return false;
  const sameSet = (x: ReadonlySet<string>, y: ReadonlySet<string>) => x === y || (x.size === y.size && [...x].every((v) => y.has(v)));
  if (!sameSet(a.selectedGroups, b.selectedGroups) || !sameSet(a.selectedAnnotations, b.selectedAnnotations)) return false;
  if (a.nodes.length !== b.nodes.length) return false;
  for (let i = 0; i < a.nodes.length; i++) if (a.nodes[i] !== b.nodes[i]) return false;
  return true;
}
