import { Fragment } from 'react';
import { SELECT_COLOR } from './annotations';
import { hitAttrs } from './hitTest';
import { prefixed, scopeRefs, useSvgIdPrefix } from './idPrefix';
import { SceneElements } from './SceneElements';
import type { Scene } from './scene';

/**
 * The shapes of a scene as SVG, in the scene's order. In the editor each shape that can be clicked carries its hit
 * attributes, a thin line has a transparent twin to be hit by, and the selected series is glowing; none of this is in an export.
 */
export function SceneSvg({ scene, editor, selectedGroups }: { scene: Scene; editor: boolean; selectedGroups: ReadonlySet<string> }) {
  const prefix = useSvgIdPrefix();
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
                  fill={scopeRefs(prefix, p.fill)}
                  fillOpacity={p.fillOpacity}
                  stroke={scopeRefs(prefix, p.stroke)}
                  strokeWidth={p.strokeWidth === 0 ? undefined : p.strokeWidth}
                  strokeOpacity={p.strokeOpacity}
                  strokeDasharray={p.dashArray}
                  strokeLinecap={p.lineCap}
                  strokeLinejoin={p.lineJoin}
                  pointerEvents={p.hit || !editor ? undefined : 'none'}
                  {...hit}
                  id={prefixed(prefix, p.id)}
                />
                {editor && p.hit && p.hitWidthPt !== undefined && <path d={p.d} fill="none" stroke="transparent" strokeWidth={p.hitWidthPt} {...hitAttrs(p.hit.kind, p.hit.groupId, p.hit.objectId)} />}
                {editor && p.glow && p.hit && p.hit.groupId !== undefined && selectedGroups.has(p.hit.groupId) && (
                  <path data-editor-only d={p.d} fill="none" stroke={SELECT_COLOR} strokeOpacity={0.35} strokeWidth={p.strokeWidth + 10} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
                )}
              </Fragment>
            );
          })}
          {layer.elements && <SceneElements nodes={layer.elements} editor={editor} />}
        </Fragment>
      ))}
    </>
  );
}
