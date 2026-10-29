import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from 'react';
import type { BatchFormat, BatchPlan } from '../../chart/export/batchExport';
import { fitsCanvas } from '../../chart/export/pngDpi';
import { chartBadge, TABLE_BADGE, type Badge } from '../../model/graph/badges';
import { newId } from '../../model/ids';
import { FOLDER_NOUN, FOLDER_TITLE } from '../../model/project/folderItems';
import type { FolderKey, Id, ViewRef } from '../../model/types';
import { useApp } from '../../state/AppContext';
import { duplicateItems, moveItems, nudgeItems, removeItems, renameItem, sortItemsByName } from '../../state/commands';
import { Thumb, type ThumbItem } from './FolderThumbs';
import { NOTHING_PICKED, pick, pickAll, pickedInOrder, prune, type PickState } from '../navigator/folderSelection';
import { DeleteIcon, ExportIcon } from '../components/icons';
import { downloadBlob, exportFileName } from '../../util/download';
import { BatchExportDialog } from '../export/BatchExportDialog';
import { useExportJob } from '../export/useExportJob';

/** The kind of page each folder holds. */
const KIND = { tables: 'table', results: 'analysis', graphs: 'chart', layouts: 'layout' } as const satisfies Record<FolderKey, Exclude<ViewRef['kind'], 'folder'>>;

/**
 * The pages of one folder of the navigator as thumbnails: pick one or several (click, Ctrl or Cmd click, Shift click, the check
 * box, Ctrl+A), then open, rename, copy, reorder (drag them, or the arrows) or delete them. Everything can be undone.
 */
