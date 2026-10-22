import { useMemo, useRef, useState, type PointerEvent } from 'react';
import { ChartSvg } from '../chart/ChartSvg';
import { hitFromTarget, pointerToChartPt } from '../chart/hitTest';
import { buildChartModel } from '../chart/model';
import { tooltipLines } from '../chart/tooltip';
import type { Chart, DataTable } from '../model/types';
import { mmToPx } from '../model/units';
import { useApp } from '../state/AppContext';
import { patchAnnotation } from '../state/commands';
import { downloadBlob, safeFileName } from '../util/download';

export function GraphView({ chart, table }: { chart: Chart; table: DataTable }) {
  const { selection, setSelection, run, setStatus, undo, redo, canUndo, canRedo, zoom } = useApp();
  const model = useMemo(() => buildChartModel(chart, table), [chart, table]);
  const svgRef = useRef<SVGSVGElement>(null);
  const [pngScale, setPngScale] = useState(3);
  const [tip, setTip] = useState<{ x: number; y: number; lines: string[] } | null>(null);
  const [drag, setDrag] = useState<{ id: string; xFrac: number; yFrac: number; dx: number; dy: number; moved: boolean } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const cssW = mmToPx(chart.widthMm) * zoom;
  const cssH = mmToPx(chart.heightMm) * zoom;

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const hit = hitFromTarget(e.target, svgRef.current);
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
      downloadBlob(new Blob([chartToSvgString(chart, table)], { type: 'image/svg+xml' }), `${safeFileName(chart.name)}.svg`);
      setStatus('Exported SVG.');
    } catch (err) {
      setStatus(`SVG export failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  const exportPng = async () => {
    try {
      const { chartToPngBlob } = await import('../chart/export');
      downloadBlob(await chartToPngBlob(chart, table, pngScale), `${safeFileName(chart.name)}@${pngScale}x.png`);
      setStatus(`Exported PNG at ${pngScale}×.`);
    } catch (err) {
      setStatus(`PNG export failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="graph-view">
      <div className="toolbar">
        <button onClick={undo} disabled={!canUndo}>Undo</button>
        <button onClick={redo} disabled={!canRedo}>Redo</button>
        <span className="sep" />
        <button onClick={exportSvg}>Export SVG</button>
        <button onClick={exportPng}>Export PNG</button>
        <label className="inline-label">
          Scale
          <select value={pngScale} onChange={(e) => setPngScale(Number(e.target.value))}>
            {[1, 2, 3, 4, 6, 8].map((s) => (
              <option key={s} value={s}>{s}×</option>
            ))}
          </select>
        </label>
        <span className="toolbar-info">{chart.widthMm} × {chart.heightMm} mm</span>
      </div>
      <div className="chart-scroller">
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
