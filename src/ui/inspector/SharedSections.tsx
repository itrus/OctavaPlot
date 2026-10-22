import { useMemo, useState } from 'react';
import { displayName } from '../../chart/model';
import { applyAspect, resizeChart } from '../../model/aspect';
import { graphSources, type GraphSource } from '../../model/chartTable';
import { CHART_PX_MAX, CHART_PX_MIN } from '../../model/defaults';
import { newId } from '../../model/ids';
import { COMPARED_COLOURS, DEFICIENCIES, MIN_DELTA_E, visionReport } from '../../model/colorVision';
import { GGSCI_CITATION, PALETTE_GROUPS, PALETTE_GROUP_INFO, paletteById, palettesInGroup } from '../../model/palettes';
import type { Chart, Group, Id } from '../../model/types';
import { useApp } from '../../state/AppContext';
import {
  addAnnotation,
  composeCommands,
  patchAnnotation,
  patchAxis,
  patchBothAxes,
  patchChart,
  patchLegend,
  removeAnnotation,
  setDisplayName,
  setGroupOnGraph,
  setLegendItemVisible,
} from '../../state/commands';
import { Check, ColorInput, Field, NumField, Section, SelectInput, SubHeading, TextInput } from './controls';

/**
 * Inspector pieces that do not depend on the kind of chart: titles and fonts, size and shape, legend, annotations and
 * the list of data sets on the graph. Both the category and the XY inspector use them.
 */

/** Edit a chart property as one undoable step (`key` merges rapid edits). */
export function useChartSetter(chart: Chart) {
  const { run } = useApp();
  return (label: string, patch: Partial<Chart>, key?: string) => run(label, patchChart(chart.id, patch), key);
}

export function TextSections({ chart, groups, yName, dual }: { chart: Chart; groups: Group[]; yName: string; dual: boolean }) {
  const { run } = useApp();
  const setChart = useChartSetter(chart);
  return (
    <div>
      <Section title="Titles">
        <Field label="Show chart title">
          <Check checked={chart.showTitle} onChange={(v) => setChart('Show chart title', { showTitle: v })} />
        </Field>
        <Field label="Chart title">
          <TextInput value={chart.title} disabled={!chart.showTitle} onChange={(v) => setChart('Chart title', { title: v }, 'chart:title')} />
        </Field>
        <NumField label="Title size" unit="pt" value={chart.titleFontSizePt} min={4} max={72} disabled={!chart.showTitle} onCommit={(v) => setChart('Title size', { titleFontSizePt: v }, 'chart:titlesize')} />
        <Field label="X axis title">
          <TextInput value={chart.xAxis.title} onChange={(v) => run('X axis title', patchAxis(chart.id, 'xAxis', { title: v }), 'axis:xt')} />
        </Field>
        <Field label={`${yName} axis title`}>
          <TextInput value={chart.yAxis.title} onChange={(v) => run('Y axis title', patchAxis(chart.id, 'yAxis', { title: v }), 'axis:yt')} />
        </Field>
      </Section>
      <Section title="Font sizes">
        <NumField label="Tick label size" unit="pt" value={chart.yAxis.tickFontSizePt} min={4} max={48} onCommit={(v) => run('Tick label size', patchBothAxes(chart.id, { tickFontSizePt: v }), 'axis:tfs')} />
        <NumField label="Axis title size" unit="pt" value={chart.yAxis.titleFontSizePt} min={4} max={48} onCommit={(v) => run('Axis title size', patchBothAxes(chart.id, { titleFontSizePt: v }), 'axis:afs')} />
        {dual && <div className="muted small">Font sizes apply to both Y axes.</div>}
      </Section>
      <Section title="Display names">
        {groups.map((g) => (
          <Field key={g.id} label={g.name}>
            <TextInput value={chart.displayNames[g.id] ?? ''} placeholder={g.name} onChange={(v) => run('Display name', setDisplayName(chart.id, g.id, v), `dn:${g.id}`)} />
          </Field>
        ))}
        <div className="muted small">Display names are used by the legend and labels. Empty = data name.</div>
      </Section>
    </div>
  );
}

