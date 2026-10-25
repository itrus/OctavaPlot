import type { ReactElement, ReactNode } from 'react';
import type { GalleryItem } from '../../model/graph/chartGallery';
import { ChartSketch } from './NewItemDialogs';

const SVG = { width: 84, height: 54, viewBox: '0 0 84 54', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, 'aria-hidden': true } as const;
const Axes = () => <path d="M10 6V46H78" />;
const Dot = ({ x, y, open = false }: { x: number; y: number; open?: boolean }) => <circle cx={x} cy={y} r="2.1" fill={open ? '#fff' : 'currentColor'} />;
const Bar = ({ x, y, w = 8, base = 46, tone = 0.3 }: { x: number; y: number; w?: number; base?: number; tone?: number }) => <rect x={x} y={y} width={w} height={base - y} fill="currentColor" fillOpacity={tone} />;
const BarH = ({ y, x, h = 6, tone = 0.3 }: { y: number; x: number; h?: number; tone?: number }) => <rect x="10" y={y} width={x - 10} height={h} fill="currentColor" fillOpacity={tone} />;
const Lines = ({ d, w = 1.6 }: { d: string; w?: number }) => <path d={d} strokeWidth={w} />;
const Violin = ({ cx, w = 8, top = 12, bottom = 40 }: { cx: number; w?: number; top?: number; bottom?: number }) => (
  <path d={`M${cx} ${top}C${cx + w} ${top + 8} ${cx + w} ${bottom - 8} ${cx} ${bottom}C${cx - w} ${bottom - 8} ${cx - w} ${top + 8} ${cx} ${top}Z`} />
);
const BoxV = ({ x, top, q1, q3, bottom, w = 11 }: { x: number; top: number; q1: number; q3: number; bottom: number; w?: number }) => (
  <g>
    <rect x={x - w / 2} y={q1} width={w} height={q3 - q1} fill="currentColor" fillOpacity={0.12} />
    <path d={`M${x} ${top}V${q1}M${x} ${q3}V${bottom}M${x - 3} ${top}h6M${x - 3} ${bottom}h6M${x - w / 2} ${(q1 + q3) / 2}h${w}`} />
  </g>
);
const Heat = ({ colors }: { colors: string[][] }) => (
  <g stroke="none">
    {colors.flatMap((row, r) => row.map((c, k) => <rect key={`${r}-${k}`} x={18 + k * 15} y={8 + r * 9} width="14" height="8" fill={c} />))}
  </g>
);
const Pie = ({ hole = false }: { hole?: boolean }) => (
  <g>
    <circle cx="42" cy="27" r="17" />
    <path d="M42 27V10M42 27L56 37" />
    {hole && <circle cx="42" cy="27" r="7" fill="#fff" />}
  </g>
);

const VIRIDIS = [['#440154', '#3b528b', '#21918c', '#5ec962'], ['#472d7b', '#2c728e', '#27ad81', '#aadc32'], ['#3b528b', '#21918c', '#5ec962', '#fde725']];
const MAGMA = [['#000004', '#3b0f70', '#8c2981', '#de4968'], ['#1d1147', '#51127c', '#b73779', '#fc8961'], ['#3b0f70', '#8c2981', '#f1605d', '#fcfdbf']];
const BLUE = [['#f0f6ff', '#cfe0fb', '#9dbdf5', '#6c9bef'], ['#dbe8fc', '#b6cff8', '#7fa8f1', '#3f7be8'], ['#c4d9fa', '#8fb3f2', '#5a8eea', '#1f5fe0']];
const GREENRED = [['#1b9e2a', '#0a5a14', '#050505', '#6a0d0d'], ['#37b94a', '#10701c', '#2a0a0a', '#b02020'], ['#52d05f', '#1b9e2a', '#7a1010', '#d94040']];

