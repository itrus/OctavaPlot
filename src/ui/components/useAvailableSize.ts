import { useEffect, useRef, useState } from 'react';

/** Space kept around the chart or the page inside its scroll area, in px. */
const CANVAS_PAD = 24;
const SCROLLBAR_ROOM = 17;

/**
 * The room a graph or a page has in its scroll area: attach `ref` to the area. The outer size less room for the scrollbars is taken, so it
 * does not change when a scrollbar appears (or the chart would refit and rescale). It is 0 until the area is measured.
 */
export function useAvailableSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setAvail({ w: el.offsetWidth - SCROLLBAR_ROOM, h: el.offsetHeight - SCROLLBAR_ROOM });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, avail };
}

/** The screen scale (screen px per unit) at which a w × h page fits the room, with the padding around it; 1 until the room is measured. */
export function fitScale(avail: { w: number; h: number }, w: number, h: number): number {
  if (avail.w <= 0 || avail.h <= 0) return 1;
  return Math.max(0.05, Math.min((avail.w - 2 * CANVAS_PAD) / w, (avail.h - 2 * CANVAS_PAD) / h));
}
