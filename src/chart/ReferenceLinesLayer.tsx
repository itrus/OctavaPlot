import { dashOf } from '../model/look';
import { n2 } from '../model/units';
import type { PlacedReferenceLine } from './referenceLines';

/** The reference lines of a chart, behind the data and clipped to the plotting region; their labels sit at the line's end. */
export function ReferenceLinesLayer({ lines, fontSizePt }: { lines: readonly PlacedReferenceLine[]; fontSizePt: number }) {
  if (lines.length === 0) return null;
  return (
    <g data-reference-lines="">
      <g clipPath="url(#plot-clip)" fill="none">
        {lines.map((l) => (
          <path key={l.id} d={l.d} stroke={l.line.color} strokeWidth={l.line.widthPt} strokeDasharray={dashOf(l.line.style, l.line.widthPt)} />
        ))}
      </g>
      {lines.map((l) =>
        l.label ? (
          <text key={`t${l.id}`} x={n2(l.labelX)} y={n2(l.labelY)} textAnchor={l.anchor} fontSize={fontSizePt} fill={l.line.color} pointerEvents="none">
            {l.label}
          </text>
        ) : null,
      )}
    </g>
  );
}
