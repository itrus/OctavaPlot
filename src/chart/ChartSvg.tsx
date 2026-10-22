import { forwardRef, type ReactElement } from 'react';
import { FONT_FAMILY } from '../model/defaults';
import type { Annotation, Chart, Selection } from '../model/types';
import { n2 } from '../model/units';
import { BarMark, KeyMark } from './FillMarks';
import { hitAttrs } from './hitTest';
import { LEGEND_KEY, TICK_LENGTH, X_TICK_LABEL_GAP, Y_TICK_LABEL_GAP } from './layout';
import type { ChartModel, GroupGeom } from './model';
import { symbolPath } from './symbols';
import { measureText } from './text';

export interface EditorState {
  selection: Selection;
  /** Annotation being dragged: its live position (fractions) overrides the stored one. */
  dragging?: { id: string; xFrac: number; yFrac: number } | null;
}

interface Props {
  chart: Chart;
  model: ChartModel;
  /** Present only in the editor; export renders without it (no selection or hit attributes). */
  editor?: EditorState;
  /** CSS size of the <svg>. Export uses physical mm; the editor applies preview zoom. */
  cssWidth: string;
  cssHeight: string;
}

const AXIS_COLOR = '#000000';
const GRID_COLOR = '#d0d0d0';
const SELECT_COLOR = '#2b7fff';

function annotationBox(a: Annotation, x: number, y: number) {
  const lines = a.text.split('\n');
  const w = Math.max(...lines.map((l) => measureText(l, a.fontSizePt)), 4);
  const h = lines.length * a.fontSizePt * 1.2;
  return { x, y, w, h, lines };
}

function LegendSwatch({ g, x, y, chartId, editor }: { g: GroupGeom; x: number; y: number; chartId: string; editor: boolean }): ReactElement {
  const s = g.style;
  const w = LEGEND_KEY.width;
  if (s.showBars) return <KeyMark style={s} x={x} y={y} chartId={chartId} groupId={g.groupId} editor={editor} />;
  return (
    <g>
      {s.showLines && <path d={`M${n2(x)},${n2(y)}H${n2(x + w)}`} stroke={s.lineColor} strokeWidth={s.lineWidthPt} fill="none" />}
      {s.showSymbols && (
        <path d={symbolPath(s.symbolShape, x + w / 2, y, s.symbolSizePt)} fill={s.symbolColor} stroke={s.symbolBorderColor} strokeWidth={s.symbolBorderWidthPt} />
      )}
    </g>
  );
}

