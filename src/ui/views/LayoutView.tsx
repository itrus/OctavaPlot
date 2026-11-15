import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { drawLayout } from '../../chart/export/layoutExport';
import { clampFrame, FREE_MAX, GAP_MM_MAX, GRID_MAX, LABEL_PT_MAX, LEGEND_PT_MAX, LEGEND_PT_MIN, LABEL_PT_MIN, MARGIN_MM_MAX, pageMm, PERCENT_MAX, PERCENT_MIN, standardArrangements, sameArrangement } from '../../model/project/layout';
import type { Annotation, Drawing, FrameMm, Layout, LayoutArrangement, LayoutLegend, LayoutScaling, PanelLabelStyle } from '../../model/types';
import { ptToMm } from '../../model/units';
import { createAnnotation, FONT_FAMILY, PAGE_TEXT_LOOK } from '../../model/defaults';
import { annotationBox } from '../../chart/shared/scene/annotations';
import { AnnotationEditor } from '../inspector/sections/AnnotationEditor';
import { focusWhenShown } from '../inspector/common/pendingFocus';
import { useApp } from '../../state/AppContext';
import { addDrawing, addFreePanel, composeCommands, freeLayout, patchDrawings, patchLayout, removeDrawings, removeFreePanel, setFrame, setLayoutPanel } from '../../state/commands';
import { createDrawing, draggedPoints, DRAWING_WIDTH, pointsOfDrag, presetById, type ShapeDrag } from '../../model/graph/drawingPresets';
import { drawingElements, drawingPatchForPoints, drawnPoints, nudgeDrawings, type DrawingDrag } from '../../chart/shared/scene/drawings';
import { hitFromTarget, pointerToChartPt } from '../../chart/shared/scene/hitTest';
import { SceneElements } from '../../chart/shared/scene/SceneElements';
import { GraphicsMenu } from '../components/GraphicsMenu';
import { useCommand } from '../components/appCommands';
import { UndoRedo } from '../components/UndoRedo';
import { DrawingList } from '../inspector/sections/DrawingEditor';
import { ArrangementSketch, FreeSketch } from '../components/ArrangementSketch';
import { LAYOUT_PAGE_ICONS, PointerIcon, TextToolIcon } from '../components/icons';
import { LayoutExportPanel } from '../export/LayoutExportPanel';
import { InspectorShell, type InspectorKit } from '../inspector/common/InspectorShell';
import { Check, ColorInput, Field, NumField, Section, SelectInput, TextInput } from '../inspector/common/controls';

type LayoutInspectorPage = 'page' | 'panels' | 'graphs' | 'legend' | 'notes' | 'export';
const LAYOUT_PAGES: readonly LayoutInspectorPage[] = ['page', 'panels', 'graphs', 'legend', 'notes', 'export'];
/** The rail of the inspector of a layout, as the graph has one: the sheet, the boxes on it, the master legend, and Export at the foot. */
const LAYOUT_KIT: InspectorKit<LayoutInspectorPage> = {
  name: 'Layout',
  pages: [
    { id: 'page', label: 'Page', title: 'Page: orientation, background, title, margin and panel labels', heading: 'Format Page' },
    { id: 'panels', label: 'Panels', title: 'Panels: how the graphs are arranged on the page', heading: 'Format Panels' },
    { id: 'graphs', label: 'Graphs', title: 'Graphs: the graph in each panel and the size of the graphs', heading: 'Format Graphs' },
    { id: 'legend', label: 'Legend', title: 'Legend of the page', heading: 'Format Legend' },
    { id: 'notes', label: 'Notes', title: 'Notes: texts placed on the page', heading: 'Format Notes' },
    { id: 'export', label: 'Export', title: 'Export this page as a picture or a vector file', heading: 'Export Layout' },
  ],
  icons: LAYOUT_PAGE_ICONS,
};

/** What choosing Array starts with; the numbers across and down are then typed. */
const ARRAY_START: LayoutArrangement = { kind: 'grid', cols: 3, rows: 2 };

const CANVAS_PAD = 24;
const SCROLLBAR_ROOM = 17;

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


/** A text of the page being dragged: where the pointer started, where the text was then, and where it is now (fractions of the page). */
interface NoteDrag {
  id: string;
  startX: number;
  startY: number;
  from: { xFrac: number; yFrac: number };
  now: { xFrac: number; yFrac: number };
}

