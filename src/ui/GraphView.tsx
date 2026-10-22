import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { ChartSvg } from '../chart/ChartSvg';
import { hitFromTarget, pointerToChartPt } from '../chart/hitTest';
import { buildChartModel } from '../chart/model';
import { tooltipLines } from '../chart/tooltip';
import type { Chart, DataTable } from '../model/types';
import { useApp } from '../state/AppContext';
import { patchAnnotation, resetAllDataSets } from '../state/commands';
import { downloadBlob, exportFileName } from '../util/download';
import { ResetIcon } from './icons';
import { inspectorTargetFor } from './inspector/nav';
import { UndoRedo } from './UndoRedo';

/** Space kept around the chart inside the canvas, in px. */
const CANVAS_PAD = 24;
const SCROLLBAR_ROOM = 17;

export function GraphView({ chart, table }: { chart: Chart; table: DataTable }) {
  const { selection, setSelection, run, setStatus, zoom, setZoom, settings, fitRequest, navigateInspector } = useApp();
  const model = useMemo(() => buildChartModel(chart, table), [chart, table]);
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
  // A chart opens at "fit".
  useEffect(() => setZoom(1), [chart.id, setZoom]);
  // The fit scale (screen px per chart px) is taken when a chart opens, when the window is resized and when Fit is
  // pressed, not when the chart's size is edited: changing the dimensions resizes the page, never the elements on it.
  const sizeRef = useRef({ w: chart.widthPx, h: chart.heightPx });
  sizeRef.current = { w: chart.widthPx, h: chart.heightPx };
  const [fit, setFit] = useState(1);
  useEffect(() => {
    if (avail.w <= 0 || avail.h <= 0) return;
    const { w, h } = sizeRef.current;
    setFit(Math.max(0.05, Math.min((avail.w - 2 * CANVAS_PAD) / w, (avail.h - 2 * CANVAS_PAD) / h)));
  }, [chart.id, avail.w, avail.h, fitRequest]);
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
    const lines = tooltipLines(model, table, hit);
    const box = wrapRef.current?.getBoundingClientRect();
    if (lines && box) setTip({ x: e.clientX - box.left + 14, y: e.clientY - box.top + 14, lines });
    else setTip(null);
  };

  const endDrag = () => {
    if (drag?.moved) {
      run('Move annotation', patchAnnotation(chart.id, drag.id, { xFrac: drag.xFrac, yFrac: drag.yFrac }));
    }
    setDrag(null);
  };

  // The renderer behind export (react-dom/server) is loaded on first use, not at startup.
  const exportSvg = async () => {
    try {
      const { chartToSvgString } = await import('../chart/export');
      downloadBlob(new Blob([chartToSvgString(chart, table)], { type: 'image/svg+xml' }), exportFileName(chart.name, 'svg', settings.timestampExports));
      setStatus('Exported SVG.');
    } catch (err) {
      setStatus(`SVG export failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  const exportPng = async () => {
    // PNG pixels match the chart size in px.
    const scale = 1;
    try {
      const { chartToPngBlob } = await import('../chart/export');
      downloadBlob(await chartToPngBlob(chart, table, scale), exportFileName(chart.name, 'png', settings.timestampExports));
      setStatus(`Exported PNG, ${chart.widthPx} × ${chart.heightPx} px.`);
    } catch (err) {
      setStatus(`PNG export failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="graph-view">
      <div className="toolbar">
        <UndoRedo />
        <span className="sep" />
        <button
          className="icon-text"
          onClick={() => void (settings.exportFormat === 'svg' ? exportSvg() : exportPng())}
          title={`Export as ${settings.exportFormat.toUpperCase()} (change the format in Settings)`}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M8 2v8M4.8 7 8 10.2 11.2 7M2.5 13.5h11" />
          </svg>
          Export
        </button>
        <button
          className="icon-text"
          onClick={() => {
            run('Reset settings', resetAllDataSets(chart.id));
            setStatus('Data set settings reset to defaults.');
          }}
          title="Reset the data set settings (colours, bars, symbols, lines, summary) to the defaults. Undo restores them."
        >
          <ResetIcon />
          Reset settings
        </button>
        <span className="toolbar-info">{chart.widthPx} × {chart.heightPx} px</span>
      </div>
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
            <ChartSvg
              ref={svgRef}
              chart={chart}
              model={model}
              editor={{ selection, dragging: drag }}
              cssWidth={`${cssW}px`}
              cssHeight={`${cssH}px`}
            />
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
