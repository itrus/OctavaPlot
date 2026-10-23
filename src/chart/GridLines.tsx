import { dashOf } from '../model/look';
import type { GridStyle } from '../model/types';
import { n2 } from '../model/units';

interface Props {
  /** 'h' = horizontal lines (one per Y tick), 'v' = vertical lines (one per X tick). */
  dir: 'h' | 'v';
  grid: GridStyle;
  major: readonly number[];
  minor: readonly number[];
  showMajor: boolean;
  showMinor: boolean;
  /** Position of a value across the plot (y for horizontal lines, x for vertical ones). */
  at: (v: number) => number;
  /** Where the lines start and end along their length. */
  from: number;
  to: number;
  /** Pattern for the major lines when the style is solid (the right axis is dashed to tell it from the left). */
  fallbackDash?: string;
}

const line = (dir: 'h' | 'v', pos: number, from: number, to: number): string => (dir === 'h' ? `M${n2(from)},${n2(pos)}H${n2(to)}` : `M${n2(pos)},${n2(from)}V${n2(to)}`);

/** The gridlines of one axis, major and minor, drawn behind the data. */
export function GridLines({ dir, grid, major, minor, showMajor, showMinor, at, from, to, fallbackDash }: Props) {
  return (
    <>
      {showMajor && (
        <g stroke={grid.color} strokeWidth={grid.widthPt} fill="none" strokeDasharray={dashOf(grid.style) ?? fallbackDash}>
          {major.map((t) => (
            <path key={t} d={line(dir, at(t), from, to)} />
          ))}
        </g>
      )}
      {showMinor && minor.length > 0 && (
        <g stroke={grid.minorColor} strokeWidth={grid.minorWidthPt} fill="none" strokeDasharray={dashOf(grid.minorStyle)}>
          {minor.map((t) => (
            <path key={`m${t}`} d={line(dir, at(t), from, to)} />
          ))}
        </g>
      )}
    </>
  );
}
