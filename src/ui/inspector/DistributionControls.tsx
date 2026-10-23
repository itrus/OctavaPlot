import { DISTRIBUTION_LIMITS } from '../../model/distributionOptions';
import type { Chart, DistributionPoints, SmoothingLevel, ViolinNormalisationKind, WhiskerRuleKind } from '../../model/types';
import { useApp } from '../../state/AppContext';
import { patchDistribution } from '../../state/commands';
import { WHISKER_RULES } from '../../stats/distribution';
import { Check, ColorInput, Field, GroupBox, NumField, OptionalNumField, SelectInput } from './controls';

const SMOOTHING: Array<{ value: SmoothingLevel; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'medium', label: 'Medium' },
  { value: 'heavy', label: 'Heavy' },
];

const NORMALISATION: Array<{ value: ViolinNormalisationKind; label: string }> = [
  { value: 'width', label: 'Equal maximum width' },
  { value: 'area', label: 'Equal area' },
  { value: 'count', label: 'Scaled by sample size' },
];

/** The settings of a box plot or a violin that are shared by all data sets (spec 10). */
export function DistributionControls({ chart, lineColor, lineWidthPt, onLine }: { chart: Chart; lineColor: string; lineWidthPt: number; onLine: (patch: { lineColor?: string; lineWidthPt?: number }) => void }) {
  const { run } = useApp();
  const d = chart.distribution;
  const set = (label: string, patch: Partial<Chart['distribution']>, key?: string) => run(label, patchDistribution(chart.id, patch), key);
  const box = chart.type === 'box';
  const floating = chart.type === 'floating';
  const w = DISTRIBUTION_LIMITS.width;
  const pointOptions: Array<{ value: DistributionPoints; label: string }> = box
    ? [
        { value: 'none', label: 'None' },
        { value: 'outside', label: 'Outside the whiskers' },
        { value: 'all', label: 'All values' },
      ]
    : [
        { value: 'none', label: 'None' },
        { value: 'all', label: 'All values' },
      ];
  return (
    <GroupBox title={box ? 'Box and whiskers' : floating ? 'Floating bars' : 'Violin'}>
      {floating ? null : box ? (
        <>
          <Field label="Whiskers" hint="Where the whiskers end; the box is always the quartiles (type 6)">
            <SelectInput<WhiskerRuleKind> value={d.whisker} options={WHISKER_RULES.map((r) => ({ value: r.value, label: r.label }))} onChange={(v) => set('Whisker rule', { whisker: v })} />
          </Field>
          {d.whisker === 'tukey' && (
            <NumField label="Tukey multiplier" value={d.tukeyK} min={DISTRIBUTION_LIMITS.tukeyK.min} max={DISTRIBUTION_LIMITS.tukeyK.max} onCommit={(v) => set('Tukey multiplier', { tukeyK: v }, 'dist:k')} />
          )}
          <NumField label="Box width" hint="Fraction of the space of a column" value={d.boxWidth} min={w.min} max={w.max} onCommit={(v) => set('Box width', { boxWidth: v }, 'dist:bw')} />
        </>
      ) : (
        <>
          <Field label="Smoothing">
            <SelectInput<SmoothingLevel> value={d.smoothing} options={SMOOTHING} onChange={(v) => set('Violin smoothing', { smoothing: v })} />
          </Field>
          <OptionalNumField
            label="Bandwidth"
            hint="In data units; Auto follows the smoothing level"
            value={d.bandwidth}
            autoValue={1}
            validate={(v) => (v > 0 ? null : 'Must be greater than 0.')}
            onCommit={(v) => set('Violin bandwidth', { bandwidth: v }, 'dist:bandwidth')}
          />
          <Field label="Ends" hint="Cut the violin at the smallest and largest value, or follow the tails of the density">
            <SelectInput<'sample' | 'tails'>
              value={d.trim}
              options={[
                { value: 'sample', label: 'At the smallest and largest value' },
                { value: 'tails', label: 'Follow the tails' },
              ]}
              onChange={(v) => set('Violin ends', { trim: v })}
            />
          </Field>
          <Field label="Width scale" hint="How the widths of different violins compare">
            <SelectInput<ViolinNormalisationKind> value={d.normalisation} options={NORMALISATION} onChange={(v) => set('Violin width scale', { normalisation: v })} />
          </Field>
          <NumField label="Violin width" hint="Fraction of the space of a column" value={d.violinWidth} min={w.min} max={w.max} onCommit={(v) => set('Violin width', { violinWidth: v }, 'dist:vw')} />
          <Field label="Quartile lines">
            <Check checked={d.showQuartiles} onChange={(v) => set('Quartile lines', { showQuartiles: v })} />
          </Field>
        </>
      )}
      <Field label="Line colour" hint="Whiskers, median and quartile lines">
        <ColorInput value={lineColor} ariaLabel="Line colour" onChange={(v) => onLine({ lineColor: v })} />
      </Field>
      <NumField label="Line thickness" unit="pt" value={lineWidthPt} min={0.1} max={20} onCommit={(v) => onLine({ lineWidthPt: v })} />
      <Field label={floating ? 'Line at the centre' : 'Median line'}>
        <Check checked={d.showMedian} onChange={(v) => set(floating ? 'Centre line' : 'Median line', { showMedian: v })} />
      </Field>
      {box && (
        <Field label="Mean marker" hint="A plus sign at the mean, in the symbol colour">
          <Check checked={d.showMean} onChange={(v) => set('Mean marker', { showMean: v })} />
        </Field>
      )}
      <Field label="Show values" hint="Which values are drawn as dots (the Points box below switches the dots on)">
        <SelectInput<DistributionPoints> value={d.points} options={pointOptions} onChange={(v) => set('Points on the plot', { points: v })} />
      </Field>
    </GroupBox>
  );
}
