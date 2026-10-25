import { type SceneElement, el } from './sceneElement';
import { n2 } from '../../../model/units';
import type { AxisConfig, BreakMark, Chart, GridStyle } from '../../../model/types';
import { dashOf } from '../../../model/graph/look';
import { type YAxisScale, majorStepOf } from '../axes/scales';
import type { PlacedReferenceLine } from './referenceLines';
import { svgId } from './svgIds';
import { labelOffset, tickPath, tickPaths } from '../axes/axisTicks';
import { LEGEND_KEY, type Layout, type LegendItemLayout, type Rect, X_TICK_LABEL_GAP, Y_TICK_LABEL_GAP, keyWidthOf } from '../parts/layout';

/**
 * The chrome of a chart as scene elements: the clip of the plotting region, the backgrounds, the gridlines, the axes with
 * their ticks and numbers, the frame, the scale bars, the titles, the legend and the notes under a plot. Each function
 * takes the geometry a family has worked out and gives back what is drawn, so every family draws these the same way.
 */

/** The clip of the plotting region that the data marks use (`url(#plot-clip)`); a broken axis leaves its gaps out of it. */
export function plotClipElement(plot: Rect, xPieces?: Array<[number, number]> | null, yPieces?: Array<[number, number]> | null): SceneElement {
  const xs = xPieces ?? [[plot.x, plot.x + plot.width] as [number, number]];
  const ys = yPieces ?? [[plot.y, plot.y + plot.height] as [number, number]];
  const rects = xs.flatMap(([x0, x1]) => ys.map(([y0, y1]) => el('rect', [['x', n2(x0)], ['y', n2(y0)], ['width', n2(x1 - x0)], ['height', n2(y1 - y0)]])));
  return el('defs', [], { children: [el('clipPath', [], { id: 'plot-clip', children: rects })] });
}

/** Path data of an axis line from `from` to `to` at `fixed` across it; a broken axis is drawn in its pieces, with no line in the gaps. */
function axisLineD(along: 'x' | 'y', fixed: number, from: number, to: number, pieces?: Array<[number, number]> | null): string {
  const ranges = pieces ?? [[from, to] as [number, number]];
  return ranges.map(([a, b]) => (along === 'y' ? `M${n2(fixed)},${n2(a)}V${n2(b)}` : `M${n2(a)},${n2(fixed)}H${n2(b)}`)).join('');
}

/** The chart background is the hit target for chart-level selection; the plotting region has its own colour. */
export function backgroundElements(chart: Chart, width: number, height: number, plot: Rect): SceneElement[] {
  return [
    el('rect', [['x', 0], ['y', 0], ['width', n2(width)], ['height', n2(height)], ['fill', chart.pageColor ?? '#ffffff'], ['fill-opacity', chart.pageColor ? undefined : 0]], { hit: { kind: 'background' }, id: 'page' }),
    el('rect', [['x', n2(plot.x)], ['y', n2(plot.y)], ['width', n2(plot.width)], ['height', n2(plot.height)], ['fill', chart.plotColor ?? '#ffffff'], ['fill-opacity', chart.plotColor ? undefined : 0]], { hit: { kind: 'background' }, id: 'plot-area' }),
  ];
}

export interface GridProps {
  /** 'h' = horizontal lines (one per Y tick), 'v' = vertical lines (one per X tick). */
  dir: 'h' | 'v';
  grid: GridStyle;
  major: readonly number[];
  minor: readonly number[];
  showMajor: boolean;
  showMinor: boolean;
  /** Position of a value across the plot (y for horizontal lines, x for vertical ones). */
  at: (v: number) => number;
  /** Where the lines start and end along their length. */
  from: number;
  to: number;
  /** Pattern for the major lines when the style is solid (the right axis is dashed to tell it from the left). */
  fallbackDash?: string;
}

const gridLine = (dir: 'h' | 'v', pos: number, from: number, to: number): string => (dir === 'h' ? `M${n2(from)},${n2(pos)}H${n2(to)}` : `M${n2(pos)},${n2(from)}V${n2(to)}`);

