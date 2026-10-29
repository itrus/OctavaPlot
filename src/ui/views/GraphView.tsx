import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { buildAnyModelCached, ChartCanvas, chartTexts, fitsPendingOf, previewDotCount } from '../../chart/anyModel';
import { useFitsVersion } from '../components/useFitsVersion';
import { CHROME_STOPS, type ChromeStop, describeFocus, extendAnnotations, extendGroups, extendPoints, nextFocus, selectableMarks } from '../../chart/selectionOrder';
import { toggleGroupSelection } from '../../model/graph/selection/scope';
import { selectedAnnotationIds, selectedPoints, toggleAnnotationSelection, togglePointSelection } from '../../model/graph/selection/multi';
import { dragLabelPatch } from '../inspector/common/pointOverrideUi';
import { densePreviewNote, isDense, nearestDot } from '../../chart/shared/scene/denseDots';
import { hitFromTarget, type HitTarget, pointerToChartPt } from '../../chart/shared/scene/hitTest';
import { groupedTooltipLines, heatTooltipLines, histTooltipLines, pieTooltipLines, tooltipLines, xyTooltipLines } from '../../chart/tooltip';
import type { PreparedChart } from '../../model/table/preparedChart';
import { useApp } from '../../state/AppContext';
import { composeCommands, patchAnnotation, patchPointStyle, removeChart, resetAllDataSets, unlinkChart } from '../../state/commands';
import { exportPixels } from '../../chart/export/pngDpi';
import { printSizeWarnings } from '../../chart/export/printSize';
import { exportStatusText } from '../export/exportJob';
import { annotationPlacer, drawnFractions, nudgePatches, patchForMove } from '../../chart/shared/scene/annotationPlace';
import { ExportDialog } from '../export/ExportDialog';
import { useExportJob } from '../export/useExportJob';
import { downloadBlob, exportFileName } from '../../util/download';
import { DeleteIcon, ResetIcon } from '../components/icons';
import { inspectorTargetFor } from '../inspector/common/nav';
import type { Box } from '../../chart/shared/parts/labels';

/** Space kept around the chart inside the canvas, in px. */
const CANVAS_PAD = 24;
const SCROLLBAR_ROOM = 17;

