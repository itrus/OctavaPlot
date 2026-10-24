import { fitParameterElements } from './chrome';
import { SceneElements } from './SceneElements';
import type { XySeries } from './xyModel';

/** The fitted parameters of each series, one block of lines per curve in the colour of the curve. */
export function FitParameters({ series, x, y, fontSizePt, level }: { series: XySeries[]; x: number; y: number; fontSizePt: number; level: number }) {
  return <SceneElements nodes={fitParameterElements(series, x, y, fontSizePt, level)} editor={false} />;
}
