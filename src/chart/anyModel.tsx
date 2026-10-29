import { forwardRef } from 'react';
import { chartFamily } from '../model/graph/chartTypes';
import type { Chart, DataTable, FitSettings } from '../model/types';
import { columnDrawing } from './column/columnDrawing';
import { drawnDotCount } from './column/columnMarks';
import { groupedDrawing } from './grouped/groupedDrawing';
import { heatDrawing } from './heatmap/heatDrawing';
import { pieDrawing } from './pie/pieDrawing';
import { xyDrawing } from './xy/xyDrawing';
import { drawingTexts } from './shared/scene/sceneText';
import { type ChartDrawing, type EditorState, SceneChart } from './shared/scene/SceneChart';
import { buildGroupedModel, type GroupedModel } from './grouped/groupedModel';
import { buildColumnModel, type ColumnModel } from './column/columnModel';
import { buildHeatModel, type HeatModel } from './heatmap/heatmapModel';
import { buildHistogramModel } from './histogram/histogramModel';
import { buildPieModel, type PieModel } from './pie/pieModel';
import { buildSurvivalModel } from './survival/survivalModel';
import { resolveChartTokens } from '../model/graph/resultTokens';
import { annotationNotices, annotationPlacer } from './shared/scene/annotationPlace';
import { visibleAnnotations } from './shared/scene/annotations';
import { referenceLineNotices, referenceLinesOf, regionNotices, regionsOf } from './shared/scene/referenceLines';
import { buildXyModel, type XyModel } from './xy/xyModel';

/**
 * The model of a chart, tagged with the family that decides how it is drawn and which inspector edits it. `shown` is the chart as it is
 * drawn when it holds results in its texts or lines (see model/graph/resultTokens.ts); absent when the chart as written is what is drawn.
 */
export type AnyModel = (
  | { family: 'column'; model: ColumnModel }
  | { family: 'xy' | 'survival' | 'histogram'; model: XyModel }
  | { family: 'grouped'; model: GroupedModel }
  | { family: 'pie'; model: PieModel }
  | { family: 'heatmap'; model: HeatModel }
) & { shown?: Chart };

/**
 * With `deferFits` (the screen) a fit that takes long is made in a worker and the model is built without it, with `fitsPending` above 0,
 * until it is done. Without (export, thumbnails of a layout) every fit is final when the model is built.
 */
export interface BuildOptions {
  deferFits?: boolean;
}

export function buildAnyModel(written: Chart, table: DataTable, fit?: FitSettings, options: BuildOptions = {}): AnyModel {
  // The results written into texts and lines are filled in first: the model and the drawing are made from the chart as it reads then.
  const { chart, notices } = resolveChartTokens(written, table);
  const built = buildAnyModelUnchecked(chart, table, fit, options);
  built.model.warnings.push(...notices);
  if (chart.referenceLines.length > 0) built.model.warnings.push(...referenceLineNotices(referenceLinesOf(chart, built)));
  if (chart.regions.length > 0) built.model.warnings.push(...regionNotices(regionsOf(chart, built).skipped));
  // An annotation anchored to data values that are off the axes (or on a chart with none) is not drawn: say so, as for a reference line.
  if (chart.annotations.some((a) => a.anchor === 'data')) {
    const placer = annotationPlacer(built, built.model.widthPt, built.model.heightPt);
    built.model.warnings.push(...annotationNotices(placer.skipped(visibleAnnotations(chart.annotations, chart.hiddenLayerIds)), placer.supportsData));
  }
  return chart === written ? built : { ...built, shown: chart };
}

function buildAnyModelUnchecked(chart: Chart, table: DataTable, fit: FitSettings | undefined, options: BuildOptions): AnyModel {
  const family = chartFamily(chart.type);
  switch (family) {
    case 'xy':
      return { family, model: buildXyModel(chart, table, fit, options) };
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

/** How many dots the model draws, where the preview may simplify them (see shared/scene/denseDots.ts); 0 for the families that do not. */
export const previewDotCount = (any: AnyModel, chart: Chart): number => (any.family === 'column' ? drawnDotCount(chart, any.model) : 0);

/** How many fits the model waits for (only an XY chart has fits). */
export const fitsPendingOf = (any: AnyModel): number => (any.family === 'xy' ? (any.model.fitsPending ?? 0) : 0);

const modelCache = new WeakMap<Chart, WeakMap<DataTable, Map<string, AnyModel>>>();

/**
 * The same model as buildAnyModel, built once for a chart, a table and a fit setting however many parts of the screen ask:
 * the drawing and the inspector share it. Projects are immutable, so an edit gives new chart or table objects and the old
 * entry is simply never found again (and is collected with them).
 */
export function buildAnyModelCached(chart: Chart, table: DataTable, fit?: FitSettings, options: BuildOptions = {}): AnyModel {
  let byTable = modelCache.get(chart);
  if (!byTable) modelCache.set(chart, (byTable = new WeakMap()));
  let byFit = byTable.get(table);
  if (!byFit) byTable.set(table, (byFit = new Map()));
  const key = (options.deferFits ? 'deferred:' : '') + (fit ? JSON.stringify(fit) : '');
  let model = byFit.get(key);
  if (!model) {
    model = buildAnyModel(chart, table, fit, options);
    // A model waiting for a fit is not kept: it is built again when the fit is done (the fit itself is kept by its identity).
    if (!fitsPendingOf(model)) byFit.set(key, model);
  }
  return model;
}

interface CanvasProps {
  chart: Chart;
  any: AnyModel;
  editor?: EditorState;
  cssWidth: string;
  cssHeight: string;
  /** The screen's drawing, which may be simplified when a graph has very many dots; never set for an export or a picture of a layout. */
  preview?: boolean;
}

/** What a chart is drawn from, by the family of its model. */
export function drawingOf(written: Chart, any: AnyModel, preview = false): ChartDrawing {
  const chart = any.shown ?? written;
  switch (any.family) {
    case 'column':
      return columnDrawing(chart, any.model, preview);
    case 'grouped':
      return groupedDrawing(chart, any.model);
    case 'pie':
      return pieDrawing(chart, any.model);
    case 'heatmap':
      return heatDrawing(chart, any.model);
    default:
      return xyDrawing(chart, any.model);
  }
}

/** Every text the chart writes, for the export report's check of the characters. */
export const chartTexts = (chart: Chart, any: AnyModel): string[] => drawingTexts(drawingOf(chart, any));

/** Draws whichever kind of chart the model is for: one renderer, one drawing for each family. */
export const ChartCanvas = forwardRef<SVGSVGElement, CanvasProps>(function ChartCanvas({ chart, any, editor, cssWidth, cssHeight, preview }, ref) {
  return <SceneChart ref={ref} chart={chart} drawing={drawingOf(chart, any, preview)} editor={editor} cssWidth={cssWidth} cssHeight={cssHeight} />;
});
