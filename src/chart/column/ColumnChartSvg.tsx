import { forwardRef } from 'react';
import type { Chart } from '../../model/types';
import { n2 } from '../../model/units';
import { BarLabelText } from '../shared/parts/BarLabelText';
import { compileColumnMarks } from './columnMarks';
import { AnnotationLayer, type EditorState, SELECT_COLOR } from '../shared/scene/ChartParts';
import { hitAttrs } from '../shared/scene/hitTest';
import type { ColumnModel, GroupGeom } from './columnModel';
import { SceneElements } from '../shared/scene/SceneElements';
import { compileColumnScene } from './columnChrome';

interface Props {
  chart: Chart;
  model: ColumnModel;
  /** Present only in the editor; export renders without it (no selection or hit attributes). */
  editor?: EditorState;
  /** CSS size of the <svg>. Export uses physical mm; the editor applies preview zoom. */
  cssWidth: string;
  cssHeight: string;
}


export const ColumnChartSvg = forwardRef<SVGSVGElement, Props>(function ColumnChartSvg({ chart, model, editor, cssWidth, cssHeight }, ref) {
  const { widthPt: W, heightPt: H, groups } = model;
  const { plot } = model.layout;
  const ed = !!editor;
  const hit = (kind: Parameters<typeof hitAttrs>[0], g?: string, o?: string, a?: string) => (ed ? hitAttrs(kind, g, o, a) : {});
  // Horizontal columns: the geometry of the model is the vertical drawing; marks are turned into place by one matrix,
  // symbols and text stay upright at their turned positions (see Orientation in shared/parts/orientation.ts).
  const { orient } = model;
  // The chrome (clip, backgrounds, grids, axes, titles, legend) is drawn from the scene.
  const scene = model.scene ?? compileColumnScene(chart, model);

  // The data set that owns each labelled point; label colour and font weight follow its style.
  const labelOwner = new Map<string, GroupGeom>();
  if (model.labels.items.length > 0) for (const g of groups) for (const p of g.points) labelOwner.set(p.id, g);

  const selectedGroup = editor?.selection.kind === 'group' ? editor.selection.groupId : null;
  const selectedPoint = editor?.selection.kind === 'point' ? editor.selection.pointId : null;

  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={cssWidth}
      height={cssHeight}
      viewBox={`0 0 ${n2(W)} ${n2(H)}`}
      fontFamily={chart.fontFamily}
      style={{ background: chart.pageColor ?? 'transparent' }}
    >
      <SceneElements nodes={scene.defs} editor={ed} />
      <SceneElements nodes={scene.back} editor={ed} />

      {/* Data marks, clipped to the plotting region: from the scene, like the chrome. */}
      <SceneElements nodes={scene.marks ?? compileColumnMarks(chart, model)} editor={ed} />

      {/* Labels above the bars. */}
      {chart.barLabels.show !== 'none' && groups.map((g) => g.barLabel && <BarLabelText key={g.barLabel.id} label={g.barLabel} cfg={chart.barLabels} textColor={chart.textColor} orient={orient} />)}

      <SceneElements nodes={scene.front} editor={ed} />

      {/* Point labels: outside the plot clip, leaders first. All coordinates come from the model. */}
      {model.labels.items.length > 0 && (
        <g>
          {model.labels.items.map((it) => {
            const color = it.color ?? chart.textColor;
            return it.leader ? (
              <path key={`leader-${it.id}`} d={`M${n2(it.leader.x1)},${n2(it.leader.y1)}L${n2(it.leader.x2)},${n2(it.leader.y2)}`} fill="none" stroke={color} strokeWidth={1} />
            ) : null;
          })}
          {model.labels.items.map((it) => {
            const owner = labelOwner.get(it.id);
            const color = it.color ?? chart.textColor;
            return (
              <g key={`label-${it.id}`} {...hit('label', owner?.groupId, it.id)}>
                {ed && <rect x={n2(it.box.x0)} y={n2(it.box.y0)} width={n2(it.box.x1 - it.box.x0)} height={n2(it.box.y1 - it.box.y0)} fill="transparent" />}
                <text
                  x={n2(it.x)}
                  y={n2(it.y)}
                  fontSize={it.fontSizePt}
                  fill={color}
                  {...(it.bold ? { fontWeight: 'bold' } : {})}
                  {...(it.italic ? { fontStyle: 'italic' } : {})}
                >
                  {it.shown}
                </text>
              </g>
            );
          })}
        </g>
      )}

      <AnnotationLayer chart={chart.hiddenLayerIds.length === 0 ? chart : { ...chart, annotations: chart.annotations.filter((a) => !chart.hiddenLayerIds.includes(`${a.id}:annotation`)) }} editor={editor} width={W} height={H} hit={hit} />

      {/* Editor-only selection overlay: never rendered in export. */}
      {ed && selectedPoint &&
        groups.flatMap((g) => g.points.filter((p) => p.id === selectedPoint)).map((p) => (
          <circle key={`ring-${p.id}`} data-editor-only cx={n2(p.cx)} cy={n2(p.cy)} r={n2(p.size / 2 + 6)} fill="none" stroke={SELECT_COLOR} strokeWidth={2.4} pointerEvents="none" />
        ))}
      {ed && selectedPoint &&
        model.labels.items.filter((it) => it.id === selectedPoint).map((it) => (
          <rect key={`label-sel-${it.id}`} data-editor-only x={n2(it.box.x0 - 4)} y={n2(it.box.y0 - 4)} width={n2(it.box.x1 - it.box.x0 + 8)} height={n2(it.box.y1 - it.box.y0 + 8)} fill="none" stroke={SELECT_COLOR} strokeWidth={2} strokeDasharray="6 4" pointerEvents="none" />
        ))}

      {ed && selectedGroup &&
        groups
          .filter((g) => g.groupId === selectedGroup)
          .map((g) => (
            <rect
              key={g.groupId}
              data-editor-only
              x={n2(g.slotX)}
              y={n2(plot.y)}
              width={n2(g.slotWidth)}
              height={n2(plot.height)}
              fill={SELECT_COLOR}
              fillOpacity={0.07}
              stroke={SELECT_COLOR}
              strokeWidth={2}
              strokeDasharray="8 6"
              pointerEvents="none"
            />
          ))}
    </svg>
  );
});

export type { EditorState };
