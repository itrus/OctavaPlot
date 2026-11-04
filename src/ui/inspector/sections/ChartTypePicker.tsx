import { chartTypesFor } from '../../../model/graph/chartTypes';
import type { Chart, DataTable } from '../../../model/types';
import { useApp } from '../../../state/AppContext';
import { setChartType } from '../../../state/commands';
import { ChartSketch } from '../../dialogs/NewItemDialogs';

/** The first tab of the Graph page: the types the table can be drawn as, each with its drawing; choosing one changes the type of this graph. */
export function ChartTypePicker({ chart, table }: { chart: Chart; table: DataTable }) {
  const { run, setStatus } = useApp();
  return (
    <div className="chart-type-grid" role="radiogroup" aria-label="Graph type">
      {chartTypesFor(table.kind).map((t) => (
        <button
          key={t.type}
          role="radio"
          aria-checked={t.type === chart.type}
          className={`gallery-item${t.type === chart.type ? ' selected' : ''}`}
          title={t.description}
          onClick={() => {
            if (t.type === chart.type) return;
            run('Change graph type', setChartType(chart.id, t.type));
            setStatus(`Graph type: ${t.label}.`);
          }}
        >
          <ChartSketch type={t.type} />
          <span className="gallery-caption">{t.label}</span>
        </button>
      ))}
    </div>
  );
}
