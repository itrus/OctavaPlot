import { useEffect, useRef, type ReactNode } from 'react';
import type { ChartType } from '../model/types';

/** A small modal with a title, a body and Cancel / confirm buttons. Focus is taken once, when it opens. */
export function Modal({ title, confirmLabel, onConfirm, onClose, confirmDisabled, wide, children }: { title: string; confirmLabel: string; onConfirm: () => void; onClose: () => void; confirmDisabled?: boolean; wide?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const latest = useRef({ onConfirm, onClose });
  latest.current = { onConfirm, onClose };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') latest.current.onClose();
      else if (e.key === 'Enter' && !(e.target instanceof HTMLSelectElement) && !(e.target instanceof HTMLButtonElement && e.target.getAttribute('role') !== 'radio')) {
        // A card is a radio button: Enter on it confirms the choice instead of selecting it again.
        e.preventDefault();
        latest.current.onConfirm();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal modal-wide${wide ? ' modal-xwide' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="modal-head">
          <strong>{title}</strong>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body modal-pad">{children}</div>
        <div className="modal-foot">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={onConfirm} disabled={confirmDisabled}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

const SKETCH = { width: 84, height: 54, viewBox: '0 0 84 54', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, 'aria-hidden': true } as const;

/** A thumbnail of what each chart type looks like. */
export function ChartSketch({ type }: { type: ChartType }) {
  const axes = <path d="M10 6V46H78" />;
  switch (type) {
    case 'bar':
      return (
        <svg {...SKETCH}>
          {axes}
          {[[16, 28], [32, 18], [48, 24], [64, 12]].map(([x, y]) => (
            <rect key={x} x={x} y={y + 6} width="10" height={40 - y - 6} fill="currentColor" fillOpacity={0.25} />
          ))}
        </svg>
      );
    case 'scatter':
      return (
        <svg {...SKETCH}>
          {axes}
          {[[21, [34, 30, 36, 28]], [37, [24, 20, 26, 22]], [53, [18, 14, 20, 16]], [69, [12, 10, 15, 8]]].map(([x, ys]) =>
            (ys as number[]).map((y, i) => <circle key={`${x}-${i}`} cx={(x as number) + (i % 2 ? 3 : -3)} cy={y + 8} r="1.9" fill="currentColor" stroke="none" />),
          )}
        </svg>
      );
    case 'mean':
      return (
        <svg {...SKETCH}>
          {axes}
          {[[21, 30], [37, 22], [53, 26], [69, 16]].map(([x, y]) => (
            <g key={x}>
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
          {[[21, 24, 36], [37, 16, 30], [53, 20, 34], [69, 10, 24]].map(([x, top, bottom]) => (
            <g key={x}>
              <path d={`M${x} ${top - 6}V${top}M${x} ${bottom}V${bottom + 6}M${x - 3} ${top - 6}h6M${x - 3} ${bottom + 6}h6`} />
              <rect x={x - 6} y={top} width="12" height={bottom - top} fill="currentColor" fillOpacity={0.25} />
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
            <g key={i}>
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
            <rect key={x} x={x} y={46 - h} width="12" height={h} fill="currentColor" fillOpacity={0.25} />
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
          {[[21, 26, 38], [37, 14, 30], [53, 20, 36], [69, 8, 26]].map(([x, top, bottom]) => (
            <g key={x}>
              <rect x={x - 7} y={top} width="14" height={bottom - top} fill="currentColor" fillOpacity={0.25} />
              <path d={`M${x - 7} ${(top + bottom) / 2}h14`} strokeWidth={2} />
            </g>
          ))}
        </svg>
      );
    case 'violin':
      return (
        <svg {...SKETCH}>
          {axes}
          {[[21, 30, 8], [37, 22, 10], [53, 26, 7], [69, 16, 9]].map(([x, mid, half]) => (
            <g key={x}>
              <path d={`M${x} ${mid - 14}C${x + half} ${mid - 8} ${x + half} ${mid + 4} ${x} ${mid + 12}C${x - half} ${mid + 4} ${x - half} ${mid - 8} ${x} ${mid - 14}Z`} fill="currentColor" fillOpacity={0.25} />
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
              <rect x={x} y={46 - a} width="10" height={a} fill="currentColor" fillOpacity={0.25} />
              <rect x={x + 10} y={46 - b} width="10" height={b} fill="currentColor" fillOpacity={0.55} />
              <path d={`M${x + 5} ${46 - a - 4}v8M${x + 15} ${46 - b - 4}v8`} />
            </g>
          ))}
        </svg>
      );
    case 'groupedLine':
      return (
        <svg {...SKETCH}>
          {axes}
          <path d="M22 24L56 14" strokeWidth={2} />
          <path d="M22 34L56 30" strokeWidth={2} strokeOpacity={0.55} />
          {[[22, 24], [56, 14], [22, 34], [56, 30]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="2.4" fill="currentColor" stroke="none" />)}
        </svg>
      );
    case 'contingencyBars':
      return (
        <svg {...SKETCH}>
          {axes}
          {[[14, 30, 12], [46, 18, 28]].map(([x, a, b]) => (
            <g key={x}>
              <rect x={x} y={46 - a} width="10" height={a} fill="currentColor" fillOpacity={0.25} />
              <rect x={x + 10} y={46 - b} width="10" height={b} fill="currentColor" fillOpacity={0.55} />
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
                <rect x={x} y={46 - top} width="18" height={top} fill="currentColor" fillOpacity={0.25} />
                <rect x={x} y={46 - total} width="18" height={total - top} fill="currentColor" fillOpacity={0.55} />
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
          {type !== 'xyLine' && pts.map(([x, y]) => <circle key={x} cx={x} cy={y} r="2.4" fill="currentColor" stroke="none" />)}
        </svg>
      );
    }
  }
}
