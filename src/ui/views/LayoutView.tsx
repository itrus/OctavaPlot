import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { drawLayout, layoutPngSize, layoutToPdfBlob, layoutToPngBlob, layoutToSvgString } from '../../chart/export/layoutExport';
import { clampFrame, FREE_MAX, GAP_MM_MAX, GRID_MAX, LABEL_PT_MAX, LABEL_PT_MIN, MARGIN_MM_MAX, pageMm, PERCENT_MAX, PERCENT_MIN, standardArrangements, sameArrangement } from '../../model/project/layout';
import type { FrameMm, Layout, LayoutArrangement, LayoutScaling, PanelLabelStyle } from '../../model/types';
import { useApp } from '../../state/AppContext';
import { addFreePanel, freeLayout, patchLayout, removeFreePanel, removeLayout, setFrame, setLayoutPanel } from '../../state/commands';
import { downloadBlob, exportFileName } from '../../util/download';
import { DeleteIcon, ExportIcon } from '../components/icons';
import { Check, ColorInput, Field, NumField, Section, SelectInput, TextInput } from '../inspector/common/controls';

const CANVAS_PAD = 24;
const SCROLLBAR_ROOM = 17;
/** Browsers limit the size of a canvas. */
const PNG_MAX_SIDE = 16000;

const LABEL_STYLES: ReadonlyArray<{ value: PanelLabelStyle; label: string }> = [
  { value: 'A', label: 'A, B, C' },
  { value: 'a', label: 'a, b, c' },
  { value: 'I', label: 'I, II, III' },
  { value: '1', label: '1, 2, 3' },
  { value: 'none', label: 'None' },
];

const SCALING_CHOICES: ReadonlyArray<{ value: LayoutScaling['mode']; label: string }> = [
  { value: 'smallest', label: 'Match the smallest' },
  { value: 'largest', label: 'Match the largest' },
  { value: 'fit', label: 'Fill each panel' },
  { value: 'percent', label: 'Set to a percentage' },
];

const SCALING_NOTE: Record<LayoutScaling['mode'], string | null> = {
  smallest: 'All graphs take the smallest scaling factor, so every graph fits its panel and the fonts match.',
  largest: 'All graphs take the largest scaling factor, so the fonts match; graphs that need more room than their panel has are cut off.',
  fit: 'Each graph is as large as its panel allows, so fonts differ between graphs.',
  percent: null,
};

const arrangementKey = (a: LayoutArrangement): string => (a.kind === 'inset' ? 'inset' : a.kind === 'free' ? 'free' : `${a.cols}x${a.rows}`);

type Handle = 'move' | 'nw' | 'ne' | 'sw' | 'se';
interface Drag {
  slot: number;
  handle: Handle;
  startX: number;
  startY: number;
  /** The box as it was shown when the drag began, and as it is now (the part of the graph that is visible in its panel). */
  from: FrameMm;
  now: FrameMm;
  /** The box of the panel when the drag began. */
  frame: FrameMm;
  /** Height / width of the graph while it is whole in its panel: a corner then resizes the graph in proportion. */
  aspect: number | null;
}

const PT_TO_MM = 25.4 / 72;

/** An A4 page of graphs, with the settings of the page, the arrangement, the scaling and the panel labels beside it. */
export function LayoutView({ layoutId }: { layoutId: string }) {
  const { project } = useApp();
  const layout = (project.layouts ?? []).find((l) => l.id === layoutId);
  if (!layout) return <div className="empty">This layout no longer exists.</div>;
  return <LayoutPage layout={layout} />;
}

/** The box after a drag of `dx`, `dy` mm: moved, or resized from a corner (the opposite corner stays where it is). */
function dragged(from: FrameMm, handle: Handle, dx: number, dy: number, aspect: number | null): FrameMm {
  if (handle === 'move') return { ...from, x: from.x + dx, y: from.y + dy };
  const left = handle === 'nw' || handle === 'sw';
  const top = handle === 'nw' || handle === 'ne';
  const w = left ? from.w - dx : from.w + dx;
  // A graph is resized in proportion, from the corner opposite the one that is dragged.
  const h = aspect === null ? (top ? from.h - dy : from.h + dy) : w * aspect;
  return { x: left ? from.x + from.w - w : from.x, y: top ? from.y + from.h - h : from.y, w, h };
}

