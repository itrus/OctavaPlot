import { fitCountLine, fitLines, fitParametersText } from '../../../chart/xy/fitCurve';
import type { XyModel } from '../../../chart/xy/xyModel';
import { analysesOf } from '../../../model/project/analysis';
import { newId } from '../../../model/ids';
import type { Chart, ChartFit, DataTable } from '../../../model/types';
import { fitModelById } from '../../../stats/fit';
import { useApp } from '../../../state/AppContext';
import { addAnalysis, addAnnotation, composeCommands, patchLook } from '../../../state/commands';
import { Check, Field, GroupBox, SelectInput } from '../common/controls';

/**
 * The fitted curve of an XY chart (spec 17). The model and its confidence level belong to a curve fit of the Results;
 * the chart picks one and chooses how the curve is drawn.
 */
export function FitSection({ chart, table, model }: { chart: Chart; table: DataTable; model: XyModel }) {
  const { project, run, setView, setSelection } = useApp();
  const f = chart.fit;
  const fits = analysesOf(project).filter((a) => a.kind === 'curvefit' && a.dataTableId === table.id);
  const chosen = fits.find((a) => a.id === f.analysisId);
  const on = !!chosen;
  const set = (label: string, patch: Partial<ChartFit>) => run(label, patchLook(chart.id, { fit: { ...f, ...patch } }));
  // A new curve fit of this table, drawn by this chart; its model is chosen in the Results.
  const create = () => {
    const id = newId('analysis');
    run('New curve fit', composeCommands(addAnalysis(id, table.id, 'curvefit'), patchLook(chart.id, { fit: { ...f, analysisId: id, band: f.band === 'none' ? 'confidence' : f.band } })));
  };
  const fitted = model.series.filter((s) => s.fit);
  // The parameters as an ordinary text annotation, top left in the plot where the automatic text goes: editable like any other.
  const pasteText = () => {
    const id = newId('ann');
    const { plot } = model.layout;
    run('Paste fit parameters as text', addAnnotation(chart.id, { id, text: fitParametersText(fitted, model.fit.level), xFrac: (plot.x + 16) / model.widthPt, yFrac: (plot.y + 8) / model.heightPt, fontSizePt: Number((chart.yAxis.tickFontSizePt * 0.7).toFixed(1)), color: chart.textColor, opacity: 1 }));
    setSelection({ kind: 'annotation', annotationId: id });
  };
  return (
    <GroupBox title="Fitted curve">
      <Field label="Curve fit" hint="The model is chosen in the curve fit of the Results; each data set is fitted on its own, using every replicate value">
        <SelectInput<string>
          value={chosen?.id ?? ''}
          options={[{ value: '', label: 'None' }, ...fits.map((a) => ({ value: a.id, label: a.name }))]}
          onChange={(v) => set('Fitted curve', { analysisId: v === '' ? null : v })}
        />
      </Field>
      <div className="row-buttons">
        <button onClick={create} title="Add a curve fit of this table to the Results and draw it here">New curve fit</button>
        {chosen && <button onClick={() => setView({ kind: 'analysis', id: chosen.id })} title="Open the results to change the model or see the numbers">Open results</button>}
      </div>
      {on && model.fit.model !== 'none' && <div className="muted small">{fitModelById(model.fit.model).label}: {fitModelById(model.fit.model).formula}</div>}
      <Field label="Band">
        <SelectInput<ChartFit['band']>
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
            {s.fit?.pending && <div className="muted">Fitting…</div>}
            {s.fit?.failure && <div className="muted">No curve: {s.fit.failure}</div>}
            {s.fit?.summary && (
              <>
                {fitLines(s.fit.summary, model.fit.level).map((l) => (
                  <div key={l}>{l}</div>
                ))}
                <div className="muted">{fitCountLine(s.fit.summary)}</div>
              </>
            )}
          </div>
        ))}
      {on && fitted.some((s) => s.fit?.summary) && (
        <div className="row-buttons">
          <button onClick={pasteText} title="Put the parameters on the graph as text that can be edited, moved and deleted like any annotation">Paste parameters as text</button>
        </div>
      )}
    </GroupBox>
  );
}
