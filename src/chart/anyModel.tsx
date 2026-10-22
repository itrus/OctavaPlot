import { forwardRef } from 'react';
import { chartFamily } from '../model/chartTypes';
import type { Chart, DataTable } from '../model/types';
import { ChartSvg, type EditorState } from './ChartSvg';
import { GroupedChartSvg } from './GroupedChartSvg';
import { buildGroupedModel, type GroupedModel } from './groupedModel';
import { buildChartModel, type ChartModel } from './model';
import { buildSurvivalModel } from './survivalModel';
import { XyChartSvg } from './XyChartSvg';
import { buildXyModel, type XyModel } from './xyModel';

/** The model of a chart, tagged with the family that decides how it is drawn and which inspector edits it. */
export type AnyModel =
  | { family: 'category'; model: ChartModel }
  | { family: 'xy' | 'survival'; model: XyModel }
  | { family: 'grouped'; model: GroupedModel };

export function buildAnyModel(chart: Chart, table: DataTable): AnyModel {
  const family = chartFamily(chart.type);
  switch (family) {
    case 'xy':
      return { family, model: buildXyModel(chart, table) };
    case 'survival':
      return { family, model: buildSurvivalModel(chart, table) };
    case 'grouped':
      return { family, model: buildGroupedModel(chart, table) };
    default:
      return { family: 'category', model: buildChartModel(chart, table) };
  }
}

interface CanvasProps {
  chart: Chart;
  any: AnyModel;
  editor?: EditorState;
  cssWidth: string;
  cssHeight: string;
}

/** Draws whichever kind of chart the model is for. */
export const ChartCanvas = forwardRef<SVGSVGElement, CanvasProps>(function ChartCanvas({ chart, any, editor, cssWidth, cssHeight }, ref) {
  const common = { chart, editor, cssWidth, cssHeight };
  if (any.family === 'category') return <ChartSvg ref={ref} model={any.model} {...common} />;
  if (any.family === 'grouped') return <GroupedChartSvg ref={ref} model={any.model} {...common} />;
  return <XyChartSvg ref={ref} model={any.model} {...common} />;
});
