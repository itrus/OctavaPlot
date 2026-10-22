import type { SymbolShape } from '../model/types';
import { n2 } from '../model/units';

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
    case 'diamond':
      return `M${n2(cx)},${n2(cy - h)}L${n2(cx + h)},${n2(cy)}L${n2(cx)},${n2(cy + h)}L${n2(cx - h)},${n2(cy)}Z`;
  }
}