/** Shapes and lines of the page being moved (all the selected ones) or resized by a handle (pt of the page). */
/** What switching on the master legend starts with. */
const DEFAULT_PAGE_LEGEND: LayoutLegend = { position: 'bottom', fontSizePt: 9, hideGraphLegends: true };

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
  const { project, run, layoutZoom, setLayoutZoom } = useApp();
  // The shapes and lines are drawn by the page itself, over the picture, so that they follow a drag at once (an export draws them in the picture).
  const drawing = useMemo(() => drawLayout(layout, project, { withoutDrawings: true }), [layout, project]);
  const [selected, setSelected] = useState(0);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [inspPage, setInspPage] = useState<LayoutInspectorPage>('page');
  // Texts on the page: the pointer tool (Select picks and drags; Text places a new text where the page is clicked), the selected text and a text being dragged.
  // `draw:<preset>` draws a shape or line where the page is dragged. What is selected is kept here: texts and objects of the page, one or several.
  const [tool, setTool] = useState<string>('select');
  // The Format menu chooses the page of the inspector.
  useCommand('layout-page', (p) => LAYOUT_PAGES.includes(p as LayoutInspectorPage) && setInspPage(p as LayoutInspectorPage));
  const drawPreset = tool.startsWith('draw:') ? presetById(tool.slice(5)) : undefined;
  const [picked, setPicked] = useState<string[]>([]);
  const [noteDrag, setNoteDrag] = useState<NoteDrag | null>(null);
  const [draft, setDraft] = useState<{ a: { x: number; y: number }; b: { x: number; y: number } } | null>(null);
  const [shapeDrag, setShapeDrag] = useState<ShapeDrag | null>(null);
  const shapesRef = useRef<SVGSVGElement>(null);
  const notes = layout.annotations ?? [];
  const shapes = layout.drawings ?? [];
  const owner = { layoutId: layout.id };
  const pickedNotes = notes.filter((n) => picked.includes(n.id));
  const pickedShapes = shapes.filter((d) => picked.includes(d.id));
  /** Select one text or object of the page; with Ctrl, Cmd or Shift add it to the selection or take it out. */
  const pick = (id: string, toggle: boolean) => setPicked(toggle ? (picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]) : [id]);

  // The inspector is the right panel of the app, the one a graph has: it is drawn into the app's own grid (a portal), because its
  // settings and the export belong to this page's state (the selected panel, the drawing).
  const [host, setHost] = useState<Element | null>(null);
  useEffect(() => setHost(document.querySelector('.app')), []);

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
  // Zoom 100% means the whole page fits the window; the slider in the status bar zooms relative to that, as it does for a graph.
  const fit = avail.w > 0 && avail.h > 0 ? Math.max(0.05, Math.min((avail.w - 2 * CANVAS_PAD) / drawing.widthPt, (avail.h - 2 * CANVAS_PAD) / drawing.heightPt)) : 0.5;
  const scale = fit * layoutZoom;
  // A page opens at "fit", and goes back to it when it is turned.
  useEffect(() => setLayoutZoom(1), [layout.id, layout.orientation, setLayoutZoom]);
  const pageW = drawing.widthPt * scale;
  const pageH = drawing.heightPt * scale;
  const mm = pageMm(layout.orientation);
  const a = layout.arrangement;
  const frames = a.kind === 'free' ? a.frames : [];
  const slot = Math.min(selected, Math.max(0, frames.length - 1));

  const set = (label: string, patch: Partial<Omit<Layout, 'id' | 'panels'>>, key?: string) => run(label, patchLayout(layout.id, patch), key);

  // The texts of the page are kept on the layout; each change is one undoable step (changes with the same key merge, as typing does).
  const setNotes = (label: string, list: Annotation[], key?: string) => run(label, patchLayout(layout.id, { annotations: list }), key);
  const patchNote = (id: string, label: string, patch: Partial<Annotation>, key?: string) => setNotes(label, notes.map((n) => (n.id === id ? { ...n, ...patch } : n)), key);
  const addNote = (xFrac: number, yFrac: number) => {
    const added = createAnnotation(PAGE_TEXT_LOOK, xFrac, yFrac);
    setNotes('Add text', [...notes, added]);
    setPicked([added.id]);
    focusWhenShown(`annotation-text:${added.id}`);
    setInspPage('notes');
  };
  const placeText = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    addNote((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    setTool('select');
  };
  const startNoteDrag = (e: PointerEvent, n: Annotation) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setInspPage('notes');
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      pick(n.id, true);
      return;
    }
    if (!picked.includes(n.id)) setPicked([n.id]);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setNoteDrag({ id: n.id, startX: e.clientX, startY: e.clientY, from: { xFrac: n.xFrac, yFrac: n.yFrac }, now: { xFrac: n.xFrac, yFrac: n.yFrac } });
  };
  const moveNoteDrag = (e: PointerEvent) => {
    if (!noteDrag) return;
    const clamp = (v: number) => Math.min(0.98, Math.max(0, v));
    setNoteDrag({ ...noteDrag, now: { xFrac: clamp(noteDrag.from.xFrac + (e.clientX - noteDrag.startX) / pageW), yFrac: clamp(noteDrag.from.yFrac + (e.clientY - noteDrag.startY) / pageH) } });
  };
  const endNoteDrag = () => {
    if (noteDrag && (noteDrag.now.xFrac !== noteDrag.from.xFrac || noteDrag.now.yFrac !== noteDrag.from.yFrac)) patchNote(noteDrag.id, 'Move text', noteDrag.now);
    setNoteDrag(null);
  };
  // Shapes and lines: drawn with the tool of the Graphics menu, picked and moved with Select, resized by their handles.
  const W = drawing.widthPt;
  const H = drawing.heightPt;
  const pagePt = (e: PointerEvent) => (shapesRef.current ? pointerToChartPt(shapesRef.current, e.clientX, e.clientY, W, H) : { x: 0, y: 0 });
  const startShapes = (e: PointerEvent) => {
    if (e.button !== 0) return;
    if (drawPreset) {
      e.preventDefault();
      e.stopPropagation();
      const pt = pagePt(e);
      setDraft({ a: pt, b: pt });
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      return;
    }
    const hit = hitFromTarget(e.target, shapesRef.current);
    if ((hit.kind !== 'drawing' && hit.kind !== 'handle') || !hit.objectId) return;
    const d = shapes.find((x) => x.id === hit.objectId);
    if (!d) return;
    e.stopPropagation();
    setInspPage('notes');
    if (hit.kind === 'drawing' && (e.ctrlKey || e.metaKey || e.shiftKey)) {
      pick(d.id, true);
      return;
    }
    const ids = hit.kind === 'handle' || !picked.includes(d.id) ? [d.id] : picked;
    if (!picked.includes(d.id)) setPicked([d.id]);
    const items = shapes.filter((x) => ids.includes(x.id)).map((x) => {
      const [from, to] = drawnPoints(x, W, H);
      return { drawing: x, from, to };
    });
    setShapeDrag({ mode: hit.kind === 'handle' ? (hit.handle ?? 'to') : 'move', start: pagePt(e), delta: { x: 0, y: 0 }, items });
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const moveShapes = (e: PointerEvent) => {
    if (draft) setDraft({ ...draft, b: pagePt(e) });
    else if (shapeDrag) {
      const pt = pagePt(e);
      setShapeDrag({ ...shapeDrag, delta: { x: pt.x - shapeDrag.start.x, y: pt.y - shapeDrag.start.y } });
    }
  };
  const endShapes = (e: PointerEvent) => {
    // Where the pointer is let go is the end of a drag, whether or not a move was reported there.
    const last = e.type === 'pointerup' ? pagePt(e) : null;
    if (draft && drawPreset) {
      const [a, b] = pointsOfDrag(drawPreset, draft.a, last ?? draft.b);
      const made = createDrawing(drawPreset, { xFrac: a.x / W, yFrac: a.y / H }, { xFrac: b.x / W, yFrac: b.y / H }, { ...PAGE_TEXT_LOOK, widthPt: DRAWING_WIDTH.page });
      run(`Add ${drawPreset.label.toLowerCase()}`, addDrawing(owner, made));
      setPicked([made.id]);
      if (made.text !== undefined) focusWhenShown(`drawing-text:${made.id}`);
      setInspPage('notes');
      setTool('select');
    }
    setDraft(null);
    const shapesMoved = shapeDrag && last ? { ...shapeDrag, delta: { x: last.x - shapeDrag.start.x, y: last.y - shapeDrag.start.y } } : shapeDrag;
    if (shapesMoved && Math.hypot(shapesMoved.delta.x, shapesMoved.delta.y) >= 1) {
      const moves = shapesMoved.items.map((it) => {
        const q = draggedPoints(it, shapesMoved);
        return patchDrawings(owner, [it.drawing.id], drawingPatchForPoints(it.drawing, q.from, q.to, W, H));
      });
      run(shapesMoved.mode === 'move' ? 'Move shape' : 'Resize shape', composeCommands(...moves));
    }
    setShapeDrag(null);
  };
  /** Delete the selected texts and objects of the page (one undo step). */
  const deletePicked = () => {
    const ids = new Set(picked);
    run(picked.length === 1 ? 'Delete' : 'Delete selected', composeCommands(...(pickedNotes.length > 0 ? [patchLayout(layout.id, { annotations: notes.filter((n) => !ids.has(n.id)) })] : []), ...(pickedShapes.length > 0 ? [removeDrawings(owner, pickedShapes.map((d) => d.id))] : [])));
    setPicked([]);
  };
  /** Move the selected texts and objects by a step (fractions of the page; an arrow key). */
  const nudgePicked = (dx: number, dy: number) => {
    const clamp = (v: number) => Math.min(0.98, Math.max(0, Math.round(v * 1000) / 1000));
    const texts = pickedNotes.length > 0 ? [patchLayout(layout.id, { annotations: notes.map((n) => (picked.includes(n.id) ? { ...n, xFrac: clamp(n.xFrac + dx), yFrac: clamp(n.yFrac + dy) } : n)) })] : [];
    const objects = nudgeDrawings(pickedShapes, dx, dy, W, H).map((m) => patchDrawings(owner, [m.id], m.patch));
    run('Move', composeCommands(...texts, ...objects), `page:${picked.join()}:nudge`);
  };
  const shapeDrafts: Array<{ drawing: Drawing; drag: DrawingDrag }> = [];
  if (draft && drawPreset) {
    const [a, b] = pointsOfDrag(drawPreset, draft.a, draft.b);
    const d = createDrawing(drawPreset, { xFrac: 0, yFrac: 0 }, { xFrac: 0, yFrac: 0 }, { ...PAGE_TEXT_LOOK, widthPt: DRAWING_WIDTH.page }, 'draft');
    shapeDrafts.push({ drawing: d, drag: { id: d.id, from: a, to: b } });
  }
  if (shapeDrag) for (const it of shapeDrag.items) shapeDrafts.push({ drawing: it.drawing, drag: { id: it.drawing.id, ...draggedPoints(it, shapeDrag) } });

  /** The outline of a text on the page, as percentages of the page: the box the text takes, with a little room round it. */
  const noteBox = (n: Annotation) => {
    const at = noteDrag?.id === n.id ? noteDrag.now : n;
    const b = annotationBox(n, at.xFrac * drawing.widthPt, at.yFrac * drawing.heightPt, FONT_FAMILY);
    const pad = 4;
    return { left: `${((b.x - pad) / drawing.widthPt) * 100}%`, top: `${((b.y - pad) / drawing.heightPt) * 100}%`, width: `${((b.w + 2 * pad) / drawing.widthPt) * 100}%`, height: `${((b.h + 2 * pad) / drawing.heightPt) * 100}%` };
  };

  // The box shown for a panel is the graph in it (the part that is visible, when it is cut off), so it shrinks and grows
  // with the scaling of the graphs; an empty panel shows its own box.
  const shown = (i: number): FrameMm => {
    const g = drawing.arranged.placements[i]?.graph;
    const f = frames[i];
    if (!f) return { x: 0, y: 0, w: 1, h: 1 };
    return g ? intersect({ x: ptToMm(g.x), y: ptToMm(g.y), w: ptToMm(g.w), h: ptToMm(g.h) }, f) : f;
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

  const standards = standardArrangements(layout.orientation);
  const standard = standards.some((s) => sameArrangement(s.arrangement, a));
  // An array is a grid that is none of the standard ones.
  const isArray = a.kind === 'grid' && !standard;
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
    <div className="graph-view">
      <div className="toolbar">
        <UndoRedo />
        <span className="sep" aria-hidden="true" />
        <span className="switch-group tool-group" role="group" aria-label="Pointer tool">
          <button className={`switch icon-text${tool === 'select' ? ' on' : ''}`} aria-pressed={tool === 'select'} aria-label="Select" title="Select: click a text on the page to select it and open its settings; drag it to move it. Panels are moved under Panels (V)" onClick={() => setTool('select')}>
            <PointerIcon />
          </button>
          <button className={`switch icon-text${tool === 'text' ? ' on' : ''}`} aria-pressed={tool === 'text'} title="Text: click the page where the text should go (T; Escape cancels)" onClick={() => setTool(tool === 'text' ? 'select' : 'text')}>
            <TextToolIcon />
            Text
          </button>
          <GraphicsMenu active={drawPreset?.id ?? null} onPick={(id) => setTool(`draw:${id}`)} />
        </span>
      </div>
      <div className="layout-body">
        <div className="chart-scroller" ref={scrollerRef}>
          <div className="chart-wrap" style={{ width: pageW }}>
            <div
              className="layout-page-wrap"
              style={{ width: pageW, height: pageH }}
              tabIndex={0}
              aria-label="Page. V selects, T places a text, Escape cancels a tool, the arrow keys move the selected texts and shapes (Shift 5%, Alt 0.1%), Delete removes them."
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget || e.ctrlKey || e.metaKey) return;
                if (e.key.startsWith('Arrow') && picked.length > 0) {
                  const step = e.shiftKey ? 0.05 : e.altKey ? 0.001 : 0.01;
                  nudgePicked(e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0, e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0);
                } else if (e.altKey) return;
                else if (e.key === 'Escape') {
                  setTool('select');
                  setDraft(null);
                  setPicked([]);
                } else if (e.key === 'v' || e.key === 'V') setTool('select');
                else if (e.key === 't' || e.key === 'T') setTool('text');
                else if ((e.key === 'Delete' || e.key === 'Backspace') && picked.length > 0) deletePicked();
                else return;
                e.preventDefault();
              }}
              onPointerDown={(e) => {
                // A click on the page away from a text or a shape lets go of what is selected.
                if (tool === 'select' && !(e.target as Element).closest('.layout-note, .layout-drawings [data-hit]')) setPicked([]);
              }}
            >
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
              <svg
                ref={shapesRef}
                className={`layout-drawings${drawPreset ? ' placing' : ''}`}
                viewBox={`0 0 ${W} ${H}`}
                preserveAspectRatio="none"
                onPointerDown={startShapes}
                onPointerMove={moveShapes}
                onPointerUp={endShapes}
                onPointerCancel={endShapes}
              >
                <SceneElements nodes={drawingElements(shapes, W, H, undefined, FONT_FAMILY, shapeDrafts)} editor selectedAnnotations={new Set(picked)} />
              </svg>
              {notes.length > 0 && (
                <div className="layout-notes" onPointerMove={moveNoteDrag} onPointerUp={endNoteDrag} onPointerCancel={endNoteDrag}>
                  {notes.map((n) => (
                    <div key={n.id} className={`layout-note${picked.includes(n.id) ? ' selected' : ''}`} style={noteBox(n)} title="Drag to move; its settings are under Notes" onPointerDown={(e) => startNoteDrag(e, n)} />
                  ))}
                </div>
              )}
              {tool === 'text' && <div className="layout-place-text" onPointerDown={placeText} aria-hidden="true" />}
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
        {host && createPortal(
          <div className="inspector-host">
            <InspectorShell kit={LAYOUT_KIT} nav={{ page: inspPage, setPage: setInspPage, pages: LAYOUT_PAGES, parts: [], setPart: () => {} }}>
              {inspPage === 'page' && (
                <>
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
            <Field label="Transparent background" hint="On: the page has no colour of its own (SVG and PNG are transparent; a PDF page shows the white of the paper)">
              <Check checked={layout.background === null} onChange={(v) => set('Page background', { background: v ? null : '#ffffff' })} ariaLabel="Transparent background" />
            </Field>
            {layout.background !== null && (
              <Field label="Background colour">
                <ColorInput value={layout.background} onChange={(v) => set('Page background', { background: v })} />
              </Field>
            )}
            <Field label="Title on top of the page">
              <Check checked={layout.showTitle} onChange={(v) => set('Page title', v && layout.title.trim() === '' ? { showTitle: v, title: layout.name } : { showTitle: v })} ariaLabel="Title on top of the page" />
            </Field>
            {layout.showTitle && (
              <Field label="Title">
                <TextInput value={layout.title} onChange={(v) => set('Page title text', { title: v }, 'layout:title')} placeholder="Title" />
              </Field>
            )}
            <NumField label="Margin" unit="mm" step={1} min={0} max={MARGIN_MM_MAX} value={layout.marginMm} disabled={a.kind === 'free'} note={a.kind === 'free' ? 'Free placement ignores the margin: place the boxes where you want them.' : null} onCommit={(v) => set('Page margin', { marginMm: v })} />
          </Section>
          <Section title="Panel labels">
            <Field label="Style">
              <SelectInput<PanelLabelStyle> value={layout.labelStyle} options={[...LABEL_STYLES]} onChange={(v) => set('Panel labels', { labelStyle: v })} />
            </Field>
            <NumField label="Size" unit="pt" step={1} min={LABEL_PT_MIN} max={LABEL_PT_MAX} disabled={layout.labelStyle === 'none'} value={layout.labelSizePt} onCommit={(v) => set('Panel label size', { labelSizePt: v })} />
          </Section>
                </>
              )}
              {inspPage === 'panels' && (
                <>
          <Section title="Arrangement of graphs">
            <div className="chart-type-grid" role="radiogroup" aria-label="Arrangement">
              {standards.map((s) => {
                const on = sameArrangement(s.arrangement, a);
                return (
                  <button key={s.id} role="radio" aria-checked={on} className={`gallery-item${on ? ' selected' : ''}`} onClick={() => !on && set('Arrangement', { arrangement: s.arrangement })}>
                    <ArrangementSketch arrangement={s.arrangement} orientation={layout.orientation} />
                    <span className="gallery-caption">{s.label}</span>
                  </button>
                );
              })}
              <button role="radio" aria-checked={isArray} className={`gallery-item${isArray ? ' selected' : ''}`} title="Any number of graphs across and down, up to 6 × 6" onClick={() => !isArray && set('Arrangement', { arrangement: ARRAY_START })}>
                <ArrangementSketch arrangement={isArray ? a : ARRAY_START} orientation={layout.orientation} />
                <span className="gallery-caption">{isArray && a.kind === 'grid' ? `Array ${a.cols} × ${a.rows}` : 'Array'}</span>
              </button>
              <button role="radio" aria-checked={a.kind === 'free'} className={`gallery-item${a.kind === 'free' ? ' selected' : ''}`} title="Boxes you drag and resize on the page, or type in mm" onClick={() => a.kind !== 'free' && run('Free placement', freeLayout(layout.id))}>
                <FreeSketch orientation={layout.orientation} />
                <span className="gallery-caption">Free placement</span>
              </button>
            </div>
            {a.kind === 'grid' && (
              <>
                <NumField label="Graphs across" step={1} min={1} max={GRID_MAX} value={a.cols} onCommit={(v) => set('Arrangement', { arrangement: { kind: 'grid', cols: Math.round(v), rows: a.rows } })} />
                <NumField label="Graphs down" step={1} min={1} max={GRID_MAX} value={a.rows} onCommit={(v) => set('Arrangement', { arrangement: { kind: 'grid', cols: a.cols, rows: Math.round(v) } })} />
                <NumField label="Space between" unit="mm" step={1} min={0} max={GAP_MM_MAX} value={layout.gapMm} onCommit={(v) => set('Space between panels', { gapMm: v })} />
              </>
            )}
            {a.kind === 'free' && current && (
              <>
                <div className="muted small">Drag a box on the page to move it, or a corner to resize it. Choose a standard arrangement above to go back to a grid.</div>
                <Field label="Selected panel">
                  <SelectInput<string> dropdown value={String(slot)} options={frames.map((_, i) => ({ value: String(i), label: `Panel ${drawing.arranged.placements[i]?.label || i + 1}` }))} onChange={(v) => setSelected(Number(v))} />
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
                </>
              )}
              {inspPage === 'graphs' && (
                <>
          <Section title="Graphs in the panels">
            {layout.panels.map((id, i) => (
              <Field key={i} label={`Panel ${drawing.arranged.placements[i]?.label || i + 1}`}>
                <SelectInput<string> dropdown
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
                </>
              )}
              {inspPage === 'legend' && (
          <Section title="Legend of the page">
            <Field label="Master legend" hint="One legend for the page, made from the legends of its graphs (the same name and look once). It takes its room from the panels; with free placement, keep the boxes clear of the band along the edge.">
              <Check checked={layout.legend !== undefined} onChange={(v) => set('Page legend', { legend: v ? DEFAULT_PAGE_LEGEND : undefined })} ariaLabel="Master legend" />
            </Field>
            {layout.legend && (
              <>
                <Field label="Place">
                  <SelectInput<LayoutLegend['position']> value={layout.legend.position} options={[{ value: 'bottom', label: 'Along the bottom' }, { value: 'right', label: 'Along the right edge' }]} onChange={(v) => set('Page legend place', { legend: { ...layout.legend!, position: v } })} />
                </Field>
                <NumField label="Text size" unit="pt" step={1} min={LEGEND_PT_MIN} max={LEGEND_PT_MAX} value={layout.legend.fontSizePt} onCommit={(v) => set('Page legend size', { legend: { ...layout.legend!, fontSizePt: v } })} />
                <Field label="Graphs without their own legend" hint="On: the graphs on the page are drawn without a legend and their plot takes its room. Graphs whose legend is switched off give no entries.">
                  <Check checked={layout.legend.hideGraphLegends} onChange={(v) => set('Page legend in graphs', { legend: { ...layout.legend!, hideGraphLegends: v } })} ariaLabel="Graphs without their own legend" />
                </Field>
              </>
            )}
          </Section>
              )}
              {inspPage === 'notes' && (
                <>
                <Section title="Shapes and lines">
                  <DrawingList
                    drawings={shapes}
                    picked={picked}
                    onPick={(id, toggle) => (!toggle && picked.length === 1 && picked[0] === id ? setPicked([]) : pick(id, toggle))}
                    onPatch={(ids, label, patch, key) => run(label, patchDrawings(owner, ids, patch), key)}
                    onRemove={(ids) => {
                      run(ids.length === 1 ? 'Delete shape' : 'Delete shapes', removeDrawings(owner, ids));
                      setPicked(picked.filter((x) => !ids.includes(x)));
                    }}
                    fontLabel="Arial"
                  />
                </Section>
                <Section title="Texts on the page">
                  <div className="button-row">
                    <button onClick={() => addNote(0.4, 0.05)}>+ Add text</button>
                  </div>
                  {notes.length === 0 && <div className="muted small">No texts. Choose Text on the toolbar and click the page where the text should go, or use the button above. A text can be dragged on the page.</div>}
                  {notes.map((n) => (
                    <div key={n.id} className={`annotation-card${picked.includes(n.id) ? ' selected' : ''}`}>
                      {!picked.includes(n.id) && (
                        <button className="list-item" onClick={(e) => (!(e.ctrlKey || e.metaKey || e.shiftKey) && picked.length === 1 && picked[0] === n.id ? setPicked([]) : pick(n.id, e.ctrlKey || e.metaKey || e.shiftKey))}>
                          {n.text.split('\n')[0] || '(empty)'}
                        </button>
                      )}
                      {picked.includes(n.id) && (
                        <AnnotationEditor
                          annotation={n}
                          fontLabel="Arial"
                          onPatch={(label, patch, key) => patchNote(n.id, label, patch, key)}
                          onDelete={() => {
                            setNotes('Delete text', notes.filter((x) => x.id !== n.id));
                            setPicked(picked.filter((x) => x !== n.id));
                          }}
                        />
                      )}
                    </div>
                  ))}
                </Section>
                </>
              )}
              {inspPage === 'export' && <LayoutExportPanel layout={layout} drawing={drawing} />}
            </InspectorShell>
          </div>,
          host,
        )}
      </div>
    </div>
  );
}
