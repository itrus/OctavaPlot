import type { ReactElement } from 'react';
import { barMarkElement } from './fillElements';
import type { BarGeom } from './model';
import { SceneElements } from './SceneElements';

export { fillClipId } from './fillElements';

/** One bar (made by barMarkElement, see fillElements.ts): the exact legacy rect in solid mode, marks under a frame otherwise. */
export function BarMark({ bar, chartId, editor }: { bar: BarGeom; chartId: string; editor: boolean }): ReactElement {
  return <SceneElements nodes={[barMarkElement(bar, chartId)]} editor={editor} />;
}