export const ChartSvg = forwardRef<SVGSVGElement, Props>(function ChartSvg({ chart, model, editor, cssWidth, cssHeight }, ref) {
  const { widthPt: W, heightPt: H, layout, groups, y } = model;
  const { plot } = layout;
  const ed = !!editor;
  const hit = (kind: Parameters<typeof hitAttrs>[0], g?: string, o?: string, a?: string) => (ed ? hitAttrs(kind, g, o, a) : {});
  const xa = chart.xAxis;
  const ya = chart.yAxis;
  const plotBottom = plot.y + plot.height;
  const plotRight = plot.x + plot.width;
  const y2a = chart.y2Axis;
  // model.y2 is null while no data set is bound to the right axis; a hidden right axis draws nothing.
  const y2R = model.y2 && model.y2Scale && y2a.visible ? model.y2 : null;
  const y2Scale = model.y2Scale as (v: number) => number;

  // The data set that owns each labelled point; label colour and font weight follow its style.
  const labelOwner = new Map<string, GroupGeom>();
  if (model.labels.items.length > 0) for (const g of groups) for (const p of g.points) labelOwner.set(p.id, g);

  const selectedGroup = editor?.selection.kind === 'group' ? editor.selection.groupId : null;
  const selectedPoint = editor?.selection.kind === 'point' ? editor.selection.pointId : null;
  const selectedAnnotation = editor?.selection.kind === 'annotation' ? editor.selection.annotationId : null;

  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={cssWidth}
      height={cssHeight}
      viewBox={`0 0 ${n2(W)} ${n2(H)}`}
      fontFamily={FONT_FAMILY}
      style={{ background: '#ffffff' }}
    >
      <defs>
        <clipPath id="plot-clip">
          <rect x={n2(plot.x)} y={n2(plot.y)} width={n2(plot.width)} height={n2(plot.height)} />
        </clipPath>
      </defs>

      {/* Backgrounds. The chart background is the hit target for "chart-level" selection. */}
      <rect x={0} y={0} width={n2(W)} height={n2(H)} fill="#ffffff" {...hit('background')} />
      <rect x={n2(plot.x)} y={n2(plot.y)} width={n2(plot.width)} height={n2(plot.height)} fill="#ffffff" {...hit('background')} />

      {/* Gridlines (behind data). */}
      {ya.visible && ya.showGrid && (
        <g stroke={GRID_COLOR} strokeWidth={0.5} fill="none">
          {y.ticks.map((t) => (
            <path key={t} d={`M${n2(plot.x)},${n2(model.yScale(t))}H${n2(plot.x + plot.width)}`} />
          ))}
        </g>
      )}

      {/* Right gridlines: dashed when the left grid is also drawn, so the two sets stay distinguishable. */}
      {y2R && y2a.showGrid && (
        <g stroke={GRID_COLOR} strokeWidth={0.5} fill="none" strokeDasharray={ya.visible && ya.showGrid ? '3 3' : undefined}>
          {y2R.ticks.map((t) => (
            <path key={t} d={`M${n2(plot.x)},${n2(y2Scale(t))}H${n2(plot.x + plot.width)}`} />
          ))}
        </g>
      )}

      {/* Data marks, clipped to the plotting region. Error bars are independent of bars and symbols. */}
      <g clipPath="url(#plot-clip)">
        {groups.map((g) => g.bar && <BarMark key={g.bar.id} bar={g.bar} chartId={chart.id} editor={ed} />)}
        {groups.map((g) => g.connector && (
          <path key={g.connector.id} d={g.connector.d} fill="none" stroke={g.connector.color} strokeWidth={g.connector.strokeWidth} strokeLinecap="round" {...hit('line', g.groupId, g.connector.id)} />
        ))}
        {groups.map((g) => g.errorBar && (
          <g key={g.errorBar.id} {...hit('error', g.groupId, g.errorBar.id)}>
            <path d={g.errorBar.d} fill="none" stroke={g.errorBar.color} strokeWidth={g.errorBar.strokeWidth} strokeLinecap="butt" />
            {ed && <path d={g.errorBar.d} fill="none" stroke="transparent" strokeWidth={8} />}
          </g>
        ))}
        {groups.map((g) => g.meanLine && (
          <path key={g.meanLine.id} d={g.meanLine.d} fill="none" stroke={g.meanLine.color} strokeWidth={g.meanLine.strokeWidth} strokeLinecap="butt" {...hit('meanLine', g.groupId, g.meanLine.id)} />
        ))}
        {groups.map((g) =>
          g.points.map((p) => (
            <path
              key={p.id}
              d={symbolPath(p.shape, p.cx, p.cy, p.size)}
              fill={p.color}
              stroke={p.borderColor}
              strokeWidth={p.borderWidth}
              {...hit('point', g.groupId, p.id)}
            />
          )),
        )}
      </g>

      {/* Axes. */}
      {ya.visible && (
        <g stroke={AXIS_COLOR} strokeWidth={ya.lineWidthPt} fill="none" strokeLinecap="square">
          <path d={`M${n2(plot.x)},${n2(plot.y)}V${n2(plotBottom)}`} />
          {y.ticks.map((t) => (
            <path key={t} d={`M${n2(plot.x)},${n2(model.yScale(t))}h${-TICK_LENGTH}`} strokeLinecap="butt" />
          ))}
        </g>
      )}
      {ya.visible &&
        y.ticks.map((t) => (
          <text
            key={t}
            x={n2(plot.x - TICK_LENGTH - Y_TICK_LABEL_GAP)}
            y={n2(model.yScale(t))}
            dy="0.35em"
            textAnchor="end"
            fontSize={ya.tickFontSizePt}
            fontWeight="bold"
            fill={AXIS_COLOR}
          >
            {y.tickLabel(t)}
          </text>
        ))}
      {y2R && (
        <g stroke={AXIS_COLOR} strokeWidth={y2a.lineWidthPt} fill="none" strokeLinecap="square">
          <path d={`M${n2(plotRight)},${n2(plot.y)}V${n2(plotBottom)}`} />
          {y2R.ticks.map((t) => (
            <path key={t} d={`M${n2(plotRight)},${n2(y2Scale(t))}h${TICK_LENGTH}`} strokeLinecap="butt" />
          ))}
        </g>
      )}
      {y2R &&
        y2R.ticks.map((t) => (
          <text
            key={t}
            x={n2(plotRight + TICK_LENGTH + Y_TICK_LABEL_GAP)}
            y={n2(y2Scale(t))}
            dy="0.35em"
            textAnchor="start"
            fontSize={y2a.tickFontSizePt}
            fontWeight="bold"
            fill={AXIS_COLOR}
          >
            {y2R.tickLabel(t)}
          </text>
        ))}
      {xa.visible && (
        <g stroke={AXIS_COLOR} strokeWidth={xa.lineWidthPt} fill="none" strokeLinecap="square">
          <path d={`M${n2(plot.x)},${n2(plotBottom)}H${n2(plot.x + plot.width)}`} />
          {groups.map((g) => (
            <path key={g.groupId} d={`M${n2(g.centerX)},${n2(plotBottom)}v${TICK_LENGTH}`} strokeLinecap="butt" />
          ))}
        </g>
      )}
      {xa.visible &&
        groups.map((g) => {
          const ty = plotBottom + TICK_LENGTH + X_TICK_LABEL_GAP + xa.tickFontSizePt * 0.8;
          const common = { fontSize: xa.tickFontSizePt, fontWeight: 'bold' as const, fill: AXIS_COLOR };
          return layout.xTickRotated ? (
            <text key={g.groupId} x={n2(g.centerX)} y={n2(ty - xa.tickFontSizePt * 0.4)} textAnchor="end" transform={`rotate(-45 ${n2(g.centerX)} ${n2(ty - xa.tickFontSizePt * 0.4)})`} {...common}>
              {g.label}
            </text>
          ) : (
            <text key={g.groupId} x={n2(g.centerX)} y={n2(ty)} textAnchor="middle" {...common}>
              {g.label}
            </text>
          );
        })}

      {/* Titles. */}
      {layout.title && (
        <text x={n2(layout.title.x)} y={n2(layout.title.y)} textAnchor="middle" fontSize={layout.title.fontSizePt} fontWeight="bold" fill={AXIS_COLOR}>
          {chart.title}
        </text>
      )}
      {layout.xTitle && (
        <text x={n2(layout.xTitle.x)} y={n2(layout.xTitle.y)} textAnchor="middle" fontSize={xa.titleFontSizePt} fontWeight="bold" fill={AXIS_COLOR}>
          {xa.title}
        </text>
      )}
      {layout.yTitle && (
        <text
          x={n2(layout.yTitle.x)}
          y={n2(layout.yTitle.y)}
          textAnchor="middle"
          transform={`rotate(-90 ${n2(layout.yTitle.x)} ${n2(layout.yTitle.y)})`}
          fontSize={ya.titleFontSizePt}
          fontWeight="bold"
          fill={AXIS_COLOR}
        >
          {ya.title}
        </text>
      )}

      {y2R && layout.y2Title && (
        <text
          x={n2(layout.y2Title.x)}
          y={n2(layout.y2Title.y)}
          textAnchor="middle"
          transform={`rotate(-90 ${n2(layout.y2Title.x)} ${n2(layout.y2Title.y)})`}
          fontSize={y2a.titleFontSizePt}
          fontWeight="bold"
          fill={AXIS_COLOR}
        >
          {y2a.title}
        </text>
      )}

      {/* Legend. */}
      {layout.legend && (
        <g>
          {layout.legend.items.map((it) => {
            const g = groups[it.index];
            return (
              <g key={g.groupId} {...hit('legend', g.groupId)}>
                <LegendSwatch g={g} x={it.x} y={it.y} chartId={chart.id} editor={ed} />
                <text x={n2(it.x + LEGEND_KEY.width + LEGEND_KEY.gap)} y={n2(it.y)} dy="0.35em" fontSize={layout.legend!.fontSizePt} fill={AXIS_COLOR}>
                  {it.label}
                </text>
              </g>
            );
          })}
        </g>
      )}

      {/* Point labels: outside the plot clip, leaders first. All coordinates come from the model. */}
      {model.labels.items.length > 0 && (
        <g>
          {model.labels.items.map((it) => {
            const color = it.color ?? AXIS_COLOR;
            return it.leader ? (
              <path key={`leader-${it.id}`} d={`M${n2(it.leader.x1)},${n2(it.leader.y1)}L${n2(it.leader.x2)},${n2(it.leader.y2)}`} fill="none" stroke={color} strokeWidth={0.5} />
            ) : null;
          })}
          {model.labels.items.map((it) => {
            const owner = labelOwner.get(it.id);
            const color = it.color ?? AXIS_COLOR;
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

      {/* Annotations. */}
      {chart.annotations.map((a) => {
        const drag = editor?.dragging?.id === a.id ? editor.dragging : null;
        const x = (drag ? drag.xFrac : a.xFrac) * W;
        const y0 = (drag ? drag.yFrac : a.yFrac) * H;
        const box = annotationBox(a, x, y0);
        return (
          <g key={a.id} {...hit('annotation', undefined, undefined, a.id)}>
            {ed && <rect x={n2(box.x - 3)} y={n2(box.y - 3)} width={n2(box.w + 6)} height={n2(box.h + 6)} fill="transparent" />}
            <text x={n2(x)} fontSize={a.fontSizePt} fill={a.color}>
              {box.lines.map((line, i) => (
                <tspan key={i} x={n2(x)} y={n2(y0 + a.fontSizePt * 0.9 + i * a.fontSizePt * 1.2)}>
                  {line === '' ? ' ' : line}
                </tspan>
              ))}
            </text>
            {selectedAnnotation === a.id && (
              <rect data-editor-only x={n2(box.x - 3)} y={n2(box.y - 3)} width={n2(box.w + 6)} height={n2(box.h + 6)} fill="none" stroke={SELECT_COLOR} strokeWidth={1} strokeDasharray="3 2" pointerEvents="none" />
            )}
          </g>
        );
      })}

      {/* Editor-only selection overlay: never rendered in export. */}
      {ed && selectedPoint &&
        groups.flatMap((g) => g.points.filter((p) => p.id === selectedPoint)).map((p) => (
          <circle key={`ring-${p.id}`} data-editor-only cx={n2(p.cx)} cy={n2(p.cy)} r={n2(p.size / 2 + 3)} fill="none" stroke={SELECT_COLOR} strokeWidth={1.2} pointerEvents="none" />
        ))}
      {ed && selectedPoint &&
        model.labels.items.filter((it) => it.id === selectedPoint).map((it) => (
          <rect key={`label-sel-${it.id}`} data-editor-only x={n2(it.box.x0 - 2)} y={n2(it.box.y0 - 2)} width={n2(it.box.x1 - it.box.x0 + 4)} height={n2(it.box.y1 - it.box.y0 + 4)} fill="none" stroke={SELECT_COLOR} strokeWidth={1} strokeDasharray="3 2" pointerEvents="none" />
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
              strokeWidth={1}
              strokeDasharray="4 3"
              pointerEvents="none"
            />
          ))}
    </svg>
  );
});
