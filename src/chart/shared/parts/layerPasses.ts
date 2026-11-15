import type { LayerKind, LayerSpec } from '../../../model/graph/layers';
import { type Orientation, turned } from './orientation';
import type { SceneElement } from '../scene/sceneElement';

/** The pass a layer is drawn in: the body (bars), the lines, then the points; the points are never turned with a horizontal chart's matrix, as they are placed already. */
export type DrawPass = 'body' | 'lines' | 'points';

/**
 * The layers of a chart in drawing order, as elements: layers that follow each other in the same pass are one run, which is turned (for a
 * horizontal chart) together. A layer with no pass, or hidden by its ID, draws nothing.
 */
export function drawLayerPasses(
  layers: readonly LayerSpec[],
  passOf: Partial<Record<LayerKind, DrawPass>>,
  hidden: ReadonlySet<string>,
  orient: Orientation,
  elementsOf: (layer: LayerSpec) => SceneElement[],
): SceneElement[] {
  const out: SceneElement[] = [];
  let run: { pass: DrawPass; items: SceneElement[] } | null = null;
  const flush = () => {
    if (run) out.push(...(run.pass === 'points' ? run.items : turned(orient, run.items)));
    run = null;
  };
  for (const layer of layers) {
    const pass = passOf[layer.kind];
    if (!pass || hidden.has(layer.id)) continue;
    if (!run || run.pass !== pass) {
      flush();
      run = { pass, items: [] };
    }
    run.items.push(...elementsOf(layer));
  }
  flush();
  return out;
}
