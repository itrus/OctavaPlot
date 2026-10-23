import type { XySeries } from './xyModel';
import { fitLines } from './fitCurve';

/** The fitted parameters of each series, one block of lines per curve in the colour of the curve. */
export function FitParameters({ series, x, y, fontSizePt, level }: { series: XySeries[]; x: number; y: number; fontSizePt: number; level: number }) {
  const size = fontSizePt * 0.7;
  const line = size * 1.3;
  let row = 0;
  const blocks = series.flatMap((s) => (s.fit?.summary ? [{ s, lines: [s.label, ...fitLines(s.fit.summary, level)] }] : []));
  return (
    <g fontSize={size} pointerEvents="none">
      {blocks.flatMap(({ s, lines }) =>
        lines.map((text, i) => {
          const at = y + (row++ + 1) * line;
          return (
            <text key={`${s.groupId}-${i}`} x={x} y={at} fill={s.style.lineColor} fontWeight={i === 0 ? 'bold' : undefined}>
              {text}
            </text>
          );
        }),
      )}
    </g>
  );
}
