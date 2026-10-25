import type { SymbolShape } from '../../../model/types';
import { n2 } from '../../../model/units';

/**
 * SVG path for a symbol centred on (cx, cy). `size` is the physical extent in
 * pt (diameter for the circle, side for the square, height/width of the
 * triangle and diamond).
 */
export function symbolPath(shape: SymbolShape, cx: number, cy: number, size: number): string {
  const h = size / 2;
  switch (shape) {
    case 'circle':
      return `M${n2(cx - h)},${n2(cy)}a${n2(h)},${n2(h)} 0 1,0 ${n2(size)},0a${n2(h)},${n2(h)} 0 1,0 ${n2(-size)},0Z`;
    case 'square':
      return `M${n2(cx - h)},${n2(cy - h)}h${n2(size)}v${n2(size)}h${n2(-size)}Z`;
    case 'triangle':
      return `M${n2(cx)},${n2(cy - h)}L${n2(cx + h)},${n2(cy + h)}L${n2(cx - h)},${n2(cy + h)}Z`;
    case 'plus':
      return `M${n2(cx - h)},${n2(cy)}H${n2(cx + h)}M${n2(cx)},${n2(cy - h)}V${n2(cy + h)}`;
    case 'cross': {
      const d = h * 0.78;
      return `M${n2(cx - d)},${n2(cy - d)}L${n2(cx + d)},${n2(cy + d)}M${n2(cx - d)},${n2(cy + d)}L${n2(cx + d)},${n2(cy - d)}`;
    }
    case 'triangleDown':
      return `M${n2(cx - h)},${n2(cy - h)}L${n2(cx + h)},${n2(cy - h)}L${n2(cx)},${n2(cy + h)}Z`;
    case 'diamond':
      return `M${n2(cx)},${n2(cy - h)}L${n2(cx + h)},${n2(cy)}L${n2(cx)},${n2(cy + h)}L${n2(cx - h)},${n2(cy)}Z`;
    case 'hexagon':
      return polygon(cx, cy, 6, h, 0);
    case 'star':
      return starPath(cx, cy, h);
    case 'target': {
      // A circle with a dot in the middle; the dot is a second subpath drawn the same way round, so both are filled.
      const r = h * 0.3;
      return `${symbolPath('circle', cx, cy, size)}M${n2(cx - r)},${n2(cy)}a${n2(r)},${n2(r)} 0 1,0 ${n2(2 * r)},0a${n2(r)},${n2(r)} 0 1,0 ${n2(-2 * r)},0Z`;
    }
    case 'asterisk': {
      const d = h * 0.87;
      return `M${n2(cx - h)},${n2(cy)}H${n2(cx + h)}M${n2(cx - h / 2)},${n2(cy - d)}L${n2(cx + h / 2)},${n2(cy + d)}M${n2(cx - h / 2)},${n2(cy + d)}L${n2(cx + h / 2)},${n2(cy - d)}`;
    }
  }
}

/** A regular polygon with its first corner at the top, rotated by `turn` radians. */
function polygon(cx: number, cy: number, corners: number, radius: number, turn: number): string {
  let d = '';
  for (let i = 0; i < corners; i++) {
    const a = -Math.PI / 2 + turn + (2 * Math.PI * i) / corners;
    d += `${i === 0 ? 'M' : 'L'}${n2(cx + radius * Math.cos(a))},${n2(cy + radius * Math.sin(a))}`;
  }
  return d + 'Z';
}

/** A five-pointed star whose points reach `radius` and whose inner corners lie at 0.4 of it. */
function starPath(cx: number, cy: number, radius: number): string {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / 5;
    const r = i % 2 === 0 ? radius : radius * 0.4;
    d += `${i === 0 ? 'M' : 'L'}${n2(cx + r * Math.cos(a))},${n2(cy + r * Math.sin(a))}`;
  }
  return d + 'Z';
}

/** The symbol shapes the inspector offers. */
export const SYMBOL_SHAPE_OPTIONS = [
  { value: 'circle', label: 'Circle' },
  { value: 'square', label: 'Square' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'triangleDown', label: 'Triangle (down)' },
  { value: 'diamond', label: 'Diamond' },
  { value: 'hexagon', label: 'Hexagon' },
  { value: 'star', label: 'Star' },
  { value: 'target', label: 'Circle with dot' },
  { value: 'plus', label: 'Plus' },
  { value: 'cross', label: 'Cross' },
  { value: 'asterisk', label: 'Asterisk' },
] as const;