export function FolderView({ folder }: { folder: FolderKey }) {
  const { project, setView, run, setStatus, settings } = useApp();
  const [picks, setPicks] = useState<PickState>(NOTHING_PICKED);
  const [renaming, setRenaming] = useState<Id | null>(null);
  const [dragging, setDragging] = useState<Id[] | null>(null);
  const [drop, setDrop] = useState<{ id: Id; side: 'before' | 'after' } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  // Batch export of the picked graphs: one export at a time, like the export of a single graph.
  const exportJob = useExportJob(setStatus);
  const [exportOpen, setExportOpen] = useState(false);

  const entries = useMemo((): Array<{ id: Id; name: string; entry: ThumbItem; badges: Badge[] }> => {
    switch (folder) {
      case 'tables':
        return project.dataTables.map((item) => ({ id: item.id, name: item.name, entry: { kind: 'table', item }, badges: [TABLE_BADGE[item.kind]] }));
      case 'results':
        return (project.analyses ?? []).map((item) => ({ id: item.id, name: item.name, entry: { kind: 'analysis', item }, badges: [] }));
      case 'graphs':
        return project.charts.map((item) => ({ id: item.id, name: item.name, entry: { kind: 'chart', item }, badges: [chartBadge(item.type), ...(item.linkedTo ? [{ text: '🔗', title: `Linked to ${project.charts.find((x) => x.id === item.linkedTo)?.name ?? 'another graph'}: it follows that graph's format` }] : [])] }));
      case 'layouts':
        return (project.layouts ?? []).map((item) => ({ id: item.id, name: item.name, entry: { kind: 'layout', item }, badges: [] }));
    }
  }, [project, folder]);
  const order = useMemo(() => entries.map((e) => e.id), [entries]);
  const noun = FOLDER_NOUN[folder];

  // What is no longer there (deleted, or an undone creation) is no longer picked; another folder starts with no picks.
  useEffect(() => setPicks((s) => prune(order, s)), [order]);
  useEffect(() => {
    setPicks(NOTHING_PICKED);
    setRenaming(null);
  }, [folder]);

  const chosen = pickedInOrder(order, picks);
  const count = chosen.length;
  const nameOf = (id: Id) => entries.find((e) => e.id === id)?.name ?? '';
  const open = (id: Id) => setView({ kind: KIND[folder], id } as ViewRef);
  const everyTable = folder === 'tables' && count > 0 && count >= project.dataTables.length;

  const exportPicked = (plan: BatchPlan, format: BatchFormat, dpi: number) => {
    const tooBig = plan.items.find((it) => it.pixels && !fitsCanvas(it.pixels.width, it.pixels.height))?.pixels ?? null;
    return exportJob.start({
      label: `${format.toUpperCase()} ZIP`,
      pixels: tooBig,
      tooBigMessage: `A graph of the batch needs more pixels at ${dpi} dpi than the browser can make. Choose a lower resolution, or SVG.`,
      work: async (phase) => {
        // The renderer behind export (react-dom/server) is loaded on first use, not at startup.
        const [{ runBatch }, { chartToSvgString, chartToPngBlob, chartToPdfBlob }] = await Promise.all([import('../../chart/export/batchExport'), import('../../chart/export/export')]);
        phase('rasterizing');
        const blob = await runBatch(
          plan,
          format,
          dpi,
          { svg: (c, t, f) => chartToSvgString(c, t, f, { metadata: true }), raster: (kind, c, t, d, f) => (kind === 'png' ? chartToPngBlob(c, t, d, f) : chartToPdfBlob(c, t, d, f)) },
          (i, n, name) => setStatus(`Drawing ${i} of ${n}: ${name}…`),
        );
        phase('encoding');
        downloadBlob(blob, exportFileName(`${project.name}_graphs`, 'zip', settings.timestampExports));
        return `Exported ${plan.items.length} graph${plan.items.length === 1 ? '' : 's'} as ${format.toUpperCase()} in one ZIP file.`;
      },
    });
  };
  const remove = () => {
    if (count === 0 || everyTable) return;
    const ids = chosen;
    const tables = folder === 'tables' ? ids : [];
    const graphs = project.charts.filter((c) => tables.includes(c.dataTableId)).length;
    const results = (project.analyses ?? []).filter((a) => tables.includes(a.dataTableId)).length;
    run(count === 1 ? `Delete ${noun.one}` : `Delete ${count} ${noun.many}`, removeItems(folder, ids));
    setStatus(`Deleted ${count === 1 ? nameOf(ids[0]) : `${count} ${noun.many}`}${graphs + results > 0 ? ` with ${graphs} graph${graphs === 1 ? '' : 's'} and ${results} result${results === 1 ? '' : 's'} that used ${count === 1 ? 'it' : 'them'}` : ''}. Undo (Ctrl+Z) restores ${count === 1 ? 'it' : 'them'}.`);
  };
  const duplicate = () => {
    if (count === 0) return;
    run(count === 1 ? `Duplicate ${noun.one}` : `Duplicate ${count} ${noun.many}`, duplicateItems(folder, chosen.map((id) => [id, newId(KIND[folder])] as const)));
    setStatus(`Duplicated ${count === 1 ? nameOf(chosen[0]) : `${count} ${noun.many}`}.`);
  };
  const nudge = (step: 1 | -1) => {
    if (count > 0) run(step === -1 ? 'Move earlier' : 'Move later', nudgeItems(folder, chosen, step));
  };
  const finishRename = (id: Id, name: string) => {
    setRenaming(null);
    run('Rename', renameItem(KIND[folder], id, name));
  };

  const clickCard = (e: MouseEvent, id: Id) => {
    if ((e.target as HTMLElement).closest('input, button')) return;
    setPicks((s) => pick(order, s, id, { shift: e.shiftKey, toggle: e.ctrlKey || e.metaKey }));
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('input')) return;
    if (e.key === 'Delete') remove();
    else if (e.key === 'F2' && count === 1) setRenaming(chosen[0]);
    else if (e.key === 'Enter' && count === 1) open(chosen[0]);
    else if (e.key === 'Escape') setPicks(NOTHING_PICKED);
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') setPicks(pickAll(order));
    else return;
    e.preventDefault();
  };

  // Dragging a picked item takes every picked item with it; dragging one that is not picked takes that one.
  const startDrag = (e: DragEvent, id: Id) => {
    const ids = picks.picked.has(id) ? chosen : [id];
    if (!picks.picked.has(id)) setPicks({ picked: new Set([id]), anchor: id });
    setDragging(ids);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', ids.join(','));
  };
  const overCard = (e: DragEvent, id: Id) => {
    if (!dragging) return;
    e.preventDefault();
    const box = e.currentTarget.getBoundingClientRect();
    setDrop({ id, side: e.clientX < box.left + box.width / 2 ? 'before' : 'after' });
  };
  const dropOn = (e: DragEvent) => {
    e.preventDefault();
    if (dragging && drop) {
      // The item the moved ones go before: the one dropped on, or the next one that is not itself moving.
      const at = order.indexOf(drop.id);
      const before = drop.side === 'before' ? drop.id : order.slice(at + 1).find((x) => !dragging.includes(x)) ?? null;
      run(dragging.length === 1 ? `Move ${noun.one}` : `Move ${dragging.length} ${noun.many}`, moveItems(folder, dragging, before));
    }
    setDragging(null);
    setDrop(null);
  };

  return (
    <section className="folder-view" aria-label={FOLDER_TITLE[folder]}>
      <header className="folder-head">
        <h2>{FOLDER_TITLE[folder]}</h2>
        <span className="muted">{entries.length} {entries.length === 1 ? noun.one : noun.many}{count > 0 ? `, ${count} selected` : ''}</span>
      </header>
      <div className="folder-toolbar" role="toolbar" aria-label={`Actions for the selected ${noun.many}`}>
        <button onClick={() => setPicks(count === order.length ? NOTHING_PICKED : pickAll(order))} disabled={order.length === 0}>{count === order.length && count > 0 ? 'Clear selection' : 'Select all'}</button>
        <span className="topbar-sep" />
        <button onClick={() => open(chosen[0])} disabled={count !== 1}>Open</button>
        <button onClick={() => setRenaming(chosen[0])} disabled={count !== 1} title="Rename (F2)">Rename</button>
        <button onClick={duplicate} disabled={count === 0}>Duplicate</button>
        {folder === 'graphs' && (
          <button onClick={() => setExportOpen(true)} disabled={count === 0 || exportJob.busy} title="Export the selected graphs as one ZIP file: format and resolution are shown first">
            <ExportIcon /> Export{count > 1 ? ` ${count}` : ''}…
          </button>
        )}
        <span className="topbar-sep" />
        <button onClick={() => nudge(-1)} disabled={count === 0} title="Move the selected earlier in the list" aria-label="Move earlier">◀ Earlier</button>
        <button onClick={() => nudge(1)} disabled={count === 0} title="Move the selected later in the list" aria-label="Move later">Later ▶</button>
        <button onClick={() => run('Sort by name', sortItemsByName(folder))} disabled={entries.length < 2} title="Put all of them in the order of their names">Sort A–Z</button>
        <span className="topbar-sep" />
        <button onClick={remove} disabled={count === 0 || everyTable} title={everyTable ? 'A project keeps at least one data table' : folder === 'tables' ? 'Delete the selected tables and the graphs and results that use them (can be undone)' : 'Delete the selected (can be undone)'}>
          <DeleteIcon /> Delete{count > 1 ? ` ${count}` : ''}
        </button>
      </div>
      {exportOpen && <BatchExportDialog project={project} ids={chosen} state={exportJob.state} onExport={exportPicked} onClose={() => setExportOpen(false)} />}
      {entries.length === 0 ? (
        <div className="empty">No {noun.many} yet. Use the New … line under {FOLDER_TITLE[folder]} in the navigator.</div>
      ) : (
        <div ref={gridRef} className="folder-grid" role="listbox" aria-multiselectable="true" aria-label={FOLDER_TITLE[folder]} tabIndex={0} onKeyDown={onKeyDown} onDragEnd={() => { setDragging(null); setDrop(null); }}>
          {entries.map((e, i) => {
            const selected = picks.picked.has(e.id);
            return (
              <div
                key={e.id}
                role="option"
                aria-selected={selected}
                className={`folder-card${selected ? ' selected' : ''}${dragging?.includes(e.id) ? ' dragging' : ''}${drop?.id === e.id && !dragging?.includes(e.id) ? ` drop-${drop.side}` : ''}`}
                draggable={renaming !== e.id}
                onClick={(ev) => clickCard(ev, e.id)}
                onDoubleClick={(ev) => { if (!(ev.target as HTMLElement).closest('input, .folder-name')) open(e.id); }}
                onDragStart={(ev) => startDrag(ev, e.id)}
                onDragOver={(ev) => overCard(ev, e.id)}
                onDrop={dropOn}
              >
                <div className="folder-thumb"><Thumb entry={e.entry} project={project} /></div>
                <div className="folder-label">
                  <input type="checkbox" checked={selected} aria-label={`Select ${e.name}`} onChange={(ev) => setPicks((s) => pick(order, s, e.id, { shift: (ev.nativeEvent as globalThis.MouseEvent).shiftKey === true, toggle: true }))} />
                  {renaming === e.id ? (
                    <input
                      className="nav-rename"
                      aria-label="Name"
                      autoFocus
                      defaultValue={e.name}
                      onFocus={(ev) => ev.target.select()}
                      onBlur={(ev) => finishRename(e.id, ev.target.value)}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter') ev.currentTarget.blur();
                        else if (ev.key === 'Escape') setRenaming(null);
                        ev.stopPropagation();
                      }}
                    />
                  ) : (
                    <span className="folder-name" title={`${e.name} (double-click to rename)`} onDoubleClick={() => setRenaming(e.id)}>
                      {e.badges.map((badge) => (
                        <span key={badge.text} className="nav-badge" title={badge.title}>{badge.text}</span>
                      ))}
                      {e.name}
                    </span>
                  )}
                  <span className="folder-number" aria-label={`Number ${i + 1}`}>{i + 1}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="folder-hint muted small">Click to select, Ctrl or Shift click to select several. Double-click a picture to open it, its name to rename it. Drag to put them in another order.</p>
    </section>
  );
}