export function DimensionsSection({ chart }: { chart: Chart }) {
  const setChart = useChartSetter(chart);
  return (
    <div className="tab-body">
      <Field label="Shape" hint="Free keeps width and height independent; 4:3 and Square move one when you change the other">
        <span className="switch-group" role="group" aria-label="Chart shape">
          {(
            [
              ['free', 'Free'],
              ['4:3', '4:3'],
              ['1:1', 'Square'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              className={`switch${chart.aspect === value ? ' on' : ''}`}
              aria-pressed={chart.aspect === value}
              onClick={() => setChart(`Chart shape ${label}`, { aspect: value, ...applyAspect(chart, value) })}
            >
              {label}
            </button>
          ))}
        </span>
      </Field>
      <NumField label="Chart width" unit="px" value={chart.widthPx} min={CHART_PX_MIN} max={CHART_PX_MAX} onCommit={(v) => setChart('Chart width', resizeChart(chart, chart.aspect, 'width', v), 'chart:w')} />
      <NumField label="Chart height" unit="px" value={chart.heightPx} min={CHART_PX_MIN} max={CHART_PX_MAX} onCommit={(v) => setChart('Chart height', resizeChart(chart, chart.aspect, 'height', v), 'chart:h')} />
      <div className="muted small">Sizes are in pixels. The default for new charts is set in Settings.</div>
    </div>
  );
}

export function LegendSection({ chart, groups }: { chart: Chart; groups: Group[] }) {
  const { run } = useApp();
  return (
    <div>
      <Section title="Legend">
        <Field label="Show legend">
          <Check checked={chart.legend.visible} onChange={(v) => run('Show legend', patchLegend(chart.id, { visible: v }))} />
        </Field>
        <Field label="Position">
          <SelectInput
            value={chart.legend.position}
            disabled={!chart.legend.visible}
            options={[
              { value: 'right', label: 'Right' },
              { value: 'bottom', label: 'Bottom' },
              { value: 'top', label: 'Top' },
            ]}
            onChange={(v) => run('Legend position', patchLegend(chart.id, { position: v }))}
          />
        </Field>
        <SubHeading>Data sets in legend</SubHeading>
        {groups.map((g) => (
          <Field key={g.id} label={displayName(chart, g.id, g.name)}>
            <Check
              checked={!chart.legend.hiddenGroupIds.includes(g.id)}
              disabled={!chart.legend.visible}
              ariaLabel={`Show ${displayName(chart, g.id, g.name)} in legend`}
              onChange={(v) => run('Legend item', setLegendItemVisible(chart.id, g.id, v))}
            />
          </Field>
        ))}
      </Section>
    </div>
  );
}

export function AnnotationsTab({ chart }: { chart: Chart }) {
  const { run, selection, setSelection } = useApp();
  return (
    <div className="tab-body">
      <div className="button-row">
        <button
          onClick={() => {
            const id = newId('ann');
            run('Add annotation', addAnnotation(chart.id, { id, text: 'Text', xFrac: 0.4, yFrac: 0.08, fontSizePt: 14, color: '#000000' }));
            setSelection({ kind: 'annotation', annotationId: id });
          }}
        >
          + Add text annotation
        </button>
      </div>
      {chart.annotations.length === 0 && <div className="muted small">No annotations. Added text can be dragged within the chart.</div>}
      {chart.annotations.map((a) => {
        const isSel = selection.kind === 'annotation' && selection.annotationId === a.id;
        return (
          <div key={a.id} className={`annotation-card${isSel ? ' selected' : ''}`}>
            <button className="list-item" onClick={() => setSelection({ kind: 'annotation', annotationId: a.id })}>
              {a.text.split('\n')[0] || '(empty)'}
            </button>
            {isSel && (
              <>
                <Field label="Text">
                  <textarea rows={2} value={a.text} onChange={(e) => run('Edit annotation text', patchAnnotation(chart.id, a.id, { text: e.target.value }), `ann:${a.id}:text`)} />
                </Field>
                <NumField label="Size" unit="pt" value={a.fontSizePt} min={4} max={96} onCommit={(v) => run('Annotation size', patchAnnotation(chart.id, a.id, { fontSizePt: v }), `ann:${a.id}:size`)} />
                <Field label="Colour">
                  <ColorInput value={a.color} onChange={(v) => run('Annotation colour', patchAnnotation(chart.id, a.id, { color: v }), `ann:${a.id}:color`)} />
                </Field>
                <div className="button-row">
                  <button
                    onClick={() => {
                      run('Delete annotation', removeAnnotation(chart.id, a.id));
                      setSelection({ kind: 'chart' });
                    }}
                  >
                    Delete annotation
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Check boxes to put data sets on the graph or take them off, grouped by table. */
export function OnThisGraph({ chart }: { chart: Chart }) {
  const { project, run } = useApp();
  const tablesWithSources = useMemo(() => {
    const byTable = new Map<Id, [Id, string, GraphSource[]]>();
    for (const s of graphSources(project, chart)) {
      if (!byTable.has(s.tableId)) byTable.set(s.tableId, [s.tableId, s.tableName, []]);
      byTable.get(s.tableId)![2].push(s);
    }
    return [...byTable.values()];
  }, [project, chart]);
  const setMany = (sources: GraphSource[], on: boolean) =>
    run(on ? 'Show all data sets' : 'Hide all data sets', composeCommands(...sources.map((s) => setGroupOnGraph(chart.id, s.tableId, s.group.id, on))));
  // Data sets of other tables can be added to column-table graphs only; an XY graph plots its own table's series.
  const ownKind = project.dataTables.find((x) => x.id === chart.dataTableId)?.kind;
  const multi = project.dataTables.some((t) => t.id !== chart.dataTableId && t.kind === ownKind);
  return (
    <>
      <SubHeading>On this graph</SubHeading>
      {tablesWithSources.map(([tableId, tableName, sources]) => (
        <div key={tableId} className="source-table">
          <div className="source-table-head">
            <strong>{tableName}</strong>
            {tableId === chart.dataTableId && <span className="muted small"> (graph's table)</span>}
            <span className="source-actions">
              <button className="small-btn" onClick={() => setMany(sources, true)}>All on</button>
              <button className="small-btn" onClick={() => setMany(sources, false)}>All off</button>
            </span>
          </div>
          {sources.map((s) => (
            <label key={s.group.id} className="source-row">
              <input
                type="checkbox"
                checked={s.onGraph}
                onChange={(e) => run(e.target.checked ? 'Show data set on graph' : 'Hide data set from graph', setGroupOnGraph(chart.id, s.tableId, s.group.id, e.target.checked))}
              />
              {s.group.name}
            </label>
          ))}
        </div>
      ))}
      {!multi && ownKind === 'column' && <div className="muted small">Add another column table to plot its data sets on this graph too.</div>}
    </>
  );
}

/** The palette menu entries, in subcategories. */
export function PaletteOptions() {
  return (
    <>
      {PALETTE_GROUPS.map((g) => (
        <optgroup key={g} label={g}>
          {palettesInGroup(g).map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

/** Whether the first colours of a palette stay distinguishable with a colour-vision deficiency (measured, see colorVision.ts). */
function VisionNote({ colors }: { colors: readonly string[] }) {
  const r = useMemo(() => visionReport(colors), [colors]);
  const worst = (Object.keys(DEFICIENCIES) as (keyof typeof DEFICIENCIES)[]).reduce((a, k) => (r.byKind[k] < r.byKind[a] ? k : a), 'protan' as keyof typeof DEFICIENCIES);
  return r.safe ? (
    <div className="small vision vision-ok">✓ Colour-vision safe: the first {COMPARED_COLOURS} colours stay apart for red-weak, green-weak and blue-weak vision.</div>
  ) : (
    <div className="small muted vision">Not colour-vision safe: two of the first {COMPARED_COLOURS} colours come close with {DEFICIENCIES[worst].label} vision (difference {r.byKind[worst].toFixed(1)}; {MIN_DELTA_E} or more is clear).</div>
  );
}

/** An info button beside the palette menu; it opens a window with the colours, what the palette is and its source. */
export function PaletteInfo({ paletteId }: { paletteId: string | null }) {
  const [open, setOpen] = useState(false);
  const palette = paletteById(paletteId);
  if (!palette) return null;
  return (
    <>
      <button className="icon-btn palette-info" aria-label="About this palette" title="About this palette" onClick={() => setOpen(true)}>i</button>
      {open && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)} onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
          <div className="modal modal-wide" role="dialog" aria-modal="true" aria-label="Colour palettes" tabIndex={-1} ref={(el) => el?.focus()}>
            <div className="modal-head">
              <strong>Colour palettes</strong>
              <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close">×</button>
            </div>
            <div className="modal-body modal-pad palette-about">
              <p className="muted small">In use: <strong>{palette.name}</strong>, {palette.colors.length} colours, applied to the data sets in order and repeated when there are more data sets than colours. Colour-vision notes are measured on the first {COMPARED_COLOURS} colours of each palette, by simulating red-weak, green-weak and blue-weak vision (Machado et al., 2009) and taking the smallest CIE76 colour difference between any two of them.</p>
              {PALETTE_GROUPS.map((g) => (
                <section key={g} className="palette-group">
                  <h4>{g}</h4>
                  <p className="muted small">{PALETTE_GROUP_INFO[g]}</p>
                  {palettesInGroup(g).map((p) => (
                    <div key={p.id} className={`palette-entry${p.id === palette.id ? ' current' : ''}`}>
                      <div className="palette-entry-head">
                        <strong>{p.name}</strong>
                        <span className="palette-swatches" aria-hidden="true">
                          {p.colors.slice(0, 12).map((c, i) => (
                            <i key={i} style={{ background: c }} title={c} />
                          ))}
                        </span>
                      </div>
                      {p.description && <div className="small">{p.description}</div>}
                      <VisionNote colors={p.colors} />
                    </div>
                  ))}
                </section>
              ))}
              <p className="muted small">
                Source of the colours (all but the last group): {GGSCI_CITATION.text} <a href={GGSCI_CITATION.url} target="_blank" rel="noreferrer">{GGSCI_CITATION.url}</a>. Descriptions after <a href={GGSCI_CITATION.vignette} target="_blank" rel="noreferrer">the ggsci introduction</a>.
              </p>
            </div>
            <div className="modal-foot">
              <button className="primary" onClick={() => setOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
