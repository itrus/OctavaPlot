import { gridElements, type GridProps } from './chrome';
import { SceneElements } from './SceneElements';

/** The gridlines of one axis, major and minor, drawn behind the data (made by gridElements, see chrome.ts). */
export function GridLines(props: GridProps) {
  return <SceneElements nodes={gridElements(props)} editor={false} />;
}
