import type { SymbolShape } from '../../../model/types';
import { SYMBOL_SHAPES } from '../../../model/graph/look';
import { n2 } from '../../../model/units';

/**
 * SVG path for a symbol centred on (cx, cy). `size` is the physical extent in
 * pt (diameter for the circle, side for the square, height/width of the
 * triangle and diamond). `borderPt` is the thickness of the border the path is drawn with: the dot inside a shape is a circle so small
 * that this border covers it, so the dot is a solid disc in the colour of the border whatever the fill of the shape.
 */
export function symbolPath(shape: SymbolShape, cx: number, cy: number, size: number, borderPt = 0): string {
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
      // A circle with a dot in the middle.
      return `${symbolPath('circle', cx, cy, size)}${dot(cx, cy, h, borderPt)}`;
    }
    case 'hash': {
      const a = h / 3;
      const e = h * 0.9;
      return `M${n2(cx - a)},${n2(cy - e)}V${n2(cy + e)}M${n2(cx + a)},${n2(cy - e)}V${n2(cy + e)}M${n2(cx - e)},${n2(cy - a)}H${n2(cx + e)}M${n2(cx - e)},${n2(cy + a)}H${n2(cx + e)}`;
    }
    case 'circlePlus':
      return `${symbolPath('circle', cx, cy, size)}${symbolPath('plus', cx, cy, size)}`;
    case 'circleCross': {
      const d = h * Math.SQRT1_2;
      return `${symbolPath('circle', cx, cy, size)}M${n2(cx - d)},${n2(cy - d)}L${n2(cx + d)},${n2(cy + d)}M${n2(cx - d)},${n2(cy + d)}L${n2(cx + d)},${n2(cy - d)}`;
    }
    case 'squareDot': {
      return `${symbolPath('square', cx, cy, size)}${dot(cx, cy, h, borderPt)}`;
    }
    case 'squarePlus':
      return `${symbolPath('square', cx, cy, size)}${symbolPath('plus', cx, cy, size)}`;
    case 'squareCross':
      return `${symbolPath('square', cx, cy, size)}M${n2(cx - h)},${n2(cy - h)}L${n2(cx + h)},${n2(cy + h)}M${n2(cx - h)},${n2(cy + h)}L${n2(cx + h)},${n2(cy - h)}`;
    case 'hexagonDot': {
      return `${polygon(cx, cy, 6, h, 0)}${dot(cx, cy, h, borderPt)}`;
    }
    case 'pentagon':
      return polygon(cx, cy, 5, h, 0);
    case 'octagon':
      return polygon(cx, cy, 8, h, Math.PI / 8);
    case 'triangleLeft':
      return `M${n2(cx - h)},${n2(cy)}L${n2(cx + h)},${n2(cy - h)}L${n2(cx + h)},${n2(cy + h)}Z`;
    case 'triangleRight':
      return `M${n2(cx + h)},${n2(cy)}L${n2(cx - h)},${n2(cy - h)}L${n2(cx - h)},${n2(cy + h)}Z`;
    // A half disc with its round side on the named side; the box of the half disc is centred on the point.
    case 'halfCircleLeft':
      return `M${n2(cx + h / 2)},${n2(cy - h)}A${n2(h)},${n2(h)} 0 0,0 ${n2(cx + h / 2)},${n2(cy + h)}Z`;
    case 'halfCircleRight':
      return `M${n2(cx - h / 2)},${n2(cy - h)}A${n2(h)},${n2(h)} 0 0,1 ${n2(cx - h / 2)},${n2(cy + h)}Z`;
    case 'halfCircleUp':
      return `M${n2(cx - h)},${n2(cy + h / 2)}A${n2(h)},${n2(h)} 0 0,1 ${n2(cx + h)},${n2(cy + h / 2)}Z`;
    case 'halfCircleDown':
      return `M${n2(cx - h)},${n2(cy - h / 2)}A${n2(h)},${n2(h)} 0 0,0 ${n2(cx + h)},${n2(cy - h / 2)}Z`;
    case 'verticalBar':
      return `M${n2(cx - h * 0.18)},${n2(cy - h)}h${n2(h * 0.36)}v${n2(size)}h${n2(-h * 0.36)}Z`;
    case 'horizontalBar':
      return `M${n2(cx - h)},${n2(cy - h * 0.18)}h${n2(size)}v${n2(h * 0.36)}h${n2(-size)}Z`;
    case 'asterisk': {
      const d = h * 0.87;
      return `M${n2(cx - h)},${n2(cy)}H${n2(cx + h)}M${n2(cx - h / 2)},${n2(cy - d)}L${n2(cx + h / 2)},${n2(cy + d)}M${n2(cx - h / 2)},${n2(cy + d)}L${n2(cx + h / 2)},${n2(cy - d)}`;
    }
  }
}

/**
 * The dot inside a shape: a solid disc a little over a third of the shape across, in the colour of the border. It is drawn by the border alone,
 * so that it stays solid whatever the fill of the shape: concentric circles that the border paints, each overlapping the next, with the last
 * of half the border across, whose border reaches the centre exactly. Without a border there is nothing to paint it with: a disc of the fill's.
 */
function dot(cx: number, cy: number, h: number, borderPt: number): string {
  const ring = (r: number) => `M${n2(cx - r)},${n2(cy)}a${n2(r)},${n2(r)} 0 1,0 ${n2(2 * r)},0a${n2(r)},${n2(r)} 0 1,0 ${n2(-2 * r)},0Z`;
  const reach = Math.max(h * 0.38, borderPt / 2);
  if (borderPt < 0.1) return ring(reach);
  let d = '';
  const last = borderPt / 2;
  let r = Math.max(reach - borderPt / 2, last);
  for (;;) {
    d += ring(r);
    if (r <= last) return d;
    r = Math.max(r - borderPt * 0.9, last);
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
export const SYMBOL_SHAPE_OPTIONS = SYMBOL_SHAPES;
