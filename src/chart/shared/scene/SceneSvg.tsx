import { Fragment } from 'react';
import { SELECT_COLOR } from './ChartParts';
import { hitAttrs } from './hitTest';
import type { Scene } from './scene';

/**
 * The shapes of a scene as SVG, in the scene's order. In the editor each shape that can be clicked carries its hit
 * attributes, a thin line has a transparent twin to be hit by, and the selected series is glowing; none of this is in an export.
 */
export function SceneSvg({ scene, editor, selectedGroup }: { scene: Scene; editor: boolean; selectedGroup: string | null }) {
  return (
    <>
      {scene.layers.map((layer) => (
        <Fragment key={layer.id}>
          {layer.paths.map((p) => {
            const hit = editor && p.hit ? hitAttrs(p.hit.kind, p.hit.groupId, p.hit.objectId) : {};
            return (
              <Fragment key={p.id}>
                <path
                  d={p.d}
                  fill={p.fill}
                  fillOpacity={p.fillOpacity}
                  stroke={p.stroke}
                  strokeWidth={p.strokeWidth === 0 ? undefined : p.strokeWidth}
                  strokeOpacity={p.strokeOpacity}
                  strokeDasharray={p.dashArray}
                  strokeLinecap={p.lineCap}
                  strokeLinejoin={p.lineJoin}
                  pointerEvents={p.hit || !editor ? undefined : 'none'}
                  {...hit}
                  id={p.id}
                />
                {editor && p.hit && p.hitWidthPt !== undefined && <path d={p.d} fill="none" stroke="transparent" strokeWidth={p.hitWidthPt} {...hitAttrs(p.hit.kind, p.hit.groupId, p.hit.objectId)} />}
                {editor && p.glow && p.hit && selectedGroup === p.hit.groupId && (
                  <path data-editor-only d={p.d} fill="none" stroke={SELECT_COLOR} strokeOpacity={0.35} strokeWidth={p.strokeWidth + 10} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
                )}
              </Fragment>
            );
          })}
        </Fragment>
      ))}
    </>
  );
}
