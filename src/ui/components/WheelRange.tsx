import { useEffect, useRef } from 'react';

interface Props {
  value: number;
  min: number;
  max: number;
  step: number;
  /** Called with the new value, from a drag, a key press or the wheel. */
  onValue: (v: number) => void;
  disabled?: boolean;
  ariaLabel?: string;
}

/** Wheel distance (deltaY units) that moves the slider by one step; a mouse notch is 100. */
const WHEEL_PER_STEP = 100;

/** A range slider that also responds to the mouse wheel once it has the focus: wheel up raises the value, wheel down lowers it. */
export function WheelRange({ value, min, max, step, onValue, disabled, ariaLabel }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  // The listener is attached once; it reads the latest props from here.
  const latest = useRef({ value, min, max, step, onValue, disabled });
  latest.current = { value, min, max, step, onValue, disabled };
  const carry = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const s = latest.current;
      if (s.disabled || e.ctrlKey || e.metaKey) return; // browser zoom
      // Only a slider that has the focus takes the wheel: passing over one while scrolling the panel must not change it.
      if (document.activeElement !== el) return;
      e.preventDefault(); // the panel behind must not scroll while the wheel is used on the focused slider
      const unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 100 : 1;
      carry.current += -(e.deltaY || e.deltaX) * unit;
      const steps = Math.trunc(carry.current / WHEEL_PER_STEP);
      if (steps === 0) return;
      carry.current -= steps * WHEEL_PER_STEP;
      const next = Math.min(s.max, Math.max(s.min, s.value + steps * s.step));
      if (next !== s.value) s.onValue(next);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <input
      ref={ref}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => onValue(Number(e.target.value))}
    />
  );
}
