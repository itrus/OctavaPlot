import type { ChartType, TableKind } from '../../model/types';
import { DEFAULT_PALETTE_ID, paletteById } from '../../model/graph/palettes';
import type { ReactElement, ReactNode } from 'react';
import { GALLERY, galleryItems, type GalleryItem } from '../../model/graph/chartGallery';
import { HEAT_GRADIENTS } from '../../model/options/heatGradients';

/** The colours of the thumbnails of the graph gallery: the colours of the palette a new graph starts with (Science), in order, one for each data set. */
const SKETCH_COLOURS: readonly string[] = paletteById(DEFAULT_PALETTE_ID)!.colors.slice(0, 6);

/** The colour of the data set at `index` of a thumbnail. */
const sketchColour = (index: number): string => SKETCH_COLOURS[index % SKETCH_COLOURS.length];

/** The axes of a thumbnail stay neutral. */
const SKETCH_AXIS = '#39424b';

// Each data set of a thumbnail has its own colour of the palette, in order; the first is the thumbnail's `currentColor`.
const SKETCH = { width: 84, height: 54, viewBox: '0 0 84 54', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, 'aria-hidden': true, style: { color: sketchColour(0) } } as const;

/** A thumbnail of what each chart type looks like. */
function ChartSketch({ type }: { type: ChartType }) {
  const axes = <path d="M10 6V46H78" stroke={SKETCH_AXIS} />;
  switch (type) {
    case 'bar':
      return (
        <svg {...SKETCH}>
          {axes}
          {[[16, 28], [32, 18], [48, 24], [64, 12]].map(([x, y], i) => (
            <rect key={x} x={x} y={y + 6} width="10" height={40 - y - 6} fill={sketchColour(i)} fillOpacity={0.85} />
          ))}
        </svg>
      );
    case 'scatter':
      return (
        <svg {...SKETCH}>
          {axes}
          {[[21, [34, 30, 36, 28]], [37, [24, 20, 26, 22]], [53, [18, 14, 20, 16]], [69, [12, 10, 15, 8]]].map(([x, ys], g) =>
            (ys as number[]).map((y, i) => <circle key={`${x}-${i}`} cx={(x as number) + (i % 2 ? 3 : -3)} cy={y + 8} r="1.9" fill={sketchColour(g)} stroke="none" />),
          )}
        </svg>
      );
    case 'mean':
      return (
        <svg {...SKETCH}>
          {axes}
          {[[21, 30], [37, 22], [53, 26], [69, 16]].map(([x, y], i) => (
            <g key={x} style={{ color: sketchColour(i) }}>
              <path d={`M${x} ${y - 7}V${y + 9}M${x - 3} ${y - 7}h6M${x - 3} ${y + 9}h6`} />
              <circle cx={x} cy={y + 1} r="2.6" fill="currentColor" stroke="none" />
            </g>
          ))}
        </svg>
      );
    case 'box':
      return (
        <svg {...SKETCH}>
          {axes}
          {[[21, 24, 36], [37, 16, 30], [53, 20, 34], [69, 10, 24]].map(([x, top, bottom], i) => (
            <g key={x} style={{ color: sketchColour(i) }}>
              <path d={`M${x} ${top - 6}V${top}M${x} ${bottom}V${bottom + 6}M${x - 3} ${top - 6}h6M${x - 3} ${bottom + 6}h6`} />
              <rect x={x - 6} y={top} width="12" height={bottom - top} fill="currentColor" fillOpacity={0.8} />
              <path d={`M${x - 6} ${(top + bottom) / 2}h12`} strokeWidth={2} />
            </g>
          ))}
        </svg>
      );
    case 'paired':
      return (
        <svg {...SKETCH}>
          {axes}
          {[[34, 22], [26, 30], [38, 18], [20, 36]].map(([a, b], i) => (
            <g key={i} style={{ color: sketchColour(i) }}>
              <path d={`M26 ${a}L62 ${b}`} />
              <circle cx="26" cy={a} r="2.2" fill="currentColor" stroke="none" />
              <circle cx="62" cy={b} r="2.2" fill="currentColor" stroke="none" />
            </g>
          ))}
        </svg>
      );
    case 'histogram':
      return (
        <svg {...SKETCH}>
          {axes}
          {[[14, 14], [26, 26], [38, 36], [50, 30], [62, 16]].map(([x, h]) => (
            <rect key={x} x={x} y={46 - h} width="12" height={h} fill="currentColor" fillOpacity={0.85} />
          ))}
        </svg>
      );
    case 'ecdf':
      return (
        <svg {...SKETCH}>
          {axes}
          <path d="M10 44H20V38H30V30H40V24H50V14H62V9H78" strokeWidth={2} />
        </svg>
      );
    case 'floating':
      return (
        <svg {...SKETCH}>
          {axes}
          {[[21, 26, 38], [37, 14, 30], [53, 20, 36], [69, 8, 26]].map(([x, top, bottom], i) => (
            <g key={x} style={{ color: sketchColour(i) }}>
              <rect x={x - 7} y={top} width="14" height={bottom - top} fill="currentColor" fillOpacity={0.8} />
              <path d={`M${x - 7} ${(top + bottom) / 2}h14`} strokeWidth={2} />
            </g>
          ))}
        </svg>
      );
    case 'violin':
      return (
        <svg {...SKETCH}>
          {axes}
          {[[21, 30, 8], [37, 22, 10], [53, 26, 7], [69, 16, 9]].map(([x, mid, half], i) => (
            <g key={x} style={{ color: sketchColour(i) }}>
              <path d={`M${x} ${mid - 14}C${x + half} ${mid - 8} ${x + half} ${mid + 4} ${x} ${mid + 12}C${x - half} ${mid + 4} ${x - half} ${mid - 8} ${x} ${mid - 14}Z`} fill="currentColor" fillOpacity={0.8} />
              <path d={`M${x - 4} ${mid}h8`} strokeWidth={2} />
            </g>
          ))}
        </svg>
      );
    case 'groupedBar':
      return (
        <svg {...SKETCH}>
          {axes}
          {[[14, 26, 18], [46, 34, 12]].map(([x, a, b]) => (
            <g key={x}>
              <rect x={x} y={46 - a} width="10" height={a} fill="currentColor" fillOpacity={0.85} />
              <rect x={x + 10} y={46 - b} width="10" height={b} fill={sketchColour(1)} fillOpacity={0.85} />
              <path d={`M${x + 5} ${46 - a - 4}v8M${x + 15} ${46 - b - 4}v8`} />
            </g>
          ))}
        </svg>
      );
    case 'groupedFloating':
      return (
        <svg {...SKETCH}>
          {axes}
          {[[14, 14, 34], [46, 8, 28]].map(([x, top, bottom]) => (
            <g key={x}>
              <rect x={x} y={top} width="10" height={bottom - top} fill="currentColor" fillOpacity={0.85} />
              <rect x={x + 10} y={top + 8} width="10" height={bottom - top - 4} fill={sketchColour(1)} fillOpacity={0.85} />
              <path d={`M${x} ${top + 12}h10M${x + 10} ${top + 20}h10`} strokeWidth={1.6} />
            </g>
          ))}
        </svg>
      );
    case 'groupedLine':
      return (
        <svg {...SKETCH}>
          {axes}
          <path d="M22 24L56 14" strokeWidth={2} />
          <path d="M22 34L56 30" strokeWidth={2} style={{ color: sketchColour(1) }} />
          {[[22, 24, 0], [56, 14, 0], [22, 34, 1], [56, 30, 1]].map(([x, y, k]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="2.4" fill={sketchColour(k)} stroke="none" />)}
        </svg>
      );
    case 'contingencyBars':
      return (
        <svg {...SKETCH}>
          {axes}
          {[[14, 30, 12], [46, 18, 28]].map(([x, a, b]) => (
            <g key={x}>
              <rect x={x} y={46 - a} width="10" height={a} fill="currentColor" fillOpacity={0.85} />
              <rect x={x + 10} y={46 - b} width="10" height={b} fill={sketchColour(1)} fillOpacity={0.85} />
            </g>
          ))}
        </svg>
      );
    case 'groupedStacked':
    case 'contingencyStacked':
    case 'contingencyPercent': {
      const full = type === 'contingencyPercent';
      return (
        <svg {...SKETCH}>
          {axes}
          {[[16, 28], [48, 16]].map(([x, a]) => {
            const total = full ? 38 : a + 14;
            const top = full ? 38 * (a / (a + 14)) : a;
            return (
              <g key={x}>
                <rect x={x} y={46 - top} width="18" height={top} fill="currentColor" fillOpacity={0.85} />
                <rect x={x} y={46 - total} width="18" height={total - top} fill={sketchColour(1)} fillOpacity={0.85} />
              </g>
            );
          })}
        </svg>
      );
    }
    case 'survival':
    case 'cumulativeEvent': {
      const down = type === 'survival';
      const steps = down ? 'M12 10H26V18H38V26H52V32H64V40H76' : 'M12 40H26V32H38V26H52V18H64V10H76';
      return (
        <svg {...SKETCH}>
          {axes}
          <path d={steps} strokeWidth={2} />
          {[[32, down ? 18 : 32], [58, down ? 26 : 26]].map(([x, y]) => <path key={x} d={`M${x} ${y - 3}v6`} />)}
        </svg>
      );
    }
    default: {
      const pts: Array<[number, number]> = [[14, 40], [26, 34], [38, 30], [50, 22], [62, 18], [74, 9]];
      return (
        <svg {...SKETCH}>
          {axes}
          {type !== 'xyScatter' && <path d={pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join('')} strokeWidth={2} />}
          {type === 'xyLine' && pts.map(([x, y]) => <circle key={x} cx={x} cy={y} r="3.2" fill="currentColor" stroke="none" />)}
          {type !== 'xyLine' && pts.flatMap(([x, y], i) => (type === 'xyLineSymbols' ? [y - 3, y + 3] : [y]).map((yy) => <circle key={`${x}-${i}-${yy}`} cx={x} cy={yy} r="2" fill="currentColor" stroke="none" />))}
        </svg>
      );
    }
  }
}

// Each data set of a thumbnail has its own colour of the palette, in order (`k` is its place); the first is the thumbnail's `currentColor`.
const SVG = { width: 84, height: 54, viewBox: '0 0 84 54', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, 'aria-hidden': true, style: { color: sketchColour(0) } } as const;
const Axes = () => <path d="M10 6V46H78" stroke={SKETCH_AXIS} />;
const Dot = ({ x, y, open = false, k = 0 }: { x: number; y: number; open?: boolean; k?: number }) => <circle cx={x} cy={y} r="2.1" fill={sketchColour(open ? 1 : k)} stroke="none" />;
const Bar = ({ x, y, w = 8, base = 46, tone = 0.3, k = 0 }: { x: number; y: number; w?: number; base?: number; tone?: number; k?: number }) => <rect x={x} y={y} width={w} height={base - y} fill={sketchColour(tone < 0.2 ? 1 : k)} fillOpacity={0.85} />;
const BarH = ({ y, x, h = 6, tone = 0.3, k = 0 }: { y: number; x: number; h?: number; tone?: number; k?: number }) => <rect x="10" y={y} width={x - 10} height={h} fill={sketchColour(tone < 0.2 ? 1 : k)} fillOpacity={0.85} />;
const Forest = () => (
  <>
    <Axes />
    <path d="M40 8V44" strokeDasharray="2 2" />
    <path d="M22 14H42M22 12V16M42 12V16M36 26H66M36 24V28M66 24V28M18 38H38M18 36V40M38 36V40" />
    <rect x="30" y="12" width="4" height="4" fill="currentColor" />
    <rect x="49" y="24" width="4" height="4" fill="currentColor" />
    <rect x="26" y="36" width="4" height="4" fill="currentColor" />
  </>
);
const Lines = ({ d, w = 1.6 }: { d: string; w?: number }) => <path d={d} strokeWidth={w} />;
const Violin = ({ cx, w = 8, top = 12, bottom = 40, k = 0 }: { cx: number; w?: number; top?: number; bottom?: number; k?: number }) => (
  <path d={`M${cx} ${top}C${cx + w} ${top + 8} ${cx + w} ${bottom - 8} ${cx} ${bottom}C${cx - w} ${bottom - 8} ${cx - w} ${top + 8} ${cx} ${top}Z`} fill="currentColor" fillOpacity={0.5} style={{ color: sketchColour(k) }} />
);
const BoxV = ({ x, top, q1, q3, bottom, w = 11, k = 0 }: { x: number; top: number; q1: number; q3: number; bottom: number; w?: number; k?: number }) => (
  <g style={{ color: sketchColour(k) }}>
    <rect x={x - w / 2} y={q1} width={w} height={q3 - q1} fill="currentColor" fillOpacity={0.55} />
    <path d={`M${x} ${top}V${q1}M${x} ${q3}V${bottom}M${x - 3} ${top}h6M${x - 3} ${bottom}h6M${x - w / 2} ${(q1 + q3) / 2}h${w}`} />
  </g>
);
const Heat = ({ colors }: { colors: string[][] }) => (
  <g stroke="none">
    {colors.flatMap((row, r) => row.map((c, k) => <rect key={`${r}-${k}`} x={18 + k * 15} y={8 + r * 9} width="14" height="8" fill={c} />))}
  </g>
);
const Pie = ({ hole = false }: { hole?: boolean }) => (
  <g stroke="#fff" strokeWidth={1}>
    <path d="M42 27V44A17 17 0 1 1 42 10Z" fill={sketchColour(0)} />
    <path d="M42 27L42 10A17 17 0 0 1 56.7 35.5Z" fill={sketchColour(1)} />
    <path d="M42 27L56.7 35.5A17 17 0 0 1 42 44Z" fill={sketchColour(2)} />
    {hole && <circle cx="42" cy="27" r="7" fill="#fff" stroke="none" />}
  </g>
);

/** A 3 by 4 patch of a gradient's own stops, rising from the top left to the bottom right. */
const heatPatch = (id: string): string[][] => {
  const stops = HEAT_GRADIENTS.find((p) => p.value === id)!.colors;
  return [0, 1, 2].map((r) => [0, 1, 2, 3].map((k) => stops[Math.round(((r + k) / 5) * (stops.length - 1))]));
};

const SKETCHES: Record<string, () => ReactElement> = {
  'xy.bars': () => (<><Axes /><Bar x={16} y={36} k={0} /><Bar x={32} y={26} k={1} /><Bar x={48} y={14} k={2} /><Bar x={64} y={22} k={3} /></>),
  'xy.area': () => (<><Axes /><path d="M10 46L10 40L34 30L52 24L78 10V46Z" fill="currentColor" fillOpacity={0.55} stroke="none" /><Lines d="M10 40L34 30L52 24L78 10" /></>),
  'xy.spikes': () => (<><Axes /><path d="M18 46V34M30 46V22M42 46V28M54 46V14M66 46V24" strokeWidth={1.6} /><Dot x={18} y={34} /><Dot x={30} y={22} /><Dot x={42} y={28} /><Dot x={54} y={14} /><Dot x={66} y={24} /></>),
  'xy.bubble': () => (<><Axes /><circle cx="24" cy="36" r="3" fill={sketchColour(0)} fillOpacity={0.6} stroke="none" /><circle cx="42" cy="26" r="6" fill={sketchColour(1)} fillOpacity={0.6} stroke="none" /><circle cx="62" cy="18" r="9" fill={sketchColour(2)} fillOpacity={0.6} stroke="none" /></>),
  'xy.volcano': () => (<><Axes /><path d="M26 6V46M58 6V46M10 30H78" stroke="#9e9e9e" strokeDasharray="2 2" strokeWidth={0.8} /><circle cx="38" cy="38" r="1.8" fill="#9e9e9e" stroke="none" /><circle cx="46" cy="40" r="1.8" fill="#9e9e9e" stroke="none" /><circle cx="42" cy="34" r="1.8" fill="#9e9e9e" stroke="none" /><circle cx="18" cy="20" r="2.4" fill="#1f77b4" stroke="none" /><circle cx="22" cy="12" r="2.4" fill="#1f77b4" stroke="none" /><circle cx="66" cy="18" r="2.4" fill="#d62728" stroke="none" /><circle cx="72" cy="10" r="2.4" fill="#d62728" stroke="none" /></>),
  'xy.offset': () => (<><Axes /><g style={{ color: sketchColour(0) }}><Lines d="M12 40L22 36L30 41L40 37L52 40L66 36" w={1.2} /></g><g style={{ color: sketchColour(1) }}><Lines d="M12 30L22 26L30 31L40 27L52 30L66 26" w={1.2} /></g><g style={{ color: sketchColour(2) }}><Lines d="M12 20L22 16L30 21L40 17L52 20L66 16" w={1.2} /></g><path d="M72 40v6M70 46h4" stroke={SKETCH_AXIS} /></>),
  'curve.fit': () => (<><Axes /><Dot x={18} y={40} /><Dot x={30} y={32} /><Dot x={40} y={34} /><Dot x={52} y={22} /><Dot x={66} y={16} /><g style={{ color: sketchColour(1) }}><path d="M14 42C32 36 48 24 70 14" strokeWidth={1.8} /><path d="M14 38C32 32 50 18 70 8M14 46C32 40 46 30 70 20" strokeOpacity={0.5} strokeDasharray="2 2" /></g></>),
  'cat.aligned': () => (<><Axes /><Dot x={26} y={34} /><Dot x={26} y={30} /><Dot x={26} y={36} /><Dot x={26} y={26} /><Dot x={58} y={20} k={1} /><Dot x={58} y={14} k={1} /><Dot x={58} y={24} k={1} /><Dot x={58} y={17} k={1} /></>),
  box: () => (<><Axes /><BoxV x={28} top={14} q1={24} q3={34} bottom={42} /><BoxV x={58} top={10} q1={18} q3={28} bottom={36} k={1} /></>),
  floating: () => (<><Axes /><g style={{ color: sketchColour(0) }}><rect x="22" y="22" width="12" height="18" fill="currentColor" fillOpacity={0.5} /><path d="M22 30h12" strokeWidth={2} /></g><g style={{ color: sketchColour(1) }}><rect x="52" y="12" width="12" height="20" fill="currentColor" fillOpacity={0.5} /><path d="M52 22h12" strokeWidth={2} /></g></>),
  violin: () => (<><Axes /><Violin cx={28} /><Violin cx={58} top={8} bottom={34} k={1} /></>),
  boxH: () => (<><Axes /><g style={{ color: sketchColour(0) }}><rect x="24" y="12" width="24" height="9" fill="currentColor" fillOpacity={0.5} /><path d="M14 16.5h10M48 16.5h14M36 12v9" /></g><g style={{ color: sketchColour(1) }}><rect x="34" y="30" width="26" height="9" fill="currentColor" fillOpacity={0.5} /><path d="M20 34.5h14M60 34.5h12M46 30v9" /></g></>),
  violinH: () => (<><Axes /><path d="M18 17C26 8 40 8 50 17C40 26 26 26 18 17Z" fill="currentColor" fillOpacity={0.5} style={{ color: sketchColour(0) }} /><path d="M24 38C34 30 52 30 66 38C52 46 34 46 24 38Z" fill="currentColor" fillOpacity={0.5} style={{ color: sketchColour(1) }} /></>),
  barsH: () => (<><Axes /><BarH y={10} x={40} k={0} /><BarH y={21} x={62} k={1} /><BarH y={32} x={50} k={2} /></>),
  'grp.scatterI': () => (<><Axes /><Dot x={18} y={32} /><Dot x={18} y={37} /><Dot x={24} y={22} open /><Dot x={24} y={26} open /><Dot x={50} y={26} /><Dot x={50} y={20} /><Dot x={56} y={14} open /><Dot x={56} y={18} open /></>),
  'grp.scatterS': () => (<><Axes /><Dot x={16} y={32} /><Dot x={20} y={37} /><Dot x={32} y={22} open /><Dot x={36} y={26} open /><Dot x={50} y={26} /><Dot x={54} y={20} /><Dot x={66} y={14} open /><Dot x={70} y={18} open /></>),
  'grp.barsH': () => (<><Axes /><BarH y={8} x={52} h={5} tone={0.55} /><BarH y={14} x={38} h={5} tone={0.18} /><BarH y={26} x={64} h={5} tone={0.55} /><BarH y={32} x={46} h={5} tone={0.18} /></>),
  'grp.stackedH': () => (<><Axes /><BarH y={10} x={36} h={8} tone={0.55} /><rect x="36" y="10" width="22" height="8" fill={sketchColour(1)} fillOpacity={0.85} /><BarH y={28} x={46} h={8} tone={0.55} /><rect x="46" y="28" width="24" height="8" fill={sketchColour(1)} fillOpacity={0.85} /></>),
  'grp.forest': () => <Forest />,
  'grp.forestRatio': () => <Forest />,
  'grp.floating': () => (<><Axes /><rect x="18" y="26" width="9" height="14" fill="currentColor" fillOpacity={0.85} /><rect x="29" y="18" width="9" height="16" fill={sketchColour(1)} fillOpacity={0.85} /><rect x="50" y="14" width="9" height="18" fill="currentColor" fillOpacity={0.85} /><rect x="61" y="22" width="9" height="14" fill={sketchColour(1)} fillOpacity={0.85} /></>),
  'heat.blue': () => <Heat colors={heatPatch('bs-blue')} />,
  'heat.purple': () => <Heat colors={heatPatch('bs-purple')} />,
  'heat.red': () => <Heat colors={heatPatch('md-red')} />,
  'heat.gsea': () => <Heat colors={heatPatch('gsea')} />,
  'three.bars': () => (<><Axes /><Bar x={14} y={30} w={6} tone={0.55} /><Bar x={21} y={22} w={6} tone={0.18} /><Bar x={30} y={34} w={6} tone={0.55} /><Bar x={37} y={26} w={6} tone={0.18} /><Bar x={52} y={20} w={6} tone={0.55} /><Bar x={59} y={14} w={6} tone={0.18} /></>),
  'three.dots': () => (<><Axes /><Dot x={16} y={32} /><Dot x={21} y={28} open /><Dot x={32} y={36} /><Dot x={37} y={30} open /><Dot x={54} y={22} /><Dot x={59} y={16} open /></>),
  'grp.box': () => (<><Axes /><BoxV x={22} top={16} q1={24} q3={34} bottom={42} w={8} /><BoxV x={36} top={10} q1={18} q3={28} bottom={38} w={8} k={1} /><BoxV x={56} top={12} q1={20} q3={30} bottom={40} w={8} /><BoxV x={70} top={8} q1={16} q3={24} bottom={34} w={8} k={1} /></>),
  'grp.violin': () => (<><Axes /><Violin cx={24} w={6} top={16} bottom={40} /><Violin cx={38} w={6} top={10} bottom={36} k={1} /><Violin cx={56} w={6} top={14} bottom={40} /><Violin cx={70} w={6} top={8} bottom={32} k={1} /></>),
  'cont.sideH': () => (<><Axes /><BarH y={8} x={60} h={5} tone={0.55} /><BarH y={14} x={36} h={5} tone={0.18} /><BarH y={28} x={40} h={5} tone={0.55} /><BarH y={34} x={64} h={5} tone={0.18} /></>),
  'cont.stackH': () => (<><Axes /><BarH y={10} x={40} h={9} tone={0.55} /><rect x="40" y="10" width="20" height="9" fill={sketchColour(1)} fillOpacity={0.85} /><BarH y={28} x={30} h={9} tone={0.55} /><rect x="30" y="28" width="38" height="9" fill={sketchColour(1)} fillOpacity={0.85} /></>),
  'cont.pctH': () => (<><Axes /><BarH y={10} x={44} h={9} tone={0.55} /><rect x="44" y="10" width="34" height="9" fill={sketchColour(1)} fillOpacity={0.85} /><BarH y={28} x={30} h={9} tone={0.55} /><rect x="30" y="28" width="48" height="9" fill={sketchColour(1)} fillOpacity={0.85} /></>),
  pie: () => <Pie />,
  doughnut: () => <Pie hole />,
  slices: () => (<g stroke="none"><rect x="10" y="20" width="34" height="14" fill={sketchColour(0)} /><rect x="44" y="20" width="24" height="14" fill={sketchColour(1)} /><rect x="68" y="20" width="10" height="14" fill={sketchColour(2)} /></g>),
  dotGrid: () => (<g stroke="none">{Array.from({ length: 100 }, (_, i) => <circle key={i} cx={22 + (i % 10) * 4.4} cy={7 + Math.floor(i / 10) * 4.4} r="1.6" fill={sketchColour(i < 45 ? 0 : i < 80 ? 1 : 2)} />)}</g>),
  'surv.symbols': () => (<><Axes /><Lines d="M10 12H26V20H38V28H52V36H66V42" w={1.8} /><Dot x={26} y={20} /><Dot x={38} y={28} /><Dot x={52} y={36} /><Dot x={66} y={42} /></>),
  'surv.se': () => (<><Axes /><Lines d="M10 12H26V20H38V28H52V36H66V42" w={1.8} /><path d="M26 15v10M38 23v10M52 31v10M66 37v10" /></>),
  'cum.se': () => (<><Axes /><Lines d="M10 42H26V34H38V26H52V18H66V12" w={1.8} /><path d="M26 29v10M38 21v10M52 13v10M66 7v10" /></>),
};

/** The thumbnail of a gallery graph: the drawing of an available chart type, or a sketch of a planned preset. */
export function GallerySketch({ item }: { item: GalleryItem }): ReactNode {
  // A horizontal graph has a sketch of its own; the chart type's sketch is the vertical one.
  if (item.type && !SKETCHES[item.id]) return <ChartSketch type={item.type} />;
  const draw = SKETCHES[item.id];
  return <svg {...SVG}>{draw ? draw() : <Axes />}</svg>;
}

/**
 * The drawing of a chart type, the same as the one the New Graph gallery shows for it: the gallery's plain entry of the type, or, for a type
 * the gallery offers only in looks of its own (a heat map in its colours, bubbles), the first of those that is not turned on its side.
 * Types that have no drawing of their own in either (the XY types made of points and a line) get the one of `ChartSketch`.
 */
export function TypeSketch({ type }: { type: ChartType }): ReactNode {
  const items = (Object.keys(GALLERY) as TableKind[]).flatMap((k) => galleryItems(k)).filter((i) => i.type === type);
  const item = items.find((i) => !i.variant) ?? items.find((i) => SKETCHES[i.id] && i.variant?.orientation !== 'horizontal');
  return item ? <GallerySketch item={item} /> : <ChartSketch type={type} />;
}
