import { VOLCANO_LIMITS } from '../../../model/options/volcanoOptions';
import type { Chart } from '../../../model/types';
import { useApp } from '../../../state/AppContext';
import { patchVolcano } from '../../../state/commands';
import { ColorInput, Field, GroupBox, NumField, SelectInput } from '../common/controls';

/** The settings of a volcano plot: what the Y column holds, the thresholds that make a point up or down, their colours and the labels. */
export function VolcanoControls({ chart, counts }: { chart: Chart; counts: { up: number; down: number; ns: number } | undefined }) {
  const { run } = useApp();
  const v = chart.volcano;
  const set = (label: string, patch: Parameters<typeof patchVolcano>[1], key?: string) => run(label, patchVolcano(chart.id, patch), key);
  return (
    <GroupBox title="Volcano plot">
      <Field label="Y column holds" hint="The p-values, or their −log10 already. The plot shows −log10 p either way, so a smaller p is higher up; a p-value outside 0 to 1 is not drawn.">
        <SelectInput<'p' | 'neglog10'> value={v.yInput} options={[{ value: 'p', label: 'p-values' }, { value: 'neglog10', label: '−log10 p' }]} onChange={(x) => set('Volcano Y column', { yInput: x })} />
      </Field>
      <NumField label="Fold change ≥" hint="Of |X|, with X a log2 fold change: 1 is a doubling or a halving. The two dashed lines are reference lines that follow this value until they are deleted." value={v.fcThreshold} min={VOLCANO_LIMITS.fcThreshold.min} max={VOLCANO_LIMITS.fcThreshold.max} step={0.1} onCommit={(x) => set('Volcano fold threshold', { fcThreshold: x }, 'volcano:fc')} />
      <NumField label="p <" hint="Points need a p-value below this to count as up or down. The dashed line across is a reference line that follows it until it is deleted." value={v.pThreshold} min={VOLCANO_LIMITS.pThreshold.min} max={VOLCANO_LIMITS.pThreshold.max} step={0.01} onCommit={(x) => set('Volcano p threshold', { pThreshold: x }, 'volcano:p')} />
      <Field label="Up">
        <ColorInput value={v.upColor} onChange={(x) => set('Volcano up colour', { upColor: x })} />
      </Field>
      <Field label="Down">
        <ColorInput value={v.downColor} onChange={(x) => set('Volcano down colour', { downColor: x })} />
      </Field>
      <Field label="Not significant">
        <ColorInput value={v.nsColor} onChange={(x) => set('Volcano other colour', { nsColor: x })} />
      </Field>
      <Field label="Labels" hint="Write the title of the row (a gene name, say) beside the up and down points. Labels that would overlap are moved apart.">
        <SelectInput<'none' | 'significant'> value={v.labels} options={[{ value: 'none', label: 'None' }, { value: 'significant', label: 'Up, down' }]} onChange={(x) => set('Volcano labels', { labels: x })} />
      </Field>
      {counts && <div className="muted small">{`${counts.up} up, ${counts.down} down, ${counts.ns} not significant`}</div>}
    </GroupBox>
  );
}