/** The gridlines of one axis, major and minor, drawn behind the data. */
export function gridElements({ dir, grid, major, minor, showMajor, showMinor, at, from, to, fallbackDash }: GridProps): SceneElement[] {
  const out: SceneElement[] = [];
  if (showMajor) {
    out.push(el('g', [['stroke', grid.color], ['stroke-width', grid.widthPt], ['stroke-opacity', grid.opacity < 1 ? grid.opacity : undefined], ['fill', 'none'], ['stroke-dasharray', dashOf(grid.style) ?? fallbackDash]], { children: major.map((t) => el('path', [['d', gridLine(dir, at(t), from, to)]])) }));
  }
  if (showMinor && minor.length > 0) {
    out.push(el('g', [['stroke', grid.minorColor], ['stroke-width', grid.minorWidthPt], ['stroke-opacity', grid.minorOpacity < 1 ? grid.minorOpacity : undefined], ['fill', 'none'], ['stroke-dasharray', dashOf(grid.minorStyle)]], { children: minor.map((t) => el('path', [['d', gridLine(dir, at(t), from, to)]])) }));
  }
  return out;
}

const MARK_HALF = 8;
const MARK_SLANT = 6;

/** The marks at the ends of the gaps of a broken axis: one slash or two, across the axis line. */
function breakMarkElement({ along, fixed, gaps, mark, color, width }: { along: 'x' | 'y'; fixed: number; gaps: Array<[number, number]>; mark: BreakMark; color: string; width: number }): SceneElement | null {
  if (mark === 'none' || gaps.length === 0) return null;
  const slash = (p: number, shift: number) =>
    along === 'y' ? `M${n2(fixed - MARK_HALF)},${n2(p + shift + MARK_SLANT)}L${n2(fixed + MARK_HALF)},${n2(p + shift - MARK_SLANT)}` : `M${n2(p + shift - MARK_SLANT)},${n2(fixed + MARK_HALF)}L${n2(p + shift + MARK_SLANT)},${n2(fixed - MARK_HALF)}`;
  const at = gaps.flatMap(([a, b]) => [a, b]);
  const d = at.map((p) => (mark === 'doubleSlash' ? slash(p, -3) + slash(p, 3) : slash(p, 0))).join('');
  return el('path', [['d', d], ['stroke', color], ['stroke-width', width], ['fill', 'none'], ['stroke-linecap', 'butt']]);
}

/** A box round the plotting region, when the chart asks for one. */
export function frameElement(chart: Chart, plot: Rect, lineWidthPt: number): SceneElement | null {
  if (chart.frame !== 'box') return null;
  return el('rect', [['x', n2(plot.x)], ['y', n2(plot.y)], ['width', n2(plot.width)], ['height', n2(plot.height)], ['fill', 'none'], ['stroke', chart.axisColor], ['stroke-width', lineWidthPt], ['stroke-opacity', chart.axisOpacity < 1 ? chart.axisOpacity : undefined]]);
}

/**
 * The chart title and the titles of the axes. `bottom` and `left` are the settings of the axes drawn along the bottom and
 * down the left (on a horizontal chart those are the value and the category axis); `right` is the right-hand Y axis, if drawn.
 */
export function titleElements(chart: Chart, layout: Layout, bottom: AxisConfig, left: AxisConfig, right?: AxisConfig | null): SceneElement[] {
  const weight = (bold: boolean) => (bold ? 'bold' : undefined);
  const turned = (t: { x: number; y: number }) => `rotate(-90 ${n2(t.x)} ${n2(t.y)})`;
  const out: SceneElement[] = [];
  if (layout.title) {
    out.push(el('text', [['x', n2(layout.title.x)], ['y', n2(layout.title.y)], ['text-anchor', 'middle'], ['font-size', layout.title.fontSizePt], ['font-weight', weight(chart.titleBold)], ['fill', chart.textColor]], { hit: { kind: 'title' }, id: 'chart-title', text: chart.title }));
  }
  if (layout.xTitle) {
    out.push(el('text', [['x', n2(layout.xTitle.x)], ['y', n2(layout.xTitle.y)], ['text-anchor', 'middle'], ['font-size', bottom.titleFontSizePt], ['font-weight', weight(bottom.titleBold)], ['fill', chart.textColor]], { hit: { kind: 'title' }, id: 'x-axis-title', text: bottom.title }));
  }
  if (layout.yTitle) {
    out.push(el('text', [['x', n2(layout.yTitle.x)], ['y', n2(layout.yTitle.y)], ['text-anchor', 'middle'], ['transform', turned(layout.yTitle)], ['font-size', left.titleFontSizePt], ['font-weight', weight(left.titleBold)], ['fill', chart.textColor]], { hit: { kind: 'title' }, id: 'y-axis-title', text: left.title }));
  }
  if (right && layout.y2Title) {
    out.push(el('text', [['x', n2(layout.y2Title.x)], ['y', n2(layout.y2Title.y)], ['text-anchor', 'middle'], ['transform', turned(layout.y2Title)], ['font-size', right.titleFontSizePt], ['font-weight', weight(right.titleBold)], ['fill', chart.textColor]], { hit: { kind: 'title' }, id: 'y2-axis-title', text: right.title }));
  }
  return out;
}

