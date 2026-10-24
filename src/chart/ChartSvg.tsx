import { forwardRef } from 'react';
import type { Chart } from '../model/types';
import { n2 } from '../model/units';
import { BarLabelText } from './BarLabelText';
import { compileCategoryScene } from './categoryChrome';
import { Turned, AnnotationLayer, type EditorState, SELECT_COLOR } from './ChartParts';
import { BarMark } from './FillMarks';
import { hitAttrs } from './hitTest';
import type { ChartModel, GroupGeom } from './model';
import { SceneElements } from './SceneElements';
import { symbolPath } from './symbols';

interface Props {
  chart: Chart;
  model: ChartModel;
  /** Present only in the editor; export renders without it (no selection or hit attributes). */
  editor?: EditorState;
  /** CSS size of the <svg>. Export uses physical mm; the editor applies preview zoom. */
  cssWidth: string;
  cssHeight: string;
}


export const ChartSvg = forwardRef<SVGSVGElement, Props>(function ChartSvg({ chart, model, editor, cssWidth, cssHeight }, ref) {
  const { widthPt: W, heightPt: H, groups } = model;
  const { plot } = model.layout;
  const ed = !!editor;
  const hit = (kind: Parameters<typeof hitAttrs>[0], g?: string, o?: string, a?: string) => (ed ? hitAttrs(kind, g, o, a) : {});
  // Horizontal columns: the geometry of the model is the vertical drawing; marks are turned into place by one matrix,
  // symbols and text stay upright at their turned positions (see Orientation in model.ts).
  const { orient } = model;
  // The chrome (clip, backgrounds, grids, axes, titles, legend) is drawn from the scene.
  const scene = model.scene ?? compileCategoryScene(chart, model);

  // The data set that owns each labelled point; label colour and font weight follow its style.
  const labelOwner = new Map<string, GroupGeom>();
  if (model.labels.items.length > 0) for (const g of groups) for (const p of g.points) labelOwner.set(p.id, g);

  const selectedGroup = editor?.selection.kind === 'group' ? editor.selection.groupId : null;
  const selectedPoint = editor?.selection.kind === 'point' ? editor.selection.pointId : null;

  // Lines and error bars go over the bars and symbols, under them, or (auto) over the bars and under the symbols.
  const onTop = chart.lineOrder === 'onTop';
  const bars = (
    <Turned matrix={orient.matrix}>
        {groups.map((g) => g.bar && <BarMark key={g.bar.id} bar={g.bar} chartId={chart.id} editor={ed} />)}
        {groups.map((g) =>
          g.dist && (
            <g key={`${g.groupId}:dist`} fill="none">
              {g.dist.outline && g.style.showBars && (
                <path d={g.dist.outline} fill={g.style.barFill} fillOpacity={g.style.barOpacity} stroke={g.style.barBorderColor} strokeWidth={g.style.barBorderWidthPt} strokeOpacity={g.style.barBorderOpacity < 1 ? g.style.barBorderOpacity : undefined} strokeLinejoin="round" {...hit('bar', g.groupId, `${g.groupId}:bar`)} />
              )}
              {g.dist.lines.map((l) => (
                <path key={l.id} d={l.d} stroke={l.color} strokeWidth={l.strokeWidth} strokeOpacity={l.opacity < 1 ? l.opacity : undefined} strokeDasharray={l.dash} strokeLinecap="butt" {...hit('bar', g.groupId, `${g.groupId}:bar`)} />
              ))}
            </g>
          ),
        )}
    </Turned>
  );
  const linesAndErrors = (
    <Turned matrix={orient.matrix}>
        {model.pairLines.map((l) => (
          <path key={l.id} d={l.d} fill="none" stroke={l.color} strokeWidth={l.strokeWidth} strokeOpacity={l.opacity < 1 ? l.opacity : undefined} strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {groups.map((g) => g.connector && (
          <path key={g.connector.id} d={g.connector.d} fill="none" stroke={g.connector.color} strokeWidth={g.connector.strokeWidth} strokeOpacity={g.connector.opacity < 1 ? g.connector.opacity : undefined} strokeLinecap="round" {...hit('line', g.groupId, g.connector.id)} />
        ))}
        {groups.map((g) => g.errorBar && (
          <g key={g.errorBar.id} {...hit('error', g.groupId, g.errorBar.id)}>
            <path d={g.errorBar.d} fill="none" stroke={g.errorBar.color} strokeWidth={g.errorBar.strokeWidth} strokeOpacity={g.errorBar.opacity < 1 ? g.errorBar.opacity : undefined} strokeLinecap="butt" />
            {ed && <path d={g.errorBar.d} fill="none" stroke="transparent" strokeWidth={16} />}
          </g>
        ))}
        {groups.map((g) => g.meanLine && (
          <path key={g.meanLine.id} d={g.meanLine.d} fill="none" stroke={g.meanLine.color} strokeWidth={g.meanLine.strokeWidth} strokeOpacity={g.meanLine.opacity < 1 ? g.meanLine.opacity : undefined} strokeLinecap="butt" {...hit('meanLine', g.groupId, g.meanLine.id)} />
        ))}
    </Turned>
  );
  const points = (
    <>
        {groups.map((g) =>
          g.points.map((p) => (
            <path
              key={p.id}
              d={symbolPath(p.shape, orient.toScreen(p.cx, p.cy).x, orient.toScreen(p.cx, p.cy).y, p.size)}
              fill={p.color}
              fillOpacity={p.fillOpacity < 1 ? p.fillOpacity : undefined}
              stroke={p.borderColor}
              strokeWidth={p.borderWidth}
              strokeOpacity={p.borderOpacity < 1 ? p.borderOpacity : undefined}
              {...hit('point', g.groupId, p.id)}
            />
          )),
        )}
    </>
  );

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

      {/* Data marks, clipped to the plotting region. Error bars are independent of bars and symbols. */}
      <g clipPath="url(#plot-clip)">
        {onTop ? (
          <>
            {bars}
            {points}
            {linesAndErrors}
          </>
        ) : chart.lineOrder === 'underneath' ? (
          <>
            {linesAndErrors}
            {bars}
            {points}
          </>
        ) : (
          <>
            {bars}
            {linesAndErrors}
            {points}
          </>
        )}
      </g>

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

      <AnnotationLayer chart={chart} editor={editor} width={W} height={H} hit={hit} />

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
