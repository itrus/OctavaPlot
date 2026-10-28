import { useMemo, useState } from 'react';
import { useRoving } from '../inspector/common/roving';
import { buildAnyModel, ChartCanvas } from '../../chart/anyModel';

import { applyVariant, previewFit, type ChartVariant } from '../../model/graph/chartVariant';
import { GALLERY, availableItems, type GalleryItem } from '../../model/graph/chartGallery';
import { inheritChart } from '../../model/graph/chartFormat';
import { chartTypeInfo, tableTypeInfo } from '../../model/graph/chartTypes';
import { createChart } from '../../model/defaults';
import type { Chart, ChartType, DataTable, Id, TableKind } from '../../model/types';
import { GallerySketch } from './GallerySketches';
import { Modal } from './NewItemDialogs';


const FAMILY_LABEL: Record<TableKind, string> = { xy: 'XY', column: 'Column', grouped: 'Grouped', contingency: 'Contingency', survival: 'Survival' };
const FAMILY_ORDER: TableKind[] = ['xy', 'column', 'grouped', 'contingency', 'survival'];

/** A live preview of the chosen graph with the data of the table, drawn by the same code as the graph itself. */
function Preview({ table, type, variant }: { table: DataTable; type: ChartType; variant?: ChartVariant }) {
  const drawn = useMemo(() => {
    try {
      const chart = applyVariant({ ...createChart(table.id, { widthPx: 1024, heightPx: 768 }, type), title: table.name }, variant);
      return { chart, any: buildAnyModel(chart, table, previewFit(chart, variant)) };
    } catch {
      return null;
    }
  }, [table, type, variant]);
  if (!drawn) return <div className="gallery-preview-empty muted">No preview available.</div>;
  return <ChartCanvas chart={drawn.chart} any={drawn.any} cssWidth="100%" cssHeight="100%" />;
}

/** A live preview of a graph that would take its format from another. */
function PreviewLike({ source, sourceTable, table }: { source: Chart; sourceTable: DataTable; table: DataTable }) {
  const drawn = useMemo(() => {
    try {
      const chart = inheritChart(source, sourceTable, table, 'preview');
      return { chart, any: buildAnyModel(chart, table) };
    } catch {
      return null;
    }
  }, [source, sourceTable, table]);
  if (!drawn) return <div className="gallery-preview-empty muted">No preview available.</div>;
  return <ChartCanvas chart={drawn.chart} any={drawn.any} cssWidth="100%" cssHeight="100%" />;
}

/**
 * New graph. Either from the gallery, or like an existing graph (which gives its format to the new one, for the table
 * chosen). In the gallery the graph family is the type of the table (as chosen when the table was made); the gallery shows every
 * graph of that family in tabs, with a live preview. Graphs that cannot be made yet are shown locked, so the whole
 * range is visible.
 */
