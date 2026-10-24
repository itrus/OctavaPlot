import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';

interface Props {
  /** The panel being resized: `nav` grows to the right, `insp` grows to the left. */
  side: 'nav' | 'insp';
  width: number;
  min: number;
  max: number;
  onWidth: (px: number) => void;
  label: string;
}

/** A drag handle (and a separator that arrow keys move) at the inner edge of a side panel. */
export function Splitter({ side, width, min, max, onWidth, label }: Props) {
  const start = useRef<{ x: number; width: number } | null>(null);
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v)));
  const sign = side === 'nav' ? 1 : -1;
  const style: CSSProperties = side === 'nav' ? { left: `calc(var(--nav-w, 250px) - 3px)` } : { right: `calc(var(--insp-w, 0px) - 3px)` };
  return (
    <div
      className="splitter"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      style={style}
      onPointerDown={(e: PointerEvent<HTMLDivElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, width };
      }}
      onPointerMove={(e: PointerEvent<HTMLDivElement>) => {
        if (start.current) onWidth(clamp(start.current.width + sign * (e.clientX - start.current.x)));
      }}
      onPointerUp={() => (start.current = null)}
      onPointerCancel={() => (start.current = null)}
      onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        const step = (e.shiftKey ? 50 : 10) * (e.key === 'ArrowRight' ? 1 : -1);
        onWidth(clamp(width + sign * step));
      }}
    />
  );
}
