import type { BoxSummary } from '../../../stats/distribution';
import { onAxis, placeable } from '../axes/axisScale';
import type { YAxisScale } from '../axes/scales';

/** A statistic a mark needs, by name and value. */
type Needed = [what: string, value: number];

/** The numbers a box needs to be drawn: the quartiles, the median and the ends of the whiskers (the range with fewer than 4 values). */
export const boxNeeds = (s: BoxSummary): Needed[] =>
  s.shape === 'box'
    ? [['lower quartile', s.q1], ['median', s.median], ['upper quartile', s.q3], ['lower whisker', s.whiskerLow], ['upper whisker', s.whiskerHigh]]
    : [['lowest value', s.min], ['median', s.median], ['highest value', s.max]];

/** The numbers a floating bar needs: its two ends. */
export const floatingNeeds = (s: BoxSummary): Needed[] => [['lowest value', s.min], ['highest value', s.max]];

/**
 * Why a mark made from statistics of the whole sample cannot be drawn on this axis, or null when it can: a number it needs has no place
 * on a log axis, or lies in an omitted range of a broken one. The statistics themselves are never changed by the axis.
 */
export function unplacedMarkNote(scale: Pick<YAxisScale, 'log' | 'segments' | 'reverse'>, mark: string, owner: string, needs: readonly Needed[], n: number): string | null {
  const bad = needs.find(([, v]) => !placeable(scale, v));
  if (!bad) return null;
  const why = onAxis(scale, bad[1]) ? 'lies in an omitted range of the axis, which has no place on it' : 'is 0 or below, which a log axis cannot show';
  return `${mark} of ${owner} is not drawn: its ${bad[0]} ${why}. The statistics include all ${n} value${n === 1 ? '' : 's'}.`;
}
