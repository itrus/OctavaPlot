import type { ReactNode } from 'react';
import { galleryItems } from '../../../model/graph/chartGallery';
import { chartTypesFor } from '../../../model/graph/chartTypes';
import { dataLayer } from '../../../model/graph/style';
import type { Chart, ChartType, DataTable } from '../../../model/types';
import { useCommands } from '../../../state/AppContext';
import { composeCommands, patchStyle, patchSummary, setChartType, type Command } from '../../../state/commands';
import { GallerySketch, TypeSketch } from '../../dialogs/GallerySketches';

/** One thumbnail of the Type tab: a chart type, or a look of one that the New Graph gallery offers as a graph of its own. */
interface Choice {
  id: string;
  type: ChartType;
  label: string;
  description: string;
  sketch: ReactNode;
  /** Whether the graph is this one now. */
  on: boolean;
  /** What choosing it changes (nothing when it is already chosen). */
  change: Command[];
}

/** Grouped bars drawn as dots only (the bars are off, the values are dots, a line marks the mean of each cell): "Interleaved scatter" in the gallery, and the default of a new grouped graph. */
const DOTS_ONLY = (id: string): Command[] => [patchStyle(id, 'all', { showBars: false, showSymbols: true, showMeanLine: true }), patchSummary(id, 'all', { spread: 'none' })];
/** … and back to bars with error bars. */
const BARS = (id: string): Command[] => [patchStyle(id, 'all', { showBars: true, showSymbols: false, showMeanLine: false }), patchSummary(id, 'all', { spread: 'sd' })];

/** The thumbnails the Type tab shows for a graph: the chart types of its table, with the gallery's dots-only look beside the bars it is made from, so that what a new graph starts as is among them. */
function choicesFor(chart: Chart, table: DataTable): Choice[] {
  const dotsOnly = chart.type === 'groupedBar' && !dataLayer(chart).style.showBars;
  const scatter = galleryItems('grouped').find((i) => i.id === 'grp.scatterI');
  const out: Choice[] = [];
  for (const t of chartTypesFor(table.kind)) {
    const same = t.type === chart.type;
    if (t.type === 'groupedBar' && scatter) {
      out.push({ id: t.type, type: t.type, label: t.label, description: t.description, sketch: <TypeSketch type={t.type} />, on: same && !dotsOnly, change: same ? BARS(chart.id) : [setChartType(chart.id, t.type)] });
      out.push({ id: scatter.id, type: t.type, label: scatter.label, description: scatter.description, sketch: <GallerySketch item={scatter} />, on: same && dotsOnly, change: [...(same ? [] : [setChartType(chart.id, t.type)]), ...DOTS_ONLY(chart.id)] });
    } else {
      out.push({ id: t.type, type: t.type, label: t.label, description: t.description, sketch: <TypeSketch type={t.type} />, on: same, change: same ? [] : [setChartType(chart.id, t.type)] });
    }
  }
  return out;
}

/** The first tab of the Graph page: the types the table can be drawn as, each with its drawing; choosing one changes the type of this graph. */
export function ChartTypePicker({ chart, table }: { chart: Chart; table: DataTable }) {
  const { run, setStatus } = useCommands();
  return (
    <div className="chart-type-grid" role="radiogroup" aria-label="Graph type">
      {choicesFor(chart, table).map((c) => (
        <button
          key={c.id}
          role="radio"
          aria-checked={c.on}
          className={`gallery-item${c.on ? ' selected' : ''}`}
          title={c.description}
          onClick={() => {
            if (c.on || c.change.length === 0) return;
            run('Change graph type', composeCommands(...c.change));
            setStatus(`Graph type: ${c.label}.`);
          }}
        >
          {c.sketch}
          <span className="gallery-caption">{c.label}</span>
        </button>
      ))}
    </div>
  );
}
