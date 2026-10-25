import type { Rect } from '../parts/layout';
import type { SceneElement } from './sceneElement';
import type { Id } from '../../../model/types';
import type { LayerKind } from '../../../model/graph/layers';

/**
 * The scene of a chart: what is drawn as data, as shapes in pt with their styles, in drawing order, before any renderer has
 * looked at it. The SVG of the screen, of the export and of the tests is made from it, and so is what the editor knows about
 * what can be clicked, so the three cannot disagree about where something is or what it is. Step one: the data layers of the
 * families that share the XY drawing (XY, survival, histogram); titles, axes, the legend and the other families follow.
 */

/** What every family has in a scene: the clip, what is behind the data and what is in front of it. */
export type ChromeScene = Pick<Scene, 'defs' | 'back' | 'front'> & {
  /** The data marks of a chart over categories, compiled the first time something asks for them (see column/columnMarks.ts and grouped/groupedMarks.ts); not enumerable. */
  marks?: SceneElement[];
};

/** What a click on a shape selects. */
export interface SceneHit {
  kind: 'point' | 'line' | 'error';
  groupId: Id;
  /** The observation of a point. */
  objectId?: Id;
}

export interface ScenePath {
  /** Stable, from the layer (and the observation) the shape belongs to; unique in the drawing. */
  id: string;
  d: string;
  fill: string;
  fillOpacity?: number;
  stroke: string;
  strokeWidth: number;
  strokeOpacity?: number;
  dashArray?: string;
  lineCap?: 'round' | 'butt';
  lineJoin?: 'round';
  /** Absent: the shape cannot be clicked. */
  hit?: SceneHit;
  /** In the editor a thin line is also given a transparent twin this wide, so that it can be hit. */
  hitWidthPt?: number;
  /** In the editor the shape gets a glow while its series is selected. */
  glow?: boolean;
}

export interface SceneLayer {
  /** The ID of the layer (see model/graph/layers.ts). */
  id: Id;
  kind: LayerKind;
  seriesId: Id | null;
  paths: ScenePath[];
  /** Shapes that are not paths (the bars of a histogram), drawn after the paths of the layer. */
  elements?: SceneElement[];
}

export interface Scene {
  widthPt: number;
  heightPt: number;
  /** The plotting region that the data are clipped to. */
  plot: Rect;
  /** What the drawing defines for the rest to use: the clip of the plotting region. */
  defs: SceneElement[];
  /** Behind the data: the backgrounds, the gridlines and the reference lines. */
  back: SceneElement[];
  /** The layers that are drawn, lowest first; a layer that is hidden or has nothing to draw is not here. */
  layers: SceneLayer[];
  /** In front of the data: the fitted parameters, the axes with their ticks and numbers, the frame, the scale bars, the titles, the at-risk table and the legend. */
  front: SceneElement[];
}

/** Every shape of the scene with what a click on it selects, for the editor's hit-testing and for the tests. */
export const sceneTargets = (scene: Scene): Array<{ id: string; layerId: Id; hit: SceneHit }> =>
  scene.layers.flatMap((l) => [
    ...l.paths.flatMap((p) => (p.hit ? [{ id: p.id, layerId: l.id, hit: p.hit }] : [])),
    // A shape that is not a path has no ID of its own: its object is the one that is hit.
    ...(l.elements ?? []).flatMap((e) => (e.hit && (e.hit.kind === 'bar' || e.hit.kind === 'point' || e.hit.kind === 'line' || e.hit.kind === 'error') ? [{ id: e.hit.objectId ?? l.id, layerId: l.id, hit: { kind: e.hit.kind, groupId: e.hit.groupId ?? '', ...(e.hit.objectId ? { objectId: e.hit.objectId } : {}) } as SceneHit }] : [])),
  ]);
