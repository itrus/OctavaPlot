import type { ReactElement } from 'react';
import type { ChartStyle } from '../model/types';
import { barMarkElement, keyMarkElement } from './fillElements';
import { LEGEND_KEY } from './layout';
import type { BarGeom } from './model';
import { SceneElements } from './SceneElements';

export { fillClipId } from './fillElements';

/** One bar (made by barMarkElement, see fillElements.ts): the exact legacy rect in solid mode, marks under a frame otherwise. */
export function BarMark({ bar, chartId, editor }: { bar: BarGeom; chartId: string; editor: boolean }): ReactElement {
  return <SceneElements nodes={[barMarkElement(bar, chartId)]} editor={editor} />;
}

/** Legend key (36 x 20 pt): solid keeps the legacy rect, pattern and none show the fill at key scale. */
export function KeyMark({ style, x, y, chartId, groupId, editor, width = LEGEND_KEY.width }: { style: ChartStyle; x: number; y: number; width?: number; chartId: string; groupId: string; editor: boolean }): ReactElement {
  return <SceneElements nodes={[keyMarkElement(style, x, y, chartId, groupId, width)]} editor={editor} />;
}