/** Gap between a scale bar and the corner of the plotting region it stands in, pt. */
const BAR_INSET = 20;

/**
 * The scale bar of a hidden axis: a line as long as one major tick interval, with that interval written beside it, in
 * the lower left corner of the plotting region. `along` is the direction the axis runs; `map` its mapping to the page.
 */
export function scaleBarElement(chart: Chart, axis: AxisConfig, along: 'x' | 'y', scale: YAxisScale, map: (v: number) => number, plot: Rect): SceneElement | null {
  if (axis.visible || !axis.scaleBar || scale.log) return null;
  const step = majorStepOf(scale);
  const lo = Math.min(scale.domain[0], scale.domain[1]);
  const length = Math.abs(map(lo + step) - map(lo));
  if (!(length > 0) || !Number.isFinite(length)) return null;
  const label = scale.tickLabel(step);
  const x0 = plot.x + BAR_INSET;
  const yBottom = plot.y + plot.height - BAR_INSET;
  const font = axis.tickFontSizePt;
  const stroke = [['stroke', chart.axisColor], ['stroke-width', axis.lineWidthPt], ['stroke-opacity', chart.axisOpacity < 1 ? chart.axisOpacity : undefined], ['stroke-linecap', 'butt'], ['fill', 'none']] as const;
  const caps = 6;
  if (along === 'x') {
    return el('g', [], {
      children: [
        el('path', [['d', `M${n2(x0)},${n2(yBottom)}H${n2(x0 + length)}M${n2(x0)},${n2(yBottom - caps)}v${caps * 2}M${n2(x0 + length)},${n2(yBottom - caps)}v${caps * 2}`], ...stroke]),
        el('text', [['x', n2(x0 + length / 2)], ['y', n2(yBottom - caps - 6)], ['text-anchor', 'middle'], ['font-size', font], ['font-weight', axis.tickBold ? 'bold' : undefined], ['fill', chart.textColor]], { text: label }),
      ],
    });
  }
  return el('g', [], {
    children: [
      el('path', [['d', `M${n2(x0)},${n2(yBottom)}V${n2(yBottom - length)}M${n2(x0 - caps)},${n2(yBottom)}h${caps * 2}M${n2(x0 - caps)},${n2(yBottom - length)}h${caps * 2}`], ...stroke]),
      el('text', [['x', n2(x0 + caps + 8)], ['y', n2(yBottom - length / 2)], ['dy', '0.35em'], ['font-size', font], ['font-weight', axis.tickBold ? 'bold' : undefined], ['fill', chart.textColor]], { text: label }),
    ],
  });
}

/** The reference lines of a chart, behind the data and clipped to the plotting region; their labels sit at the line's end. */
export function referenceLineElements(lines: readonly PlacedReferenceLine[], fontSizePt: number): SceneElement[] {
  if (lines.length === 0) return [];
  return [
    el('g', [['data-reference-lines', '']], {
      children: [
        el('g', [['clip-path', 'url(#plot-clip)'], ['fill', 'none']], {
          children: lines.map((l) => el('path', [['d', l.d], ['stroke', l.line.color], ['stroke-width', l.line.widthPt], ['stroke-opacity', l.line.opacity < 1 ? l.line.opacity : undefined], ['stroke-dasharray', dashOf(l.line.style, l.line.widthPt)]], { id: svgId('reference-line', l.id) })),
        }),
        ...lines.flatMap((l) =>
          l.label
            ? [el('text', [['x', n2(l.labelX)], ['y', n2(l.labelY)], ['text-anchor', l.anchor], ['font-size', fontSizePt], ['fill', l.line.color], ['fill-opacity', l.line.opacity < 1 ? l.line.opacity : undefined], ['pointer-events', 'none']], { id: svgId('reference-line', l.id, 'label'), text: l.label })]
            : [],
        ),
      ],
    }),
  ];
}

export interface NumericAxisProps {
  /** What the axis is called in the drawing (its id and what a click on it selects); the direction it runs by default. */
  name?: 'x' | 'y';
  chart: Chart;
  cfg: AxisConfig;
  scale: YAxisScale;
  /** Which way the axis runs: 'x' along the bottom, 'y' up the left. */
  along: 'x' | 'y';
  /** Where the axis line is across its direction (see crossingPosition). */
  crossing: number;
  plot: Rect;
  /** Pieces of a broken axis that are drawn and its gaps; null when it is not broken. */
  pieces: Array<[number, number]> | null;
  gaps: Array<[number, number]>;
  /** The mapping of a value to the page along the axis. */
  map: (v: number) => number;
}