const intersect = (a: FrameMm, b: FrameMm): FrameMm => {
  const [x, y] = [Math.max(a.x, b.x), Math.max(a.y, b.y)];
  return { x, y, w: Math.max(1, Math.min(a.x + a.w, b.x + b.w) - x), h: Math.max(1, Math.min(a.y + a.h, b.y + b.h) - y) };
};

function LayoutPage({ layout }: { layout: Layout }) {
  const { project, run, setStatus, settings } = useApp();
  const drawing = useMemo(() => drawLayout(layout, project), [layout, project]);
  const dpi = settings.exportDpi;
  const [selected, setSelected] = useState(0);
  const [drag, setDrag] = useState<Drag | null>(null);

  // The page is shown whole, as large as the window allows.
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const measure = () => setAvail({ w: el.offsetWidth - SCROLLBAR_ROOM, h: el.offsetHeight - SCROLLBAR_ROOM });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = avail.w > 0 && avail.h > 0 ? Math.max(0.05, Math.min((avail.w - 2 * CANVAS_PAD) / drawing.widthPt, (avail.h - 2 * CANVAS_PAD) / drawing.heightPt)) : 0.5;
  const pageW = drawing.widthPt * scale;
  const pageH = drawing.heightPt * scale;
  const mm = pageMm(layout.orientation);
  const a = layout.arrangement;
  const frames = a.kind === 'free' ? a.frames : [];
  const slot = Math.min(selected, Math.max(0, frames.length - 1));

  const set = (label: string, patch: Partial<Omit<Layout, 'id' | 'panels'>>) => run(label, patchLayout(layout.id, patch));

  // The box shown for a panel is the graph in it (the part that is visible, when it is cut off), so it shrinks and grows
  // with the scaling of the graphs; an empty panel shows its own box.
  const shown = (i: number): FrameMm => {
    const g = drawing.arranged.placements[i]?.graph;
    const f = frames[i];
    if (!f) return { x: 0, y: 0, w: 1, h: 1 };
    return g ? intersect({ x: g.x * PT_TO_MM, y: g.y * PT_TO_MM, w: g.w * PT_TO_MM, h: g.h * PT_TO_MM }, f) : f;
  };
  /** Height / width of the graph of a panel when it lies whole inside its box, otherwise null. */
  const aspectOf = (i: number): number | null => {
    const g = drawing.arranged.placements[i]?.graph;
    const r = drawing.arranged.placements[i]?.rect;
    return g && r && g.w <= r.w + 0.5 && g.h <= r.h + 0.5 ? g.h / g.w : null;
  };

  // Dragging a box: it follows the pointer at once; the page is redrawn, and the change recorded for undo, when it is let go.
  const startDrag = (e: PointerEvent, index: number, handle: Handle) => {
    if (e.button !== 0 || a.kind !== 'free') return;
    e.stopPropagation();
    setSelected(index);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setDrag({ slot: index, handle, startX: e.clientX, startY: e.clientY, from: shown(index), now: shown(index), frame: a.frames[index], aspect: aspectOf(index) });
  };
  const moveDrag = (e: PointerEvent) => {
    if (!drag) return;
    const k = mm.width / pageW;
    setDrag({ ...drag, now: clampFrame(dragged(drag.from, drag.handle, Math.round((e.clientX - drag.startX) * k), Math.round((e.clientY - drag.startY) * k), drag.aspect), layout.orientation) });
  };
  /** The box of the panel that gives the shown box `now`: the panel moves with the graph, and takes the size of a resized graph. */
  const frameFor = (d: Pick<Drag, 'handle' | 'from' | 'frame'>, now: FrameMm): FrameMm => (d.handle === 'move' ? { ...d.frame, x: d.frame.x + now.x - d.from.x, y: d.frame.y + now.y - d.from.y } : now);
  const endDrag = () => {
    if (drag && (drag.now.x !== drag.from.x || drag.now.y !== drag.from.y || drag.now.w !== drag.from.w || drag.now.h !== drag.from.h)) run(drag.handle === 'move' ? 'Move panel' : 'Resize panel', setFrame(layout.id, drag.slot, frameFor(drag, drag.now)));
    setDrag(null);
  };

  const exportSvg = () => {
    try {
      downloadBlob(new Blob([layoutToSvgString(layout, project)], { type: 'image/svg+xml' }), exportFileName(layout.name, 'svg', settings.timestampExports));
      setStatus('Exported SVG.');
    } catch (err) {
      setStatus(`SVG export failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  const exportRaster = async (kind: 'png' | 'pdf') => {
    const { width, height } = layoutPngSize(layout, dpi);
    if (Math.max(width, height) > PNG_MAX_SIDE) {
      setStatus(`${kind.toUpperCase()} export at ${dpi} dpi needs ${width} × ${height} px, more than the browser can make. Choose a lower resolution, or export SVG.`);
      return;
    }
    try {
      const blob = kind === 'png' ? await layoutToPngBlob(layout, project, dpi) : await layoutToPdfBlob(layout, project, dpi);
      downloadBlob(blob, exportFileName(layout.name, kind, settings.timestampExports));
      setStatus(`Exported ${kind.toUpperCase()}, ${width} × ${height} px (${dpi} dpi).`);
    } catch (err) {
      setStatus(`${kind.toUpperCase()} export failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const standards = standardArrangements(layout.orientation);
  const standard = standards.some((s) => sameArrangement(s.arrangement, a));
  const percent = layout.scaling.mode === 'percent' ? layout.scaling.percent : Math.round((drawing.arranged.commonFactor ?? 1) * 100);
  const box = (f: FrameMm) => ({ left: `${(f.x / mm.width) * 100}%`, top: `${(f.y / mm.height) * 100}%`, width: `${(f.w / mm.width) * 100}%`, height: `${(f.h / mm.height) * 100}%` });
  const current = a.kind === 'free' ? (drag && drag.slot === slot ? drag.now : shown(slot)) : null;
  // The fields show the box on the page (the graph); typing a size keeps the proportions of a graph that lies whole in its panel.
  const setBox = (patch: Partial<FrameMm>) => {
    if (!current || a.kind !== 'free') return;
    const aspect = aspectOf(slot);
    const next = { ...current, ...patch };
    if (aspect !== null && patch.w !== undefined) next.h = next.w * aspect;
    else if (aspect !== null && patch.h !== undefined) next.w = next.h / aspect;
    const onlyMoved = patch.w === undefined && patch.h === undefined;
    run(onlyMoved ? 'Move panel' : 'Resize panel', setFrame(layout.id, slot, onlyMoved ? { ...a.frames[slot], x: a.frames[slot].x + next.x - current.x, y: a.frames[slot].y + next.y - current.y } : next));
  };

  return (
    <div className="graph-view layout-view">
      <div className="toolbar">
        <button
          className="icon-text"
          onClick={() => {
            run('Delete layout', removeLayout(layout.id));
            setStatus(`Deleted ${layout.name}. Undo (Ctrl+Z) restores it.`);
          }}
          title="Delete this layout (the graphs stay; can be undone)"
        >
          <DeleteIcon />
          Delete
        </button>
        <span className="toolbar-info">{layout.orientation === 'landscape' ? 'A4 landscape, 297 × 210 mm' : 'A4 portrait, 210 × 297 mm'}</span>
        <button
          className="icon-text toolbar-end"
          onClick={() => void (settings.exportFormat === 'svg' ? exportSvg() : exportRaster(settings.exportFormat))}
          title={`Export the page as ${settings.exportFormat.toUpperCase()}${settings.exportFormat === 'svg' ? ' (vector)' : ` at ${dpi} dpi`} (the format and resolution are chosen in Settings)`}
        >
          <ExportIcon />
          Export
        </button>
      </div>
      <div className="layout-body">
        <div className="chart-scroller" ref={scrollerRef}>
          <div className="chart-wrap" style={{ width: pageW }}>
            <div className="layout-page-wrap" style={{ width: pageW, height: pageH }}>
              <div className="layout-page" role="img" aria-label={`${layout.name}, ${layout.panels.filter(Boolean).length} graphs`} dangerouslySetInnerHTML={{ __html: drawing.svg }} />
              {a.kind === 'free' && (
                <div className="layout-frames" onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
                  {frames.map((_, i) => {
                    const at = drag && drag.slot === i ? drag.now : shown(i);
                    return (
                      <div key={i} className={`layout-frame${i === slot ? ' selected' : ''}`} style={box(at)} onPointerDown={(e) => startDrag(e, i, 'move')} title="Drag to move; drag a corner to resize">
                        <span className="layout-frame-tag">{drawing.arranged.placements[i]?.label || i + 1}</span>
                        {i === slot && (['nw', 'ne', 'sw', 'se'] as const).map((h) => <span key={h} className={`layout-handle ${h}`} onPointerDown={(e) => startDrag(e, i, h)} />)}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {drawing.notices.length > 0 && (
              <ul className="warnings" aria-label="Layout warnings">
                {drawing.notices.map((w) => (
                  <li key={w}>⚠ {w}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <aside className="layout-panel" aria-label="Layout settings">
          <Section title="Page">
            <Field label="Orientation">
              <span className="switch-group" role="group" aria-label="Orientation">
                {(['landscape', 'portrait'] as const).map((o) => (
                  <button key={o} className={`switch${layout.orientation === o ? ' on' : ''}`} aria-pressed={layout.orientation === o} onClick={() => set(`Page ${o}`, { orientation: o })}>
                    {o === 'landscape' ? 'Landscape' : 'Portrait'}
                  </button>
                ))}
              </span>
            </Field>
            <Field label="Transparent background" hint="On: the page has no colour of its own (SVG and PNG are transparent; a PDF page is white)">
              <Check checked={layout.background === null} onChange={(v) => set('Page background', { background: v ? null : '#ffffff' })} ariaLabel="Transparent background" />
            </Field>
            {layout.background !== null && (
              <Field label="Background colour">
                <ColorInput value={layout.background} onChange={(v) => set('Page background', { background: v })} />
              </Field>
            )}
            <Field label="Title on top of the page">
              <Check checked={layout.showTitle} onChange={(v) => set('Page title', { showTitle: v })} ariaLabel="Title on top of the page" />
            </Field>
            {layout.showTitle && (
              <Field label="Title">
                <TextInput value={layout.title} onChange={(v) => set('Page title text', { title: v })} placeholder="Title" />
              </Field>
            )}
            <NumField label="Margin" unit="mm" step={1} min={0} max={MARGIN_MM_MAX} value={layout.marginMm} disabled={a.kind === 'free'} note={a.kind === 'free' ? 'Free placement ignores the margin: place the boxes where you want them.' : null} onCommit={(v) => set('Page margin', { marginMm: v })} />
          </Section>
          <Section title="Arrangement">
            <Field label="Panels">
              <SelectInput<string>
                value={a.kind === 'free' ? 'free' : standard ? arrangementKey(a) : 'array'}
                options={[
                  ...standards.map((s) => ({ value: arrangementKey(s.arrangement), label: s.label })),
                  ...(!standard && a.kind === 'grid' ? [{ value: 'array', label: `Array ${a.cols} × ${a.rows}` }] : []),
                  { value: 'free', label: 'Free placement' },
                ]}
                onChange={(v) => {
                  if (v === 'free') run('Free placement', freeLayout(layout.id));
                  else {
                    const s = standards.find((x) => arrangementKey(x.arrangement) === v);
                    if (s) set('Arrangement', { arrangement: s.arrangement });
                  }
                }}
              />
            </Field>
            {a.kind !== 'free' && (
              <>
                <NumField label="Graphs across" step={1} min={1} max={GRID_MAX} value={a.kind === 'grid' ? a.cols : 1} disabled={a.kind !== 'grid'} onCommit={(v) => a.kind === 'grid' && set('Arrangement', { arrangement: { kind: 'grid', cols: Math.round(v), rows: a.rows } })} />
                <NumField label="Graphs down" step={1} min={1} max={GRID_MAX} value={a.kind === 'grid' ? a.rows : 1} disabled={a.kind !== 'grid'} onCommit={(v) => a.kind === 'grid' && set('Arrangement', { arrangement: { kind: 'grid', cols: a.cols, rows: Math.round(v) } })} />
                <NumField label="Space between" unit="mm" step={1} min={0} max={GAP_MM_MAX} value={layout.gapMm} disabled={a.kind !== 'grid'} onCommit={(v) => set('Space between panels', { gapMm: v })} />
              </>
            )}
            {a.kind === 'free' && current && (
              <>
                <div className="muted small">Drag a box on the page to move it, or a corner to resize it. Choose a standard arrangement above to go back to a grid.</div>
                <Field label="Selected panel">
                  <SelectInput<string> value={String(slot)} options={frames.map((_, i) => ({ value: String(i), label: `Panel ${drawing.arranged.placements[i]?.label || i + 1}` }))} onChange={(v) => setSelected(Number(v))} />
                </Field>
                <NumField label="Left" unit="mm" step={1} slider={false} min={0} max={mm.width} value={current.x} onCommit={(v) => setBox({ x: v })} />
                <NumField label="Top" unit="mm" step={1} slider={false} min={0} max={mm.height} value={current.y} onCommit={(v) => setBox({ y: v })} />
                <NumField label="Width" unit="mm" step={1} slider={false} min={1} max={mm.width} value={current.w} onCommit={(v) => setBox({ w: v })} />
                <NumField label="Height" unit="mm" step={1} slider={false} min={1} max={mm.height} value={current.h} onCommit={(v) => setBox({ h: v })} />
                <div className="layout-buttons">
                  <button className="small-btn" disabled={frames.length >= FREE_MAX} onClick={() => { run('Add panel', addFreePanel(layout.id)); setSelected(frames.length); }}>
                    Add panel
                  </button>
                  <button className="small-btn" disabled={frames.length <= 1} onClick={() => run('Remove panel', removeFreePanel(layout.id, slot))}>
                    Remove panel
                  </button>
                </div>
              </>
            )}
          </Section>
          <Section title="Graphs in the panels">
            {layout.panels.map((id, i) => (
              <Field key={i} label={`Panel ${drawing.arranged.placements[i]?.label || i + 1}`}>
                <SelectInput<string>
                  value={id ?? ''}
                  options={[{ value: '', label: '(empty)' }, ...project.charts.map((c) => ({ value: c.id, label: c.name }))]}
                  onChange={(v) => run('Graph in panel', setLayoutPanel(layout.id, i, v === '' ? null : v))}
                />
              </Field>
            ))}
          </Section>
          <Section title="Size of the graphs">
            <Field label="Scaling factor" hint="Scaling factor = size on the page / size in Graphs. Equal factors give equal fonts and line widths.">
              <SelectInput<LayoutScaling['mode']>
                value={layout.scaling.mode}
                options={[...SCALING_CHOICES]}
                onChange={(mode) => set(`Scaling: ${SCALING_CHOICES.find((c) => c.value === mode)?.label}`, { scaling: mode === 'percent' ? { mode, percent: Math.min(PERCENT_MAX, Math.max(PERCENT_MIN, percent)) } : { mode } })}
              />
            </Field>
            <NumField
              label="Percentage"
              unit="%"
              step={1}
              min={PERCENT_MIN}
              max={PERCENT_MAX}
              slider={false}
              value={percent}
              disabled={layout.scaling.mode !== 'percent'}
              note={SCALING_NOTE[layout.scaling.mode] ?? null}
              onCommit={(v) => set('Scaling factor', { scaling: { mode: 'percent', percent: v } })}
            />
          </Section>
          <Section title="Panel labels">
            <Field label="Style">
              <SelectInput<PanelLabelStyle> value={layout.labelStyle} options={[...LABEL_STYLES]} onChange={(v) => set('Panel labels', { labelStyle: v })} />
            </Field>
            <NumField label="Size" unit="pt" step={1} min={LABEL_PT_MIN} max={LABEL_PT_MAX} disabled={layout.labelStyle === 'none'} value={layout.labelSizePt} onCommit={(v) => set('Panel label size', { labelSizePt: v })} />
          </Section>
        </aside>
      </div>
    </div>
  );
}
