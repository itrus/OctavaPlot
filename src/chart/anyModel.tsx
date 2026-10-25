import { forwardRef } from 'react';
import { chartFamily } from '../model/graph/chartTypes';
import type { Chart, DataTable, FitSettings } from '../model/types';
import { ColumnChartSvg, type EditorState } from './column/ColumnChartSvg';
import { GroupedChartSvg } from './grouped/GroupedChartSvg';
import { buildGroupedModel, type GroupedModel } from './grouped/groupedModel';
import { buildColumnModel, type ColumnModel } from './column/columnModel';
import { buildHeatModel, type HeatModel } from './heatmap/heatmapModel';
import { HeatmapSvg } from './heatmap/HeatmapSvg';
import { buildHistogramModel } from './histogram/histogramModel';
import { buildPieModel, type PieModel } from './pie/pieModel';
import { PieChartSvg } from './pie/PieChartSvg';
import { buildSurvivalModel } from './survival/survivalModel';
import { XyChartSvg } from './xy/XyChartSvg';
import { referenceLineNotices, referenceLinesOf } from './shared/scene/referenceLines';
import { buildXyModel, type XyModel } from './xy/xyModel';

/** The model of a chart, tagged with the family that decides how it is drawn and which inspector edits it. */
export type AnyModel =
  | { family: 'column'; model: ColumnModel }
  | { family: 'xy' | 'survival' | 'histogram'; model: XyModel }
  | { family: 'grouped'; model: GroupedModel }
  | { family: 'pie'; model: PieModel }
  | { family: 'heatmap'; model: HeatModel };

export function buildAnyModel(chart: Chart, table: DataTable, fit?: FitSettings): AnyModel {
  const built = buildAnyModelUnchecked(chart, table, fit);
  if (chart.referenceLines.length > 0) built.model.warnings.push(...referenceLineNotices(referenceLinesOf(chart, built)));
  return built;
}

function buildAnyModelUnchecked(chart: Chart, table: DataTable, fit?: FitSettings): AnyModel {
  const family = chartFamily(chart.type);
  switch (family) {
    case 'xy':
      return { family, model: buildXyModel(chart, table, fit) };
    case 'survival':
      return { family, model: buildSurvivalModel(chart, table) };
    case 'grouped':
      return { family, model: buildGroupedModel(chart, table) };
    case 'pie':
      return { family, model: buildPieModel(chart, table) };
    case 'histogram':
      return { family, model: buildHistogramModel(chart, table) };
    case 'heatmap':
      return { family, model: buildHeatModel(chart, table) };
    default:
      return { family: 'column', model: buildColumnModel(chart, table) };
  }
}

const modelCache = new WeakMap<Chart, WeakMap<DataTable, Map<string, AnyModel>>>();

/**
 * The same model as buildAnyModel, built once for a chart, a table and a fit setting however many parts of the screen ask:
 * the drawing and the inspector share it. Projects are immutable, so an edit gives new chart or table objects and the old
 * entry is simply never found again (and is collected with them).
 */
export function buildAnyModelCached(chart: Chart, table: DataTable, fit?: FitSettings): AnyModel {
  let byTable = modelCache.get(chart);
  if (!byTable) modelCache.set(chart, (byTable = new WeakMap()));
  let byFit = byTable.get(table);
  if (!byFit) byTable.set(table, (byFit = new Map()));
  const key = fit ? JSON.stringify(fit) : '';
  let model = byFit.get(key);
  if (!model) byFit.set(key, (model = buildAnyModel(chart, table, fit)));
  return model;
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
  if (any.family === 'column') return <ColumnChartSvg ref={ref} model={any.model} {...common} />;
  if (any.family === 'grouped') return <GroupedChartSvg ref={ref} model={any.model} {...common} />;
  if (any.family === 'pie') return <PieChartSvg ref={ref} model={any.model} {...common} />;
  if (any.family === 'heatmap') return <HeatmapSvg ref={ref} model={any.model} {...common} />;
  return <XyChartSvg ref={ref} model={any.model} {...common} />;
});
