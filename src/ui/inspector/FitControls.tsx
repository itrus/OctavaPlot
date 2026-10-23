import { fitLines } from '../../chart/fitCurve';
import type { XyModel } from '../../chart/xyModel';
import { FIT_LIMITS } from '../../model/fitOptions';
import type { Chart, FitSettings } from '../../model/types';
import { FIT_MODELS, fitModelById } from '../../stats/fit';
import { useApp } from '../../state/AppContext';
import { patchLook } from '../../state/commands';
import { Check, Field, GroupBox, NumField, SelectInput } from './controls';

/** The fitted curve of an XY chart (spec 17): which model, the band around it, and what was found. */
export function FitSection({ chart, model }: { chart: Chart; model: XyModel }) {
  const { run } = useApp();
  const f = chart.fit;
  const on = f.model !== 'none';
  const set = (label: string, patch: Partial<FitSettings>, key?: string) => run(label, patchLook(chart.id, { fit: { ...f, ...patch } }), key);
  const info = f.model === 'none' ? null : fitModelById(f.model);
  const fitted = model.series.filter((s) => s.fit);
  return (
    <GroupBox title="Fitted curve">
      <Field label="Model" hint="Each data set is fitted on its own, using every replicate value">
        <SelectInput<FitSettings['model']>
          value={f.model}
          options={[{ value: 'none', label: 'None' }, ...FIT_MODELS.map((m) => ({ value: m.id, label: m.label }))]}
          onChange={(v) => set('Fitted curve', { model: v })}
        />
      </Field>
      {info && <div className="muted small">{info.formula}{info.positiveX ? ' X must be above 0.' : ''}</div>}
      {f.model === 'polynomial' && <NumField label="Degree" value={f.degree} min={FIT_LIMITS.degree.min} max={FIT_LIMITS.degree.max} step={1} slider={false} onCommit={(v) => set('Polynomial degree', { degree: v }, 'fit:degree')} />}
      <Field label="Band">
        <SelectInput<FitSettings['band']>
          value={f.band}
          disabled={!on}
          options={[
            { value: 'none', label: 'None' },
            { value: 'confidence', label: 'Confidence band of the curve' },
            { value: 'prediction', label: 'Prediction band (new values)' },
          ]}
          onChange={(v) => set('Fit band', { band: v })}
        />
      </Field>
      <NumField label="Confidence level" unit="%" value={Number((f.level * 100).toPrecision(6))} min={FIT_LIMITS.level.min * 100} max={FIT_LIMITS.level.max * 100} disabled={!on} slider={false} onCommit={(v) => set('Confidence level', { level: v / 100 }, 'fit:level')} />
      <Field label="Extend over the whole X axis">
        <Check checked={f.extend} disabled={!on} onChange={(v) => set('Extend fitted curve', { extend: v })} />
      </Field>
      <Field label="Write parameters on the graph">
        <Check checked={f.showParameters} disabled={!on} onChange={(v) => set('Fit parameters', { showParameters: v })} />
      </Field>
      {on &&
        fitted.map((s) => (
          <div key={s.groupId} className="small">
            <strong style={{ color: s.style.lineColor }}>{s.label}</strong>
            {s.fit?.failure && <div className="muted">No curve: {s.fit.failure}</div>}
            {s.fit?.summary && (
              <>
                {fitLines(s.fit.summary, f.level).map((l) => (
                  <div key={l}>{l}</div>
                ))}
                <div className="muted">{s.fit.summary.n} points{s.fit.summary.df > 0 ? `, ${s.fit.summary.df} degrees of freedom` : ''}</div>
              </>
            )}
          </div>
        ))}
    </GroupBox>
  );
}
