import type { Chart, DataTable } from '../../model/types';
import { HeatmapInspector } from './HeatmapInspector';
import { HistogramInspector } from './HistogramInspector';
import { PieInspector } from './PieInspector';
import { ColumnInspector } from './ColumnInspector';
import { XyInspector } from './XyInspector';
import { chartFamily } from '../../model/graph/chartTypes';


/** The formatting panel: the one of the family of the chart (see the files beside this one). */
export function Inspector({ chart, table }: { chart: Chart; table: DataTable }) {
  const family = chartFamily(chart.type);
  const panel =
    family === 'pie' ? <PieInspector chart={chart} table={table} />
    : family === 'histogram' ? <HistogramInspector chart={chart} table={table} />
    : family === 'heatmap' ? <HeatmapInspector chart={chart} table={table} />
    : family === 'column' ? <ColumnInspector chart={chart} table={table} />
    : <XyInspector chart={chart} table={table} />;
  return (
    <div className="inspector-host">
      {panel}
    </div>
  );
}