/** A numeric axis: its line (in pieces when it is broken), the marks at the gaps, the ticks and the numbers. Nothing for a hidden axis. */
export function numericAxisElements({ name: given, chart, cfg, scale, along, crossing, plot, pieces, gaps, map }: NumericAxisProps): SceneElement[] {
  if (!cfg.visible) return [];
  const name = given ?? along;
  const bottom = plot.y + plot.height;
  const right = plot.x + plot.width;
  const line = along === 'y' ? axisLineD('y', crossing, plot.y, bottom, pieces) : axisLineD('x', crossing, plot.x, right, pieces);
  const marks = breakMarkElement({ along, fixed: crossing, gaps, mark: cfg.breakMark, color: chart.axisColor, width: cfg.lineWidthPt });
  const ticks = tickPaths(along === 'y' ? 'left' : 'bottom', crossing, cfg, scale.ticks, scale.minorTicks ?? [], map);
  const axis = el('g', [['stroke', chart.axisColor], ['stroke-width', cfg.lineWidthPt], ['stroke-opacity', chart.axisOpacity < 1 ? chart.axisOpacity : undefined], ['fill', 'none'], ['stroke-linecap', 'square']], {
    hit: { kind: 'axis', objectId: name },
    id: `${name}-axis`,
    children: [
      el('path', [['d', line]]),
      el('path', [['d', line], ['stroke', 'transparent'], ['stroke-width', 28]], { editorOnly: true }),
      ...(marks ? [marks] : []),
      ...ticks.map((p) => el('path', [['d', p.d], ['stroke-linecap', 'butt']])),
    ],
  });
  const labels = scale.ticks.map((t) =>
    along === 'y'
      ? el('text', [['x', n2(plot.x - labelOffset(cfg) - Y_TICK_LABEL_GAP)], ['y', n2(map(t))], ['dy', '0.35em'], ['text-anchor', 'end'], ['font-size', cfg.tickFontSizePt], ['font-weight', cfg.tickBold ? 'bold' : undefined], ['fill', chart.textColor]], { hit: { kind: 'axis', objectId: name }, text: scale.tickLabel(t) })
      : el('text', [['x', n2(map(t))], ['y', n2(bottom + labelOffset(cfg) + X_TICK_LABEL_GAP + cfg.tickFontSizePt * 0.8)], ['text-anchor', 'middle'], ['font-size', cfg.tickFontSizePt], ['font-weight', cfg.tickBold ? 'bold' : undefined], ['fill', chart.textColor]], { hit: { kind: 'axis', objectId: name }, text: scale.tickLabel(t) }),
  );
  return [axis, ...labels];
}

export interface CategoryAxisProps {
  chart: Chart;
  cfg: AxisConfig;
  plot: Rect;
  /** The categories along the axis: where each is in the vertical drawing (see Orientation in shared/parts/orientation.ts) and what it is called. */
  items: ReadonlyArray<{ key: string | number; centerX: number; label: string }>;
  /** Horizontal columns: the categories are down the left. */
  horizontal: boolean;
  /** Where the axis line is across its direction (see crossingPosition). */
  crossing: number;
  /** The position on the page along the axis of a category centre (down the left of horizontal columns). */
  categoryY: (centerX: number) => number;
  /** The names are turned 45 degrees to fit (see the layout). */
  rotated: boolean;
}

