import type { Chart } from '../../../model/types';
import { useApp } from '../../../state/AppContext';
import { patchJitter } from '../../../state/commands';
import { SLIDERS } from '../common/sliderRanges';
import { Field, NumField, SelectInput } from '../common/controls';

/** The widest a swarm may be when it is chosen: a swarm of many values needs more room than the jitter of the same values. */
const SWARM_WIDTH = 0.8;

type Placement = 'aligned' | 'jitter' | 'swarm';

/** How the individual values sit sideways in their column: in a line, scattered by chance (the same every time), or as a beeswarm. */
export function DotPlacementControls({ chart, disabled }: { chart: Chart; disabled: boolean }) {
  const { run } = useApp();
  const j = chart.jitter;
  const placement: Placement = !j.enabled ? 'aligned' : j.swarm ? 'swarm' : 'jitter';
  return (
    <>
      <Field label="Dot placement" note={disabled ? 'Turn on the dots to place them.' : null} hint="Aligned: all in a line. Jitter: spread sideways by chance, the same every time. Swarm: spread by their values so that none touches another; the height of a dot is never changed.">
        <SelectInput<Placement>
          value={placement}
          disabled={disabled}
          options={[{ value: 'aligned', label: 'Aligned' }, { value: 'jitter', label: 'Jitter' }, { value: 'swarm', label: 'Swarm' }]}
          onChange={(v) => run('Dot placement', patchJitter(chart.id, { enabled: v !== 'aligned', swarm: v === 'swarm', ...(v === 'swarm' && j.widthFraction < SWARM_WIDTH ? { widthFraction: SWARM_WIDTH } : {}) }))}
        />
      </Field>
      <NumField
        {...SLIDERS.fraction}
        label={placement === 'swarm' ? 'Widest swarm' : 'Jitter width'}
        value={j.widthFraction}
        min={0}
        max={1}
        disabled={disabled || !j.enabled}
        hint={placement === 'swarm' ? 'Fraction of the group slot; a swarm that would be wider is held to it, and its dots then overlap' : 'Fraction of the group slot; never moves values vertically'}
        onCommit={(v) => run('Dot spread width', patchJitter(chart.id, { widthFraction: v }), 'jitter:w')}
      />
    </>
  );
}
