import { pageMm, slotRects } from '../../model/project/layout';
import { mmToPt } from '../../model/units';
import type { LayoutArrangement, PageOrientation } from '../../model/types';

/** The longest side of a sketch of a page, in px. */
const SIDE = 44;

/** A thumbnail of an arrangement: the panels drawn on a page of the chosen orientation. */
export function ArrangementSketch({ arrangement, orientation }: { arrangement: LayoutArrangement; orientation: PageOrientation }) {
  const mm = pageMm(orientation);
  const rects = slotRects({ orientation, marginMm: 14, showTitle: false, arrangement, gapMm: 8 });
  const scale = SIDE / Math.max(mm.width, mm.height);
  const [w, h] = [mm.width * scale, mm.height * scale];
  // The panels are in pt on the page; the sketch is in px.
  const k = w / mmToPt(mm.width);
  return (
    <svg width={w + 2} height={h + 2} viewBox={`-1 -1 ${w + 2} ${h + 2}`} fill="none" stroke="currentColor" strokeWidth={1.2} aria-hidden="true">
      <rect x={0} y={0} width={w} height={h} rx={1.5} />
      {rects.map((r, i) => (
        <rect key={i} x={r.x * k} y={r.y * k} width={r.w * k} height={r.h * k} rx={1} />
      ))}
    </svg>
  );
}

/** A thumbnail of free placement: boxes put anywhere on the page, one over the corner of another. */
export function FreeSketch({ orientation }: { orientation: PageOrientation }) {
  const mm = pageMm(orientation);
  const scale = SIDE / Math.max(mm.width, mm.height);
  const [w, h] = [mm.width * scale, mm.height * scale];
  const box = (x: number, y: number, bw: number, bh: number) => <rect x={w * x} y={h * y} width={w * bw} height={h * bh} rx={1} strokeDasharray="2.5 2" />;
  return (
    <svg width={w + 2} height={h + 2} viewBox={`-1 -1 ${w + 2} ${h + 2}`} fill="none" stroke="currentColor" strokeWidth={1.2} aria-hidden="true">
      <rect x={0} y={0} width={w} height={h} rx={1.5} />
      {box(0.1, 0.12, 0.5, 0.5)}
      {box(0.45, 0.4, 0.45, 0.48)}
    </svg>
  );
}
