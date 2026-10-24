import { forwardRef } from 'react';
import type { Chart } from '../model/types';
import { n2 } from '../model/units';
import { BarLabelText } from './BarLabelText';
import { compileGroupedScene } from './categoryChrome';
import { AnnotationLayer, Turned, type EditorState, SELECT_COLOR } from './ChartParts';
import type { GroupedModel } from './groupedModel';
import { hitAttrs } from './hitTest';
import { linePattern } from '../model/look';
import { SceneElements } from './SceneElements';
import { symbolPath } from './symbols';

interface Props {
  chart: Chart;
  model: GroupedModel;
  /** Present only in the editor; export renders without it (no selection or hit attributes). */
  editor?: EditorState;
  cssWidth: string;
  cssHeight: string;
}


/** Bars (side by side, stacked or as shares) or lines over the categories of a grouped or contingency table. */
export const GroupedChartSvg = forwardRef<SVGSVGElement, Props>(function GroupedChartSvg({ chart, model, editor, cssWidth, cssHeight }, ref) {
  const { widthPt: W, heightPt: H, series, orient } = model;
  const ed = !!editor;
  const hit = (kind: Parameters<typeof hitAttrs>[0], g?: string, o?: string, a?: string) => (ed ? hitAttrs(kind, g, o, a) : {});
  // Horizontal: the model is the vertical drawing, turned into place by one matrix; symbols and text stay upright.
  // The chrome (clip, backgrounds, grids, axes, titles, legend) is drawn from the scene.
  const scene = model.scene ?? compileGroupedScene(chart, model);
  const at = (p: { px: number; py: number }) => orient.toScreen(p.px, p.py);
  const selectedGroup = editor?.selection.kind === 'group' ? editor.selection.groupId : null;

  // Lines and error bars go over the bars and symbols, under them, or (auto) over the bars and under the symbols.
  const lineOrder = chart.lineOrder;
  const onTop = lineOrder === 'onTop';
  const bars = (
    <Turned matrix={orient.matrix}>
        {series.map((s) =>
          s.bars.map((b) => (
            <rect
              key={b.id}
              x={n2(b.x)}
              y={n2(b.y)}
              width={n2(b.width)}
              height={n2(b.height)}
              fill={s.style.barFillMode === 'none' ? 'none' : s.style.barFill}
              fillOpacity={s.style.barOpacity < 1 ? s.style.barOpacity : undefined}
              stroke={s.style.barBorderWidthPt > 0 ? s.style.barBorderColor : 'none'}
              strokeWidth={s.style.barBorderWidthPt}
              strokeOpacity={s.style.barBorderOpacity < 1 ? s.style.barBorderOpacity : undefined}
              {...hit('bar', s.groupId, b.id)}
            />
          )),
        )}
        {series.map((s) =>
          s.style.showMeanLine
            ? s.bars.map((b) => b.centerLine && <path key={`mid-${b.id}`} d={`M${n2(b.centerLine.x1)},${n2(b.centerLine.y)}H${n2(b.centerLine.x2)}`} fill="none" stroke={s.style.lineColor} strokeWidth={s.style.lineWidthPt} strokeOpacity={s.style.lineOpacity < 1 ? s.style.lineOpacity : undefined} strokeLinecap="butt" {...hit('meanLine', s.groupId, b.id)} />)
            : null,
        )}
    </Turned>
  );
  const linesAndErrors = (
    <Turned matrix={orient.matrix}>
        {series.map(
          (s) =>
            s.style.showLines &&
            s.linePath !== '' && (
              <g key={`line-${s.groupId}`}>
                <path d={s.linePath} fill="none" stroke={s.style.lineColor} strokeWidth={s.style.lineWidthPt} strokeOpacity={s.style.lineOpacity < 1 ? s.style.lineOpacity : undefined} {...linePattern(s.style)} strokeLinejoin="round" {...hit('line', s.groupId)} />
                {selectedGroup === s.groupId && <path data-editor-only d={s.linePath} fill="none" stroke={SELECT_COLOR} strokeOpacity={0.35} strokeWidth={s.style.lineWidthPt + 10} strokeLinecap="round" pointerEvents="none" />}
              </g>
            ),
        )}
        {series.map(
          (s) =>
            s.errorPath !== '' && (
              <path key={`err-${s.groupId}`} d={s.errorPath} fill="none" stroke={s.style.errorColor} strokeWidth={s.style.errorLineWidthPt} strokeOpacity={s.style.errorOpacity < 1 ? s.style.errorOpacity : undefined} strokeLinecap="butt" {...hit('error', s.groupId)} />
            ),
        )}
    </Turned>
  );
  const symbols = (
    <>
        {series.map(
          (s) =>
            s.style.showSymbols &&
            s.points.map((p) => (
              <path key={p.id} d={symbolPath(s.style.symbolShape, at(p).x, at(p).y, s.style.symbolSizePt)} fill={s.style.symbolColor} fillOpacity={s.style.symbolFillOpacity < 1 ? s.style.symbolFillOpacity : undefined} stroke={s.style.symbolBorderColor} strokeWidth={s.style.symbolBorderWidthPt} strokeOpacity={s.style.symbolBorderOpacity < 1 ? s.style.symbolBorderOpacity : undefined} {...hit('point', s.groupId, p.id)} />
            )),
        )}
        {series.map((s) =>
          s.dots.map((p) => (
            <path key={p.id} d={symbolPath(s.style.symbolShape, at(p).x, at(p).y, s.style.symbolSizePt)} fill={s.style.symbolColor} fillOpacity={s.style.symbolFillOpacity < 1 ? s.style.symbolFillOpacity : undefined} stroke={s.style.symbolBorderColor} strokeWidth={s.style.symbolBorderWidthPt} strokeOpacity={s.style.symbolBorderOpacity < 1 ? s.style.symbolBorderOpacity : undefined} {...hit('point', s.groupId, p.id)} />
          )),
        )}
    </>
  );

  return (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={cssWidth} height={cssHeight} viewBox={`0 0 ${n2(W)} ${n2(H)}`} fontFamily={chart.fontFamily} style={{ background: chart.pageColor ?? 'transparent' }}>
      <SceneElements nodes={scene.defs} editor={ed} />
      <SceneElements nodes={scene.back} editor={ed} />

      {/* Data, clipped to the plotting region: bars, then error bars, then lines and their symbols. */}
      <g clipPath="url(#plot-clip)">
        {onTop ? (
          <>
            {bars}
            {symbols}
            {linesAndErrors}
          </>
        ) : lineOrder === 'underneath' ? (
          <>
            {linesAndErrors}
            {bars}
            {symbols}
          </>
        ) : (
          <>
            {bars}
            {linesAndErrors}
            {symbols}
          </>
        )}
        <Turned matrix={orient.matrix}>
          {ed &&
            selectedGroup &&
            series
              .filter((s) => s.groupId === selectedGroup)
              .flatMap((s) => s.bars.map((b) => <rect key={`sel-${b.id}`} data-editor-only x={n2(b.x - 3)} y={n2(b.y - 3)} width={n2(b.width + 6)} height={n2(b.height + 6)} fill="none" stroke={SELECT_COLOR} strokeWidth={2.4} strokeDasharray="6 4" pointerEvents="none" />))}
        </Turned>
      </g>

      {/* Labels above the bars. */}
      {chart.barLabels.show !== 'none' && series.map((s) => s.bars.map((bar) => bar.label && <BarLabelText key={bar.label.id} label={bar.label} cfg={chart.barLabels} textColor={chart.textColor} orient={orient} />))}

      <SceneElements nodes={scene.front} editor={ed} />

      <AnnotationLayer chart={chart} editor={editor} width={W} height={H} hit={hit} />
    </svg>
  );
});
