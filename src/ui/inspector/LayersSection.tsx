import { displayName } from '../../chart/model';
import { layerRows } from '../../model/layers';
import type { Chart, DataTable } from '../../model/types';
import { useApp } from '../../state/AppContext';
import { setLayerHidden } from '../../state/commands';
import { Check, Field, Section } from './controls';

/** The parts an XY chart is drawn from, topmost first: each can be hidden without changing anything that is calculated. */
export function LayersSection({ chart, table }: { chart: Chart; table: DataTable }) {
  const { run } = useApp();
  const rows = layerRows(chart, table, (id, fallback) => displayName(chart, id, fallback));
  return (
    <Section title="Layers" defaultOpen={false}>
      {rows.map((r) => (
        <Field key={r.layer.id} label={r.label} hint={r.reason ?? 'Hiding a layer does not change the numbers, the axis range or any calculation'}>
          <Check checked={r.shown} disabled={!r.canToggle} ariaLabel={`Show ${r.label}`} title={r.reason ?? undefined} onChange={(v) => run('Show or hide a layer', setLayerHidden(chart.id, r.layer.id, !v))} />
        </Field>
      ))}
      <div className="muted small">Hidden layers still count: n, error bars and fits are calculated as before, and the axis range is not changed by hiding.</div>
    </Section>
  );
}
