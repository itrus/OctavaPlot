import { Fragment } from 'react';
import { layerEditLook, layerRows } from '../../../model/graph/layers';
import { SYMBOL_SHAPE_OPTIONS } from '../../../chart/shared/parts/symbols';
import { LINE_STYLES } from '../../../model/graph/look';
import { resolveStyle, dataLayer } from '../../../model/graph/style';
import { xySeries } from '../../../model/table/tableLayout';
import type { Chart, DataTable, LayerStyle, LineStyle } from '../../../model/types';
import { useApp } from '../../../state/AppContext';
import { moveLayer, patchLayerStyle, resetLayerOrder, setLayerHidden, setLayerRange } from '../../../state/commands';
import { Check, ColorInput, Field, NumField, Section, SelectInput } from '../common/controls';
import { displayName } from '../../../chart/shared/parts/names';

/**
 * The parts an XY chart is drawn from (data, reference lines and annotations), topmost first: each can be hidden without
 * changing anything that is calculated, and the fit curve and the fit band can be given a look of their own.
 */
export function LayersSection({ chart, table }: { chart: Chart; table: DataTable }) {
  const { run } = useApp();
  const rows = layerRows(chart, table, (id, fallback) => displayName(chart, id, fallback));
  const series = xySeries(table);
  return (
    <Section title="Layers" defaultOpen={false}>
      {rows.map((r) => {
        const takes = r.takes;
        const owner = series.findIndex((s) => s.id === r.layer.binding?.seriesId);
        const base = takes && owner >= 0 ? resolveStyle(chart, dataLayer(chart), { id: series[owner].id, paletteIndex: series[owner].columns[0].seriesSlot ?? owner }) : null;
        const look = base ? layerEditLook(chart, r.layer.id, base) : null;
        const points = r.layer.kind === 'points' || r.layer.kind === 'rawPoints';
        const own = chart.layerStyles[r.layer.id] ?? {};
        const set = (patch: Parameters<typeof patchLayerStyle>[2], key: string) => run('Change layer style', patchLayerStyle(chart.id, r.layer.id, patch), `layer:${r.layer.id}:${key}`);
        return (
          <Fragment key={r.layer.id}>
            <Field label={r.label} hint={r.reason ?? 'Hiding a layer does not change the numbers, the axis range or any calculation'}>
              <Check checked={r.shown} disabled={!r.canToggle} ariaLabel={`Show ${r.label}`} title={r.reason ?? undefined} onChange={(v) => run('Show or hide a layer', setLayerHidden(chart.id, r.layer.id, !v))} />
              <button className="small-btn" disabled={!r.canMoveUp} aria-label={`Move ${r.label} up`} title="Draw it over the layer above" onClick={() => run('Move a layer', moveLayer(chart.id, r.layer.id, 1))}>▲</button>
              <button className="small-btn" disabled={!r.canMoveDown} aria-label={`Move ${r.label} down`} title="Draw it under the layer below" onClick={() => run('Move a layer', moveLayer(chart.id, r.layer.id, -1))}>▼</button>
            </Field>
            {r.inRange !== null && (
              <Field label="In the axis range" hint="Off: the axis is not stretched to hold this layer's values (the layer is still drawn and nothing is recalculated)">
                <Check checked={r.inRange} ariaLabel={`Fit the axis to ${r.label}`} onChange={(v) => run('Axis range and a layer', setLayerRange(chart.id, r.layer.id, v))} />
              </Field>
            )}
            {look && takes && (
              <div className="annotation-card">
                {takes.includes('color') && (
                  <Field label="Colour" overridden={own.color !== undefined}>
                    <ColorInput value={look.color} onChange={(v) => set({ color: v }, 'color')} />
                  </Field>
                )}
                {takes.includes('shape') && (
                  <Field label="Symbol" overridden={own.shape !== undefined}>
                    <SelectInput value={look.shape ?? 'circle'} options={[...SYMBOL_SHAPE_OPTIONS]} onChange={(v) => set({ shape: v }, 'shape')} />
                  </Field>
                )}
                {takes.includes('widthPt') && <NumField label={points ? 'Border thickness' : 'Thickness'} unit="pt" value={look.widthPt} min={points ? 0 : 0.2} max={40} overridden={own.widthPt !== undefined} onCommit={(v) => set({ widthPt: v }, 'width')} />}
                {takes.includes('lineStyle') && (
                  <Field label="Pattern" overridden={own.lineStyle !== undefined}>
                    <SelectInput<LineStyle> value={look.lineStyle} options={LINE_STYLES.map((o) => ({ value: o.value, label: o.label }))} onChange={(v) => set({ lineStyle: v }, 'pattern')} />
                  </Field>
                )}
                {takes.includes('opacity') && <NumField label={points ? 'Fill opacity' : 'Opacity'} unit="%" value={Number((look.opacity * 100).toPrecision(4))} min={0} max={100} overridden={own.opacity !== undefined} onCommit={(v) => set({ opacity: v / 100 }, 'opacity')} />}
                <div className="button-row">
                  <button disabled={Object.keys(own).length === 0} onClick={() => run('Reset layer style', patchLayerStyle(chart.id, r.layer.id, Object.fromEntries(takes.map((k) => [k, null])) as { [K in keyof LayerStyle]?: null }))}>
                    Use the series' look
                  </button>
                </div>
              </div>
            )}
          </Fragment>
        );
      })}
      {chart.layerOrder.length > 0 && (
        <div className="button-row">
          <button onClick={() => run('Default order of the layers', resetLayerOrder(chart.id))}>Use the order of the graph type</button>
        </div>
      )}
      <div className="muted small">Hidden layers still count: n, error bars and fits are calculated as before, and the axis range is not changed by hiding.</div>
    </Section>
  );
}
