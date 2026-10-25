import type { Chart, Id } from '../../../model/types';

/** The name of a data set on the chart: the one it was given on this chart, else its own. */
export const displayName = (chart: Chart, groupId: Id, fallback: string): string => {
  const custom = chart.displayNames[groupId];
  return custom !== undefined && custom.trim() !== '' ? custom : fallback;
};
