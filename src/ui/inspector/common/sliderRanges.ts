/**
 * What the slider of a number field covers and how far it moves in one step. A typed value may go beyond the slider, up to the
 * limit of the field; the slider covers the range that is used in practice, so that one step is a step that matters.
 */
export const SLIDERS = {
  /** Line widths, borders and thicknesses (pt). */
  line: { sliderMax: 10, step: 0.2 },
  /** Font sizes (pt). */
  font: { sliderMax: 40, step: 1 },
  /** Symbol sizes (pt). */
  symbol: { sliderMax: 40, step: 1 },
  /** Cap widths of error bars (pt). */
  cap: { sliderMax: 20, step: 1 },
  /** Tick lengths (pt). */
  tick: { sliderMax: 20, step: 0.5 },
  /** Distances of titles and numbers from the axis (pt). */
  distance: { sliderMax: 60, step: 1 },
  /** Offsets of labels (pt), either way. */
  offset: { sliderMin: -100, sliderMax: 100 },
  /** Moves of a legend (pt), either way. */
  move: { sliderMin: -300, sliderMax: 300 },
  /** Opacities and other fractions from 0 to 1. */
  fraction: { step: 0.05 },
  /** Percentages. */
  percent: { step: 1 },
  /** Gaps in a heat map (pt). */
  gap: { sliderMax: 20, step: 0.5 },
  /** Larger distances in a heat map and sizes of colour bars (pt). */
  wide: { sliderMax: 40, step: 1 },
  /** Sizes of heat map cells (pt). */
  cell: { sliderMax: 100, step: 1 },
} as const;
