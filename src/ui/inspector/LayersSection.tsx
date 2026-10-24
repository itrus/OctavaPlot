import { Fragment } from 'react';
import { displayName } from '../../chart/model';
import { layerLook, layerRows, STYLABLE_LAYERS } from '../../model/layers';
import { LINE_STYLES } from '../../model/look';
import { resolveStyle } from '../../model/style';
import { xySeries } from '../../model/tableLayout';
import type { Chart, DataTable, LayerStyle, LineStyle } from '../../model/types';
import { useApp } from '../../state/AppContext';
import { patchLayerStyle, setLayerHidden } from '../../state/commands';
import { Check, ColorInput, Field, NumField, Section, SelectInput } from './controls';

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
        const takes = STYLABLE_LAYERS[r.layer.kind];
        const owner = series.findIndex((s) => s.id === r.layer.binding?.seriesId);
        const base = takes && owner >= 0 ? resolveStyle(chart, chart.layers[0], { id: series[owner].id, paletteIndex: series[owner].columns[0].seriesSlot ?? owner }) : null;
        const look = base ? layerLook(chart, r.layer.id, base) : null;
        const own = chart.layerStyles[r.layer.id] ?? {};
        const set = (patch: Parameters<typeof patchLayerStyle>[2], key: string) => run('Change layer style', patchLayerStyle(chart.id, r.layer.id, patch), `layer:${r.layer.id}:${key}`);
        return (
          <Fragment key={r.layer.id}>
            <Field label={r.label} hint={r.reason ?? 'Hiding a layer does not change the numbers, the axis range or any calculation'}>
              <Check checked={r.shown} disabled={!r.canToggle} ariaLabel={`Show ${r.label}`} title={r.reason ?? undefined} onChange={(v) => run('Show or hide a layer', setLayerHidden(chart.id, r.layer.id, !v))} />
            </Field>
            {look && takes && (
              <div className="annotation-card">
                {takes.includes('color') && (
                  <Field label="Colour" overridden={own.color !== undefined}>
                    <ColorInput value={look.color} onChange={(v) => set({ color: v }, 'color')} />
                  </Field>
                )}
                {takes.includes('widthPt') && <NumField label="Thickness" unit="pt" value={look.widthPt} min={0.2} max={40} overridden={own.widthPt !== undefined} onCommit={(v) => set({ widthPt: v }, 'width')} />}
                {takes.includes('lineStyle') && (
                  <Field label="Pattern" overridden={own.lineStyle !== undefined}>
                    <SelectInput<LineStyle> value={look.lineStyle} options={LINE_STYLES.map((o) => ({ value: o.value, label: o.label }))} onChange={(v) => set({ lineStyle: v }, 'pattern')} />
                  </Field>
                )}
                {takes.includes('opacity') && <NumField label="Opacity" unit="%" value={Number((look.opacity * 100).toPrecision(4))} min={0} max={100} overridden={own.opacity !== undefined} onCommit={(v) => set({ opacity: v / 100 }, 'opacity')} />}
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
      <div className="muted small">Hidden layers still count: n, error bars and fits are calculated as before, and the axis range is not changed by hiding.</div>
    </Section>
  );
}