/** The axis of the categories of bars or lines: its line, a tick at each category and the names. Nothing for a hidden axis. */
export function categoryAxisElements({ chart, cfg, plot, items, horizontal, crossing, categoryY, rotated }: CategoryAxisProps): SceneElement[] {
  if (!cfg.visible) return [];
  const bottom = plot.y + plot.height;
  const line = horizontal ? `M${n2(crossing)},${n2(plot.y)}V${n2(bottom)}` : `M${n2(plot.x)},${n2(crossing)}H${n2(plot.x + plot.width)}`;
  const axis = el('g', [['stroke', chart.axisColor], ['stroke-width', cfg.lineWidthPt], ['stroke-opacity', chart.axisOpacity < 1 ? chart.axisOpacity : undefined], ['fill', 'none'], ['stroke-linecap', 'square']], {
    hit: { kind: 'axis', objectId: 'x' },
    id: 'x-axis',
    children: [
      el('path', [['d', line]]),
      el('path', [['d', line], ['stroke', 'transparent'], ['stroke-width', 28]], { editorOnly: true }),
      ...items.map((c) => el('path', [['d', horizontal ? tickPath('left', categoryY(c.centerX), crossing, cfg) : tickPath('bottom', c.centerX, crossing, cfg)], ['stroke-linecap', 'butt']])),
    ],
  });
  const labels = items.map((c) => {
    if (horizontal) {
      return el('text', [['x', n2(plot.x - labelOffset(cfg) - Y_TICK_LABEL_GAP)], ['y', n2(categoryY(c.centerX))], ['dy', '0.35em'], ['text-anchor', 'end'], ['font-size', cfg.tickFontSizePt], ['font-weight', cfg.tickBold ? 'bold' : undefined], ['fill', chart.textColor]], { hit: { kind: 'axis', objectId: 'x' }, text: c.label });
    }
    const ty = bottom + labelOffset(cfg) + X_TICK_LABEL_GAP + cfg.tickFontSizePt * 0.8;
    const common = [['font-size', cfg.tickFontSizePt], ['font-weight', cfg.tickBold ? 'bold' : undefined], ['fill', chart.textColor]] as const;
    return rotated
      ? el('text', [['x', n2(c.centerX)], ['y', n2(ty - cfg.tickFontSizePt * 0.4)], ['text-anchor', 'end'], ['transform', `rotate(-45 ${n2(c.centerX)} ${n2(ty - cfg.tickFontSizePt * 0.4)})`], ...common], { hit: { kind: 'axis', objectId: 'x' }, text: c.label })
      : el('text', [['x', n2(c.centerX)], ['y', n2(ty)], ['text-anchor', 'middle'], ...common], { hit: { kind: 'axis', objectId: 'x' }, text: c.label });
  });
  return [axis, ...labels];
}

/** The right-hand Y axis: its line down the right of the plot, its ticks and its numbers. */
export function secondaryAxisElements({ chart, cfg, scale, map, plot }: { chart: Chart; cfg: AxisConfig; scale: YAxisScale; map: (v: number) => number; plot: Rect }): SceneElement[] {
  const bottom = plot.y + plot.height;
  const right = plot.x + plot.width;
  const line = `M${n2(right)},${n2(plot.y)}V${n2(bottom)}`;
  const axis = el('g', [['stroke', chart.axisColor], ['stroke-width', cfg.lineWidthPt], ['stroke-opacity', chart.axisOpacity < 1 ? chart.axisOpacity : undefined], ['fill', 'none'], ['stroke-linecap', 'square']], {
    hit: { kind: 'axis', objectId: 'y2' },
    id: 'y2-axis',
    children: [
      el('path', [['d', line]]),
      el('path', [['d', line], ['stroke', 'transparent'], ['stroke-width', 28]], { editorOnly: true }),
      ...tickPaths('right', right, cfg, scale.ticks, scale.minorTicks ?? [], map).map((p) => el('path', [['d', p.d], ['stroke-linecap', 'butt']])),
    ],
  });
  const labels = scale.ticks.map((t) =>
    el('text', [['x', n2(right + labelOffset(cfg) + Y_TICK_LABEL_GAP)], ['y', n2(map(t))], ['dy', '0.35em'], ['text-anchor', 'start'], ['font-size', cfg.tickFontSizePt], ['font-weight', cfg.tickBold ? 'bold' : undefined], ['fill', chart.textColor]], { hit: { kind: 'axis', objectId: 'y2' }, text: scale.tickLabel(t) }),
  );
  return [axis, ...labels];
}

/**
 * The legend: one entry per item of the layout, each a key (what `keysOf` draws at the item's place and width) and the
 * name of the data set. A click on an entry selects its data set.
 */
export function legendElements(chart: Chart, layout: Layout, keysOf: (item: LegendItemLayout, keyWidth: number) => { groupId: string; keys: SceneElement[] }): SceneElement[] {
  const legend = layout.legend;
  if (!legend) return [];
  const w = keyWidthOf(chart.legend);
  return [
    el('g', [], {
      id: 'legend',
      children: legend.items.map((it) => {
        const { groupId, keys } = keysOf(it, w);
        return el('g', [], {
          hit: { kind: 'legend', groupId },
          children: [...keys, el('text', [['x', n2(it.x + w + LEGEND_KEY.gap)], ['y', n2(it.y)], ['dy', '0.35em'], ['font-size', legend.fontSizePt], ['fill', chart.textColor]], { text: it.label })],
        });
      }),
    }),
  ];
}