export function NewGraphDialog({ tables, charts, initialTableId, initialChartId, onCreate, onCreateLike, onClose }: { tables: DataTable[]; charts: Chart[]; initialTableId: Id; initialChartId?: Id; onCreate: (tableId: Id, type: ChartType, variant?: ChartVariant) => void; onCreateLike: (tableId: Id, sourceChartId: Id, linked: boolean) => void; onClose: () => void }) {
  const [mode, setMode] = useState<'gallery' | 'like'>('gallery');
  const [sourceId, setSourceId] = useState<Id>(charts.find((c) => c.id === initialChartId)?.id ?? charts[0]?.id ?? '');
  const [linked, setLinked] = useState(true);
  const source = charts.find((c) => c.id === sourceId);
  const sourceTable = source ? tables.find((t) => t.id === source.dataTableId) : undefined;
  const firstTable = tables.find((t) => t.id === initialTableId) ?? tables[0];
  const [tableId, setTableId] = useState<Id>(firstTable.id);
  const table = tables.find((t) => t.id === tableId) ?? firstTable;
  const family = table.kind;
  // Every graph is shown; the ones that cannot be made yet are locked.
  const tabs = GALLERY[family];
  const [tabId, setTabId] = useState<string>(tabs[0].id);
  const tab = tabs.find((t) => t.id === tabId) ?? tabs[0];
  const [chosen, setChosen] = useState<string | null>(null);
  const first = availableItems(family)[0];
  // The chosen graph must belong to this family; otherwise the family's first available graph is selected.
  const all = availableItems(family);
  const selected: GalleryItem = all.find((i) => i.id === chosen) ?? first;
  const selectedTab = tabs.find((t) => t.items.includes(selected));
  const tablesOfFamily = tables.filter((t) => t.kind === family);
  const canCreate = selected.type !== null;
  const shape = tableTypeInfo(family).layout;

  const pickFamily = (kind: TableKind) => {
    const next = tables.find((t) => t.kind === kind);
    if (!next) return;
    setTableId(next.id);
    setTabId(GALLERY[kind][0].id);
    setChosen(null);
  };
  const modes = ['gallery', 'like'] as const;
  const rovingMode = useRoving([true, charts.length > 0], modes.indexOf(mode), (i) => setMode(modes[i]));
  const rovingTabs = useRoving(tabs.map(() => true), tabs.findIndex((t) => t.id === tab.id), (i) => setTabId(tabs[i].id));
  const rovingItems = useRoving(tab.items.map((i) => i.type !== null), tab.items.findIndex((i) => i.id === selected.id), (i) => setChosen(tab.items[i].id), 'both');
  const pickTable = (id: Id) => {
    const next = tables.find((t) => t.id === id);
    if (!next) return;
    setTableId(id);
    if (next.kind !== family) {
      setTabId(GALLERY[next.kind][0].id);
      setChosen(null);
    }
  };

  return (
    <Modal
      title="New graph"
      confirmLabel="Create graph"
      onConfirm={() => (mode === 'like' ? source && onCreateLike(table.id, source.id, linked) : selected.type && onCreate(table.id, selected.type, selected.variant))}
      onClose={onClose}
      confirmDisabled={mode === 'like' ? !source || !sourceTable : !canCreate}
      wide
    >
      <span className="switch-group" role="radiogroup" aria-label="How to make the graph" {...rovingMode.groupProps}>
        <button role="radio" aria-checked={mode === 'gallery'} {...rovingMode.itemProps(0)} className={`switch${mode === 'gallery' ? ' on' : ''}`} onClick={() => setMode('gallery')}>
          From the gallery
        </button>
        <button role="radio" aria-checked={mode === 'like'} {...rovingMode.itemProps(1)} className={`switch${mode === 'like' ? ' on' : ''}`} onClick={() => setMode('like')} disabled={charts.length === 0} title={charts.length === 0 ? 'There is no graph to take the format from yet' : undefined}>
          Like an existing graph
        </button>
      </span>
      {mode === 'like' && source && sourceTable ? (
        <>
          <p className="muted">The new graph takes the format of an existing graph and shows the table you choose. Data sets are matched by position: the third data set of the graph styles the third of the new table.</p>
          <div className="gallery-top">
            <label className="choice-label">
              <span>Like graph</span>
              <select value={source.id} onChange={(e) => setSourceId(e.target.value)} aria-label="Graph to take the format from">
                {charts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({chartTypeInfo(c.type)?.label ?? c.type})
                  </option>
                ))}
              </select>
            </label>
            <label className="choice-label">
              <span>Of table</span>
              <select value={table.id} onChange={(e) => pickTable(e.target.value)} aria-label="Data table">
                {tables.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({tableTypeInfo(t.kind).label})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="muted small">
            {sourceTable.kind === table.kind
              ? 'Taken over: size, chart type and its options, fonts, colours, frame, grid, axis look, legend and the style of each data set. Not taken over: data, titles, axis ranges, reference lines, annotations and the fitted curve.'
              : `The table is of another type than ${sourceTable.name}, so only the general format is taken over: size, fonts, colours, frame, grid, axis look and legend. The graph type is the table's usual one.`}
          </p>
          <label className="choice-label">
            <input type="checkbox" checked={linked} onChange={(e) => setLinked(e.target.checked)} />
            <span>Keep the graphs linked: later changes to the format of “{source.name}” also reach the new graph, except for details you have changed on the new graph itself</span>
          </label>
          <div className="gallery-preview-box">
            <div className="gallery-preview-title">Preview</div>
            <div className="gallery-preview">
              <PreviewLike source={source} sourceTable={sourceTable} table={table} />
            </div>
          </div>
        </>
      ) : (
      <>
      <div className="gallery-top">
        <label className="choice-label">
          <span>Graph family</span>
          <select value={family} onChange={(e) => pickFamily(e.target.value as TableKind)} aria-label="Graph family">
            {FAMILY_ORDER.map((k) => (
              <option key={k} value={k} disabled={!tables.some((t) => t.kind === k)}>
                {FAMILY_LABEL[k]}
                {tables.some((t) => t.kind === k) ? '' : ' (no table of this type yet)'}
              </option>
            ))}
          </select>
        </label>
        <label className="choice-label">
          <span>Of table</span>
          <select value={table.id} onChange={(e) => pickTable(e.target.value)} aria-label="Data table">
            {tables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({tableTypeInfo(t.kind).label})
              </option>
            ))}
          </select>
        </label>
      </div>
      {tablesOfFamily.length > 1 && <p className="muted small">{tablesOfFamily.length} {FAMILY_LABEL[family].toLowerCase()} tables: choose which one above.</p>}

      {tabs.length > 1 && (
        <div className="format-tabs" role="tablist" aria-label="Graph kind" {...rovingTabs.groupProps}>
          {tabs.map((t, i) => (
            <button key={t.id} role="tab" aria-selected={tab.id === t.id} {...rovingTabs.itemProps(i)} className={`format-tab${tab.id === t.id ? ' active' : ''}`} onClick={() => setTabId(t.id)}>
              {t.label}
              {t.items.every((i) => i.type === null) && <span aria-hidden="true"> 🔒</span>}
            </button>
          ))}
        </div>
      )}

      <div className="gallery" role="radiogroup" aria-label="Graph" {...rovingItems.groupProps}>
        {tab.items.map((it, n) => {
          const locked = it.type === null;
          return (
            <button
              key={it.id}
              className={`gallery-item${selected.id === it.id ? ' selected' : ''}${locked ? ' locked' : ''}`}
              role="radio"
              aria-checked={selected.id === it.id}
              {...rovingItems.itemProps(n)}
              aria-disabled={locked}
              title={`${it.label}${locked ? ` (planned, preset ${it.spec}, not available yet)` : ''}. ${FAMILY_LABEL[family]} graph. Needs: ${shape} ${it.description}`}
              onClick={() => !locked && setChosen(it.id)}
              onDoubleClick={() => it.type && onCreate(table.id, it.type, it.variant)}
            >
              <GallerySketch item={it} />
              {locked && <span className="gallery-lock" aria-hidden="true">🔒</span>}
              <span className="gallery-caption">{it.label}</span>
              {locked && <span className="muted small">{it.spec}</span>}
            </button>
          );
        })}
      </div>

      <div className="gallery-detail">
        <strong>{selected.label}</strong>
        {selectedTab && selectedTab.id !== tab.id && <span className="muted small"> · in “{selectedTab.label}”</span>}
        <span className="muted small"> · {FAMILY_LABEL[family]} graph</span>
        <p className="muted">{selected.description}</p>
        <p className="muted small">Table needed: {shape}</p>
      </div>

      <div className="gallery-preview-box">
        <div className="gallery-preview-title">Preview</div>
        <div className="gallery-preview">
          {selected.type && <Preview table={table} type={selected.type} variant={selected.variant} />}
        </div>
      </div>
      </>
      )}
    </Modal>
  );
}