const SKETCHES: Record<string, () => ReactElement> = {
  'xy.bars': () => (<><Axes /><Bar x={16} y={36} /><Bar x={32} y={26} /><Bar x={48} y={14} /><Bar x={64} y={22} /></>),
  'xy.area': () => (<><Axes /><path d="M10 46L10 40L34 30L52 24L78 10V46Z" fill="currentColor" fillOpacity={0.25} stroke="none" /><Lines d="M10 40L34 30L52 24L78 10" /></>),
  'xy.spikes': () => (<><Axes /><path d="M18 46V34M30 46V22M42 46V28M54 46V14M66 46V24" strokeWidth={1.6} /><Dot x={18} y={34} /><Dot x={30} y={22} /><Dot x={42} y={28} /><Dot x={54} y={14} /><Dot x={66} y={24} /></>),
  'xy.vector': () => (<><Axes /><path d="M14 44L36 20M14 44L58 34M14 44L70 14" /><path d="M31 20h5v5M53 30l5 4-5 3M65 14h5v5" /></>),
  'xy.bubble': () => (<><Axes /><circle cx="24" cy="36" r="3" fill="currentColor" fillOpacity={0.4} /><circle cx="42" cy="26" r="6" fill="currentColor" fillOpacity={0.4} /><circle cx="62" cy="18" r="9" fill="currentColor" fillOpacity={0.4} /></>),
  'xy.trajectory': () => (<><Axes /><Lines d="M16 36L44 24L70 14" w={1.1} /><Lines d="M16 26L44 34L70 22" w={1.1} /><Lines d="M16 42L44 38L70 30" w={1.1} /></>),
  'xy.offset': () => (<><Axes /><Lines d="M12 40L22 36L30 41L40 37L52 40L66 36" w={1.1} /><Lines d="M12 30L22 26L30 31L40 27L52 30L66 26" w={1.1} /><Lines d="M12 20L22 16L30 21L40 17L52 20L66 16" w={1.1} /><path d="M72 40v6M70 46h4" /></>),
  'curve.fit': () => (<><Axes /><Dot x={18} y={40} /><Dot x={30} y={32} /><Dot x={40} y={34} /><Dot x={52} y={22} /><Dot x={66} y={16} /><path d="M14 42C32 36 48 24 70 14" strokeWidth={1.8} /><path d="M14 38C32 32 50 18 70 8M14 46C32 40 46 30 70 20" strokeOpacity={0.45} strokeDasharray="2 2" /></>),
  'curve.smooth': () => (<><Axes /><Dot x={18} y={40} /><Dot x={30} y={28} /><Dot x={42} y={34} /><Dot x={54} y={20} /><Dot x={68} y={26} /><path d="M12 42C22 36 26 26 34 28S46 36 54 22S64 18 74 24" strokeWidth={1.8} /></>),
  'cat.aligned': () => (<><Axes /><Dot x={26} y={34} /><Dot x={26} y={30} /><Dot x={26} y={36} /><Dot x={26} y={26} /><Dot x={58} y={20} /><Dot x={58} y={14} /><Dot x={58} y={24} /><Dot x={58} y={17} /></>),
  'cat.paired': () => (<><Axes /><path d="M24 36L58 24M24 28L58 30M24 42L58 16" strokeWidth={1.1} /><Dot x={24} y={36} /><Dot x={58} y={24} /><Dot x={24} y={28} /><Dot x={58} y={30} /><Dot x={24} y={42} /><Dot x={58} y={16} /></>),
  'cat.nested': () => (<><Axes /><Dot x={20} y={34} /><Dot x={26} y={30} /><Dot x={23} y={37} /><Dot x={52} y={20} /><Dot x={58} y={16} /><Dot x={63} y={22} /><path d="M17 41h14M49 27h18" /></>),
  box: () => (<><Axes /><BoxV x={28} top={14} q1={24} q3={34} bottom={42} /><BoxV x={58} top={10} q1={18} q3={28} bottom={36} /></>),
  floating: () => (<><Axes /><rect x="22" y="22" width="12" height="18" fill="currentColor" fillOpacity={0.15} /><rect x="52" y="12" width="12" height="20" fill="currentColor" fillOpacity={0.15} /><path d="M22 30h12M52 22h12" strokeWidth={2} /></>),
  violin: () => (<><Axes /><Violin cx={28} /><Violin cx={58} top={8} bottom={34} /></>),
  boxH: () => (<><Axes /><rect x="24" y="12" width="24" height="9" fill="currentColor" fillOpacity={0.12} /><path d="M14 16.5h10M48 16.5h14M36 12v9" /><rect x="34" y="30" width="26" height="9" fill="currentColor" fillOpacity={0.12} /><path d="M20 34.5h14M60 34.5h12M46 30v9" /></>),
  violinH: () => (<><Axes /><path d="M18 17C26 8 40 8 50 17C40 26 26 26 18 17Z" /><path d="M24 38C34 30 52 30 66 38C52 46 34 46 24 38Z" /></>),
  barsH: () => (<><Axes /><BarH y={10} x={40} /><BarH y={21} x={62} /><BarH y={32} x={50} /></>),
  range: () => (<><Axes /><rect x="20" y="22" width="12" height="16" fill="currentColor" fillOpacity={0.3} /><rect x="48" y="12" width="12" height="22" fill="currentColor" fillOpacity={0.3} /></>),
  'grp.scatterI': () => (<><Axes /><Dot x={18} y={32} /><Dot x={18} y={37} /><Dot x={24} y={22} open /><Dot x={24} y={26} open /><Dot x={50} y={26} /><Dot x={50} y={20} /><Dot x={56} y={14} open /><Dot x={56} y={18} open /></>),
  'grp.scatterS': () => (<><Axes /><Dot x={16} y={32} /><Dot x={20} y={37} /><Dot x={32} y={22} open /><Dot x={36} y={26} open /><Dot x={50} y={26} /><Dot x={54} y={20} /><Dot x={66} y={14} open /><Dot x={70} y={18} open /></>),
  'grp.paired': () => (<><Axes /><path d="M18 36L30 28M44 30L58 20" /><Dot x={18} y={36} /><Dot x={30} y={28} open /><Dot x={44} y={30} /><Dot x={58} y={20} open /></>),
  'grp.stacked': () => (<><Axes /><Bar x={18} y={26} w={14} tone={0.55} /><Bar x={18} y={16} w={14} base={26} tone={0.18} /><Bar x={48} y={32} w={14} tone={0.55} /><Bar x={48} y={14} w={14} base={32} tone={0.18} /></>),
  'grp.barsH': () => (<><Axes /><BarH y={8} x={52} h={5} tone={0.55} /><BarH y={14} x={38} h={5} tone={0.18} /><BarH y={26} x={64} h={5} tone={0.55} /><BarH y={32} x={46} h={5} tone={0.18} /></>),
  'grp.stackedH': () => (<><Axes /><BarH y={10} x={36} h={8} tone={0.55} /><rect x="36" y="10" width="22" height="8" fill="currentColor" fillOpacity={0.18} /><BarH y={28} x={46} h={8} tone={0.55} /><rect x="46" y="28" width="24" height="8" fill="currentColor" fillOpacity={0.18} /></>),
  'grp.floating': () => (<><Axes /><rect x="18" y="26" width="9" height="14" fill="currentColor" fillOpacity={0.55} /><rect x="29" y="18" width="9" height="16" fill="currentColor" fillOpacity={0.18} /><rect x="50" y="14" width="9" height="18" fill="currentColor" fillOpacity={0.55} /><rect x="61" y="22" width="9" height="14" fill="currentColor" fillOpacity={0.18} /></>),
  'heat.viridis': () => <Heat colors={VIRIDIS} />,
  'heat.magma': () => <Heat colors={MAGMA} />,
  'heat.blue': () => <Heat colors={BLUE} />,
  'heat.greenred': () => <Heat colors={GREENRED} />,
  'three.bars': () => (<><Axes /><Bar x={14} y={30} w={6} tone={0.55} /><Bar x={21} y={22} w={6} tone={0.18} /><Bar x={30} y={34} w={6} tone={0.55} /><Bar x={37} y={26} w={6} tone={0.18} /><Bar x={52} y={20} w={6} tone={0.55} /><Bar x={59} y={14} w={6} tone={0.18} /></>),
  'three.dots': () => (<><Axes /><Dot x={16} y={32} /><Dot x={21} y={28} open /><Dot x={32} y={36} /><Dot x={37} y={30} open /><Dot x={54} y={22} /><Dot x={59} y={16} open /></>),
  'grp.box': () => (<><Axes /><BoxV x={22} top={16} q1={24} q3={34} bottom={42} w={8} /><BoxV x={36} top={10} q1={18} q3={28} bottom={38} w={8} /><BoxV x={56} top={12} q1={20} q3={30} bottom={40} w={8} /><BoxV x={70} top={8} q1={16} q3={24} bottom={34} w={8} /></>),
  'grp.violin': () => (<><Axes /><Violin cx={24} w={6} top={16} bottom={40} /><Violin cx={38} w={6} top={10} bottom={36} /><Violin cx={56} w={6} top={14} bottom={40} /><Violin cx={70} w={6} top={8} bottom={32} /></>),
  'cont.sideH': () => (<><Axes /><BarH y={8} x={60} h={5} tone={0.55} /><BarH y={14} x={36} h={5} tone={0.18} /><BarH y={28} x={40} h={5} tone={0.55} /><BarH y={34} x={64} h={5} tone={0.18} /></>),
  'cont.stackH': () => (<><Axes /><BarH y={10} x={40} h={9} tone={0.55} /><rect x="40" y="10" width="20" height="9" fill="currentColor" fillOpacity={0.18} /><BarH y={28} x={30} h={9} tone={0.55} /><rect x="30" y="28" width="38" height="9" fill="currentColor" fillOpacity={0.18} /></>),
  'cont.pctH': () => (<><Axes /><BarH y={10} x={44} h={9} tone={0.55} /><rect x="44" y="10" width="34" height="9" fill="currentColor" fillOpacity={0.18} /><BarH y={28} x={30} h={9} tone={0.55} /><rect x="30" y="28" width="48" height="9" fill="currentColor" fillOpacity={0.18} /></>),
  pie: () => <Pie />,
  doughnut: () => <Pie hole />,
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
