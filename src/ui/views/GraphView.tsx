import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { buildAnyModelCached, ChartCanvas, chartTexts } from '../../chart/anyModel';
import { hitFromTarget, pointerToChartPt } from '../../chart/shared/scene/hitTest';
import { groupedTooltipLines, heatTooltipLines, histTooltipLines, pieTooltipLines, tooltipLines, xyTooltipLines } from '../../chart/tooltip';
import type { PreparedChart } from '../../model/table/preparedChart';
import { useApp } from '../../state/AppContext';
import { patchAnnotation, removeChart, resetAllDataSets, unlinkChart } from '../../state/commands';
import { exportPixels } from '../../chart/export/pngDpi';
import { printSizeWarnings } from '../../chart/export/printSize';
import { exportStatusText } from '../export/exportJob';
import { ExportDialog } from '../export/ExportDialog';
import { useExportJob } from '../export/useExportJob';
import { downloadBlob, exportFileName } from '../../util/download';
import { DeleteIcon, ResetIcon } from '../components/icons';
import { inspectorTargetFor } from '../inspector/common/nav';

/** Space kept around the chart inside the canvas, in px. */
const CANVAS_PAD = 24;
const SCROLLBAR_ROOM = 17;

export function GraphView({ prepared }: { prepared: PreparedChart }) {
  const { chart, table, fit: curve } = prepared;
  const { project, selection, setSelection, run, setStatus, zoom, setZoom, settings, fitRequest, navigateInspector } = useApp();
  const any = useMemo(() => buildAnyModelCached(chart, table, curve), [chart, table, curve]);
  const model = any.model;
  const svgRef = useRef<SVGSVGElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; lines: string[] } | null>(null);
  const [drag, setDrag] = useState<{ id: string; xFrac: number; yFrac: number; dx: number; dy: number; moved: boolean } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

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

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const hit = hitFromTarget(e.target, svgRef.current);
    // The inspector goes to the settings of whatever was clicked.
    const target = inspectorTargetFor(hit);
    if (target) navigateInspector(target);
    if (hit.kind === 'annotation' && hit.annotationId && svgRef.current) {
      const a = chart.annotations.find((x) => x.id === hit.annotationId);
      if (!a) return;
      const pt = pointerToChartPt(svgRef.current, e.clientX, e.clientY, model.widthPt, model.heightPt);
      setSelection({ kind: 'annotation', annotationId: a.id });
      setDrag({ id: a.id, xFrac: a.xFrac, yFrac: a.yFrac, dx: pt.x - a.xFrac * model.widthPt, dy: pt.y - a.yFrac * model.heightPt, moved: false });
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      setTip(null);
    } else if (hit.groupId && hit.objectId && (hit.kind === 'point' || hit.kind === 'label') && !hit.objectId.endsWith(':mean')) {
      // Mean markers have no row of their own; they select the data set.
      setSelection({ kind: 'point', groupId: hit.groupId, pointId: hit.objectId });
    } else if (hit.groupId && hit.kind !== 'background') {
      setSelection({ kind: 'group', groupId: hit.groupId });
    } else {
      setSelection({ kind: 'chart' });
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return;
    if (drag) {
      const pt = pointerToChartPt(svg, e.clientX, e.clientY, model.widthPt, model.heightPt);
      const clamp = (v: number) => Math.min(0.98, Math.max(0, v));
      setDrag({ ...drag, xFrac: clamp((pt.x - drag.dx) / model.widthPt), yFrac: clamp((pt.y - drag.dy) / model.heightPt), moved: true });
      return;
    }
    const hit = hitFromTarget(e.target, svg);
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

  const endDrag = () => {
    if (drag?.moved) {
      run('Move annotation', patchAnnotation(chart.id, drag.id, { xFrac: drag.xFrac, yFrac: drag.yFrac }));
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
          disabled={exportJob.busy}
          onClick={() => setExportOpen(true)}
          title="Export this graph: format, resolution, size, fonts and warnings are shown first"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M8 2v8M4.8 7 8 10.2 11.2 7M2.5 13.5h11" />
          </svg>
          Export
        </button>
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
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onPointerLeave={() => setTip(null)}
          >
            <ChartCanvas ref={svgRef} chart={chart} any={any} editor={{ selection, dragging: drag }} cssWidth={`${cssW}px`} cssHeight={`${cssH}px`} />
          </div>
          {tip && (
            <div className="tooltip" style={{ left: tip.x, top: tip.y }}>
              {tip.lines.map((l, i) => (
                <div key={i} className={i === 0 ? 'tip-title' : ''}>{l}</div>
              ))}
            </div>
          )}
          {model.warnings.length > 0 && (
            <ul className="warnings" aria-label="Chart warnings">
              {model.warnings.map((w) => (
                <li key={w}>⚠ {w}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