export function GraphView({ prepared }: { prepared: PreparedChart }) {
  const { chart, table, fit: curve } = prepared;
  const { project, selection, setSelection, run, setStatus, zoom, setZoom, settings, fitRequest, navigateInspector } = useApp();
  // A fit that takes long is made in a worker: the graph is drawn without it (and says so) until useFitsVersion changes.
  const fitsVersion = useFitsVersion();
  const any = useMemo(() => buildAnyModelCached(chart, table, curve, { deferFits: true }), [chart, table, curve, fitsVersion]);
  const fitsPending = fitsPendingOf(any);
  const model = any.model;
  const svgRef = useRef<SVGSVGElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; lines: string[] } | null>(null);
  const [drag, setDrag] = useState<{ id: string; xFrac: number; yFrac: number; dx: number; dy: number; moved: boolean } | null>(null);
  // A point label being dragged: where the pointer started and the labels it moves, each with its point and its box when the drag began.
  const labelDrag = useRef<{ start: { x: number; y: number }; items: Array<{ id: string; cx: number; cy: number; box: Box }>; moved: boolean } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  // The part of the chart besides its data sets that the keyboard is on (title, legend, an axis), and its outline in the surface.
  const [stop, setStop] = useState<ChromeStop | null>(null);
  const [stopBox, setStopBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  // Zoom 100% means the whole chart fits the window; the slider zooms relative to that.
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    // Outer size less room for the scrollbars: it must not change when a scrollbar appears, or the chart would refit and rescale.
    const measure = () => setAvail({ w: el.offsetWidth - SCROLLBAR_ROOM, h: el.offsetHeight - SCROLLBAR_ROOM });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // A chart opens at "fit", and goes back to it when its dimensions change (a typed size, a preset, an aspect lock, undo).
  useEffect(() => setZoom(1), [chart.id, chart.widthPx, chart.heightPx, setZoom]);
  // The fit scale (screen px per chart px) is taken when a chart opens, when its dimensions change, when the window is
  // resized and when Fit is pressed, so the page always fills the window. Only the screen scale changes: the elements keep
  // their sizes in pt on the page.
  const sizeRef = useRef({ w: chart.widthPx, h: chart.heightPx });
  sizeRef.current = { w: chart.widthPx, h: chart.heightPx };
  const [fit, setFit] = useState(1);
  useEffect(() => {
    if (avail.w <= 0 || avail.h <= 0) return;
    const { w, h } = sizeRef.current;
    setFit(Math.max(0.05, Math.min((avail.w - 2 * CANVAS_PAD) / w, (avail.h - 2 * CANVAS_PAD) / h)));
  }, [chart.id, chart.widthPx, chart.heightPx, avail.w, avail.h, fitRequest]);
  const cssW = chart.widthPx * fit * zoom;
  const cssH = chart.heightPx * fit * zoom;

  // In a simplified preview (a graph of very many dots) the dots of one look are one shape: it names the data set, and the dot is the one under the pointer.
  const hitAt = (e: PointerEvent): HitTarget => {
    const hit = hitFromTarget(e.target, svgRef.current);
    if (hit.kind !== 'point' || !hit.groupId || hit.objectId || any.family !== 'column' || !svgRef.current) return hit;
    const pt = pointerToChartPt(svgRef.current, e.clientX, e.clientY, model.widthPt, model.heightPt);
    const dot = nearestDot(any.model.groups.find((g) => g.groupId === hit.groupId)?.points ?? [], (p) => any.model.orient.toScreen(p.cx, p.cy), pt.x, pt.y);
    return dot ? { ...hit, objectId: dot.id } : hit;
  };
  const dots = previewDotCount(any, chart);

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const hit = hitAt(e);
    setStop(null);
    // The inspector goes to the settings of whatever was clicked.
    const target = inspectorTargetFor(hit);
    if (target) navigateInspector(target);
    const modified = e.ctrlKey || e.metaKey || e.shiftKey;
    const pickable = hit.groupId && hit.objectId && (hit.kind === 'point' || hit.kind === 'label') && !hit.objectId.endsWith(':mean');
    if (hit.kind === 'annotation' && hit.annotationId && svgRef.current) {
      const a = chart.annotations.find((x) => x.id === hit.annotationId);
      if (!a) return;
      // Ctrl, Cmd or Shift on an annotation adds it to the selection, or takes it out: they are then edited together.
      if (modified) {
        setSelection(toggleAnnotationSelection(selection, a.id, chart.annotations.map((x) => x.id)));
        return;
      }
      // Pressing on one of several selected annotations keeps them selected (the arrow keys move them together).
      if (selection.kind === 'annotations' && selection.annotationIds.includes(a.id)) return;
      const pt = pointerToChartPt(svgRef.current, e.clientX, e.clientY, model.widthPt, model.heightPt);
      setSelection({ kind: 'annotation', annotationId: a.id });
      // A text anchored to data starts from where it is drawn, which the axes decide; the others from their fractions.
      const from = drawnFractions(a, annotationPlacer(any, model.widthPt, model.heightPt)) ?? { xFrac: a.xFrac, yFrac: a.yFrac };
      setDrag({ id: a.id, xFrac: from.xFrac, yFrac: from.yFrac, dx: pt.x - from.xFrac * model.widthPt, dy: pt.y - from.yFrac * model.heightPt, moved: false });
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      setTip(null);
    } else if (modified && pickable && (selection.kind === 'point' || selection.kind === 'points')) {
      // With points selected, Ctrl, Cmd or Shift on a point adds it to them, or takes it out.
      setSelection(togglePointSelection(selection, { groupId: hit.groupId as string, pointId: hit.objectId as string }));
    } else if (modified && hit.groupId && hit.kind !== 'background') {
      // Ctrl, Cmd or Shift on a data set adds it to the selection, or takes it out: the data sets are then edited together.
      setSelection(toggleGroupSelection(selection, hit.groupId, marks.map((m) => m.groupId)));
    } else if (pickable) {
      // Mean markers have no row of their own; they select the data set. Pressing on a label of several selected points keeps them.
      const pointId = hit.objectId as string;
      const several = selection.kind === 'points' && selection.points.some((p) => p.pointId === pointId);
      if (!several) setSelection({ kind: 'point', groupId: hit.groupId as string, pointId });
      // A label can be dragged: it is stored with its offset from the point (the labels of all selected points move together).
      if (hit.kind === 'label' && any.family === 'column' && svgRef.current) {
        const ids = several ? selectedPoints(selection).map((p) => p.pointId) : [pointId];
        const points = any.model.groups.flatMap((g) => g.points);
        const items = ids.flatMap((id) => {
          const item = any.model.labels.items.find((it) => it.id === id);
          const at = points.find((p) => p.id === id);
          return item && at ? [{ id, cx: at.cx, cy: at.cy, box: item.box }] : [];
        });
        if (items.length > 0) {
          labelDrag.current = { start: pointerToChartPt(svgRef.current, e.clientX, e.clientY, model.widthPt, model.heightPt), items, moved: false };
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          setTip(null);
        }
      }
    } else if (hit.groupId && hit.kind !== 'background') {
      setSelection({ kind: 'group', groupId: hit.groupId });
    } else {
      setSelection({ kind: 'chart' });
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return;
    const labels = labelDrag.current;
    if (labels) {
      const pt = pointerToChartPt(svg, e.clientX, e.clientY, model.widthPt, model.heightPt);
      const [dx, dy] = [pt.x - labels.start.x, pt.y - labels.start.y];
      // A click that moves a little is still a click.
      if (!labels.moved && Math.hypot(dx, dy) < 3) return;
      labels.moved = true;
      run('Move label', composeCommands(...labels.items.map((it) => patchPointStyle(chart.id, it.id, dragLabelPatch(it, it.box, dx, dy)))), `label-drag:${labels.items.map((it) => it.id).join()}`);
      return;
    }
    if (drag) {
      const pt = pointerToChartPt(svg, e.clientX, e.clientY, model.widthPt, model.heightPt);
      const clamp = (v: number) => Math.min(0.98, Math.max(0, v));
      setDrag({ ...drag, xFrac: clamp((pt.x - drag.dx) / model.widthPt), yFrac: clamp((pt.y - drag.dy) / model.heightPt), moved: true });
      return;
    }
    const hit = hitAt(e);
    const lines = any.family === 'column' ? tooltipLines(any.model, table, hit) : any.family === 'grouped' ? groupedTooltipLines(any.model, hit) : any.family === 'pie' ? pieTooltipLines(any.model, hit) : any.family === 'histogram' ? histTooltipLines(any.model, hit) : any.family === 'heatmap' ? heatTooltipLines(any.model, hit) : xyTooltipLines(any.model, table, hit);
    const box = wrapRef.current?.getBoundingClientRect();
    if (lines && box) {
      // The tooltip is kept inside the chart area: it flips to the other side of the pointer near the right or bottom edge.
      const [tw, th] = [Math.max(...lines.map((l) => l.length)) * 7 + 20, lines.length * 18 + 12];
      const x = e.clientX - box.left;
      const y = e.clientY - box.top;
      setTip({ x: x + 14 + tw > box.width ? Math.max(0, x - 14 - tw) : x + 14, y: y + 14 + th > box.height ? Math.max(0, y - 14 - th) : y + 14, lines });
    }
    else setTip(null);
  };

  // The keyboard selects what a click does: Left and Right between the data sets, Down and Up into and along the points, Escape back
  // to the whole chart, Enter to its settings. After the title, legend and axes come the annotations; on a selected annotation the arrows
  // move it (1% of the chart, Shift 5%, Alt 0.1%), Page Down and Page Up go to the next and previous one, and Shift with them adds it.
  // Shift with Down or Up adds the next point, as Shift with Left or Right adds the next data set.
  const marks = useMemo(() => selectableMarks(any), [any]);
  const noteIds = chart.annotations.map((a) => a.id);
  const pickedNotes = selectedAnnotationIds(selection);
  const selectedNotes = chart.annotations.filter((a) => pickedNotes.includes(a.id));
  const announcement = describeFocus(marks, { selection, stop }, undefined, chart.annotations);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Shortcuts (Ctrl+Z, Ctrl+S ...) belong to the app; so does everything while a dialog or another field has the keys.
    if (e.ctrlKey || e.metaKey || e.target !== e.currentTarget) return;
    if (selectedNotes.length > 0 && e.key.startsWith('Arrow')) {
      e.preventDefault();
      const step = e.shiftKey ? 0.05 : e.altKey ? 0.001 : 0.01;
      const dx = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0;
      const dy = e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0;
      const moves = nudgePatches(selectedNotes, annotationPlacer(any, model.widthPt, model.heightPt), dx, dy);
      run('Move annotation', composeCommands(...moves.map((m) => patchAnnotation(chart.id, m.id, m.patch))), `ann:${moves.map((m) => m.id).join()}:nudge`);
      return;
    }
    if (e.key === 'Enter') {
      const target = inspectorTargetFor({ kind: stop === 'legend' ? 'legend' : stop === 'chart-title' ? 'title' : stop ? 'axis' : selection.kind === 'annotation' || selection.kind === 'annotations' ? 'annotation' : selection.kind === 'chart' ? 'background' : 'bar' });
      if (target) {
        e.preventDefault();
        navigateInspector(target);
      }
      return;
    }
    // Shift with Left or Right grows the selection by the data set next to it; with Down or Up by the point next to the selected ones;
    // with Page Down or Page Up by the annotation next to the selected ones.
    if (e.shiftKey && !stop) {
      const paging = (e.key === 'PageDown' || e.key === 'PageUp') && selectedNotes.length > 0;
      const along = (selection.kind === 'point' || selection.kind === 'points') && (e.key === 'ArrowDown' || e.key === 'ArrowUp');
      const grown = paging ? extendAnnotations(noteIds, selection, e.key) : along ? extendPoints(marks, selection, e.key) : extendGroups(marks, selection, e.key);
      const taken = e.key === 'ArrowLeft' || e.key === 'ArrowRight' || paging || along;
      if (taken) e.preventDefault();
      if (grown) setSelection(grown);
      if (taken) return;
    }
    // The title, legend and axes are stops after the last data set; only those the chart draws are visited.
    const stops = CHROME_STOPS.filter((id) => svgRef.current?.querySelector(`[id="${id}"]`));
    const next = nextFocus(marks, stops, { selection, stop }, e.key, noteIds);
    if (next) {
      e.preventDefault();
      setStop(next.stop);
      setSelection(next.selection);
    }
  };

  // A click, or any other new selection, ends a stop; a stop is outlined on the chart so that it can be seen.
  useEffect(() => {
    if (selection.kind !== 'chart') setStop(null);
  }, [selection]);
  useLayoutEffect(() => {
    const el = stop && svgRef.current?.querySelector(`[id="${stop}"]`);
    const box = surfaceRef.current?.getBoundingClientRect();
    if (!el || !box) {
      setStopBox(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setStopBox({ left: r.left - box.left - 4, top: r.top - box.top - 4, width: r.width + 8, height: r.height + 8 });
  }, [stop, any, chart, cssW, cssH]);

  const endDrag = () => {
    labelDrag.current = null;
    if (drag?.moved) {
      const moved = chart.annotations.find((x) => x.id === drag.id);
      // A text anchored to data keeps the values at its new place, so it stays there when the axes change.
      if (moved) run('Move annotation', patchAnnotation(chart.id, drag.id, patchForMove(moved, annotationPlacer(any, model.widthPt, model.heightPt), drag.xFrac, drag.yFrac)));
    }
    setDrag(null);
  };

  // One export at a time: while one runs the Export button is disabled, and a second start is ignored.
  const exportJob = useExportJob(setStatus);
  const [exportOpen, setExportOpen] = useState(false);
  // The renderer behind export (react-dom/server) is loaded on first use, not at startup.
  const exportSvg = () =>
    exportJob.start({
      label: 'SVG',
      pixels: null,
      tooBigMessage: '',
      work: async (phase) => {
        const { chartToSvgString } = await import('../../chart/export/export');
        phase('encoding');
        downloadBlob(new Blob([chartToSvgString(chart, table, curve, { metadata: true })], { type: 'image/svg+xml' }), exportFileName(chart.name, 'svg', settings.timestampExports));
        return 'Exported SVG.';
      },
    });
  const exportRaster = (kind: 'png' | 'pdf') => {
    const dpi = kind === 'png' ? settings.pngDpi : settings.exportDpi;
    const { width: pw, height: ph } = exportPixels(chart, dpi);
    const name = kind.toUpperCase();
    return exportJob.start({
      label: name,
      pixels: { width: pw, height: ph },
      // Browsers limit the size of a canvas; a size above the limit fails or comes out blank.
      tooBigMessage: `${name} export at ${dpi} dpi needs ${pw} × ${ph} px, more than the browser can make. Make the chart smaller, lower the ${name} resolution in Settings, or export SVG.`,
      work: async (phase) => {
        const { chartToPngBlob, chartToPdfBlob } = await import('../../chart/export/export');
        phase('rasterizing');
        const blob = await (kind === 'png' ? chartToPngBlob(chart, table, dpi, curve) : chartToPdfBlob(chart, table, dpi, curve));
        phase('encoding');
        downloadBlob(blob, exportFileName(chart.name, kind, settings.timestampExports));
        return `Exported ${name}, ${pw} × ${ph} px (${dpi} dpi).`;
      },
    });
  };

  return (
    <div className="graph-view">
      <div className="toolbar">
        <button
          className="icon-text"
          onClick={() => {
            run('Reset settings', resetAllDataSets(chart.id));
            setStatus('Settings reset to defaults.');
          }}
          title="Reset the whole graph to a new graph's settings: data set styles, axes, grid, legend, fonts, colours, size. Kept: the title and axis titles, which data sets are shown and their order, annotations, reference lines and the chosen fit. Undo restores everything."
        >
          <ResetIcon />
          Reset
        </button>
        <button
          className="icon-text"
          onClick={() => {
            run('Delete graph', removeChart(chart.id));
            setStatus(`Deleted ${chart.name}. Undo (Ctrl+Z) restores it.`);
          }}
          title="Delete this graph (the data stay; it is also removed from layouts; can be undone)"
        >
          <DeleteIcon />
          Delete
        </button>
        {chart.linkedTo && (
          <button
            className="icon-text"
            onClick={() => {
              run('Unlink graph', unlinkChart(chart.id));
              setStatus('Unlinked: this graph no longer follows the format of the other one.');
            }}
            title={`Linked to ${project.charts.find((c) => c.id === chart.linkedTo)?.name ?? 'a graph'}: this graph follows its format, except for details you changed here. Click to stop following (settings stay as they are).`}
          >
            🔗 Unlink
          </button>
        )}
        <button
          className="icon-text toolbar-end"
          disabled={exportJob.busy || fitsPending > 0}
          onClick={() => setExportOpen(true)}
          title={fitsPending > 0 ? 'The curve is still being fitted: export is possible when it is done, so that the file holds the final fit' : 'Export this graph: format, resolution, size, fonts and warnings are shown first'}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M8 2v8M4.8 7 8 10.2 11.2 7M2.5 13.5h11" />
          </svg>
          Export
        </button>
        {fitsPending > 0 && <span className="toolbar-info export-status" role="status">Fitting the curve…</span>}
        {exportJob.busy && <span className="toolbar-info export-status" role="status">{exportStatusText(exportJob.state)}</span>}
      </div>
      {exportOpen && (
        <ExportDialog
          kind="graph"
          subject={{ name: chart.name, widthPx: chart.widthPx, heightPx: chart.heightPx, fontFamilies: [chart.fontFamily], texts: chartTexts(chart, any), warnings: model.warnings, printWidthMm: chart.printWidthMm ?? null, printWarnings: printSizeWarnings(chart) }}
          state={exportJob.state}
          onExport={() => (settings.exportFormat === 'svg' ? exportSvg() : exportRaster(settings.exportFormat === 'pdf' ? 'pdf' : 'png'))}
          onClose={() => setExportOpen(false)}
        />
      )}
      <div className="chart-scroller" ref={scrollerRef}>
        <div className="chart-wrap" ref={wrapRef} style={{ width: cssW }}>
          <div
            className="chart-surface"
            ref={surfaceRef}
            tabIndex={0}
            role="group"
            aria-label="Chart. Arrow keys select data sets and points, Escape selects the whole chart, Enter opens its settings. After the axes, the right arrow reaches the annotations; Page Down and Page Up step along them."
            onKeyDown={onKeyDown}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onPointerLeave={() => setTip(null)}
          >
            {stopBox && <div className="key-stop" style={stopBox} aria-hidden="true" />}
            <ChartCanvas ref={svgRef} chart={chart} any={any} editor={{ selection, dragging: drag }} preview cssWidth={`${cssW}px`} cssHeight={`${cssH}px`} />
          </div>
          <div className="visually-hidden" role="status" aria-live="polite">{announcement}</div>
          {tip && (
            <div className="tooltip" style={{ left: tip.x, top: tip.y }}>
              {tip.lines.map((l, i) => (
                <div key={i} className={i === 0 ? 'tip-title' : ''}>{l}</div>
              ))}
            </div>
          )}
          {(model.warnings.length > 0 || isDense(dots)) && (
            <ul className="warnings" aria-label="Chart warnings">
              {[...model.warnings, ...(isDense(dots) ? [densePreviewNote(dots)] : [])].map((w) => (
                <li key={w}>⚠ {w}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
