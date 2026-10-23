import { useMemo, useState } from 'react';
import { buildAnyModel, ChartCanvas } from '../chart/anyModel';

import { applyVariant, previewFit, type ChartVariant } from '../model/chartVariant';
import { GALLERY, availableItems, type GalleryItem } from '../model/chartGallery';
import { tableTypeInfo } from '../model/chartTypes';
import { createChart } from '../model/defaults';
import type { ChartType, DataTable, Id, TableKind } from '../model/types';
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

/**
 * New graph. The graph family is the type of the table (as chosen when the table was made); the gallery shows every
 * graph of that family in tabs, with a live preview. Graphs that cannot be made yet are shown locked, so the whole
 * range is visible.
 */
export function NewGraphDialog({ tables, initialTableId, onCreate, onClose }: { tables: DataTable[]; initialTableId: Id; onCreate: (tableId: Id, type: ChartType, variant?: ChartVariant) => void; onClose: () => void }) {
  const firstTable = tables.find((t) => t.id === initialTableId) ?? tables[0];
  const [tableId, setTableId] = useState<Id>(firstTable.id);
  const table = tables.find((t) => t.id === tableId) ?? firstTable;
  const family = table.kind;
  const tabs = GALLERY[family];
  const [tabId, setTabId] = useState<string>(tabs[0].id);
  const tab = tabs.find((t) => t.id === tabId) ?? tabs[0];
  const [chosen, setChosen] = useState<string | null>(null);
  const first = availableItems(family)[0];
  // The chosen graph must belong to this family; otherwise the family's first available graph is selected.
  const all = tabs.flatMap((t) => t.items);
  const selected: GalleryItem = all.find((i) => i.id === chosen) ?? first;
  const selectedTab = tabs.find((t) => t.items.includes(selected));
  const tablesOfFamily = tables.filter((t) => t.kind === family);
  const canCreate = selected.type !== null;

  const pickFamily = (kind: TableKind) => {
    const next = tables.find((t) => t.kind === kind);
    if (!next) return;
    setTableId(next.id);
    setTabId(GALLERY[kind][0].id);
    setChosen(null);
  };
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
    <Modal title="New graph" confirmLabel="Create graph" onConfirm={() => selected.type && onCreate(table.id, selected.type, selected.variant)} onClose={onClose} confirmDisabled={!canCreate} wide>
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
        <div className="format-tabs" role="tablist" aria-label="Graph kind">
          {tabs.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab.id === t.id} className={`format-tab${tab.id === t.id ? ' active' : ''}`} onClick={() => setTabId(t.id)}>
              {t.label}
              {t.items.every((i) => i.type === null) && <span aria-hidden="true"> 🔒</span>}
            </button>
          ))}
        </div>
      )}

      <div className="gallery" role="radiogroup" aria-label="Graph">
        {tab.items.map((it) => (
          <button
            key={it.id}
            className={`gallery-item${selected.id === it.id ? ' selected' : ''}${it.type === null ? ' locked' : ''}`}
            role="radio"
            aria-checked={selected.id === it.id}
            title={it.type === null ? `${it.label}: planned, not available yet` : it.label}
            onClick={() => setChosen(it.id)}
            onDoubleClick={() => it.type && onCreate(table.id, it.type, it.variant)}
          >
            <GallerySketch item={it} />
            {it.type === null && <span className="gallery-lock" aria-hidden="true">🔒</span>}
            <span className="gallery-caption">{it.label}</span>
          </button>
        ))}
      </div>

      <div className="gallery-detail">
        <strong>{selected.label}</strong>
        {selectedTab && selectedTab.id !== tab.id && <span className="muted small"> · in “{selectedTab.label}”</span>}
        <p className="muted">{selected.description}</p>
        {selected.type === null && (
          <p className="gallery-planned">🔒 Planned{selected.spec ? ` (specification preset ${selected.spec})` : ''}. It cannot be created yet; the graphs without a lock can.</p>
        )}
      </div>

      <div className="gallery-preview-box">
        <div className="gallery-preview-title">Preview</div>
        <div className="gallery-preview">
          {selected.type ? <Preview table={table} type={selected.type} variant={selected.variant} /> : <div className="gallery-preview-empty muted">🔒 Planned: no preview yet.</div>}
        </div>
      </div>
    </Modal>
  );
}

