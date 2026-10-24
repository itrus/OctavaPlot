import { referenceLineElements } from './chrome';
import type { PlacedReferenceLine } from './referenceLines';
import { SceneElements } from './SceneElements';

/** The reference lines of a chart, behind the data and clipped to the plotting region; their labels sit at the line's end. */
export function ReferenceLinesLayer({ lines, fontSizePt }: { lines: readonly PlacedReferenceLine[]; fontSizePt: number }) {
  return <SceneElements nodes={referenceLineElements(lines, fontSizePt)} editor={false} />;
}
