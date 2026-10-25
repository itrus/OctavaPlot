import { Component, useMemo, type ReactNode } from 'react';
import { analysesOf } from '../../model/project/analysis';
import { effectiveTable } from '../../model/table/chartTable';
import { resolveFit } from '../../model/options/fitOptions';
import { framesOf, pageMm, panelLabel } from '../../model/project/layout';
import type { Analysis, Chart, DataTable, Layout, Project } from '../../model/types';
import { buildAnyModelCached, ChartCanvas } from '../../chart/anyModel';

/** The small pictures of a folder overview: what a page looks like, drawn from the page itself. */

/** A picture that cannot be drawn leaves an empty frame, not a failed page. */
class ThumbBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render(): ReactNode {
    return this.state.failed ? <div className="thumb-missing">No preview</div> : this.props.children;
  }
}

const cellText = (v: number | null | undefined): string => (v === null || v === undefined || !Number.isFinite(v) ? '' : String(Number(v.toPrecision(5))));

/** The top left corner of a table: the names of its first columns and its first rows. */
function TableThumb({ table }: { table: DataTable }) {
  const columns = table.groups.slice(0, 5);
  const rows = Array.from({ length: Math.min(6, Math.max(table.rowCount, 1)) }, (_, i) => i);
  return (
    <div className="thumb-sheet" aria-hidden="true">
      <div className="thumb-row thumb-head">
        <span className="thumb-rownum" />
        {columns.map((g) => (
          <span key={g.id} className="thumb-cell">{g.name}</span>
        ))}
      </div>
      {rows.map((r) => (
        <div key={r} className="thumb-row">
          <span className="thumb-rownum">{r + 1}</span>
          {columns.map((g) => (
            <span key={g.id} className="thumb-cell thumb-num">{cellText(g.observations[r]?.value)}</span>
          ))}
        </div>
      ))}
    </div>
  );
}

/** The graph as it is drawn on its page, scaled to the frame. */
function ChartThumb({ chart, project }: { chart: Chart; project: Project }) {
  const table = useMemo(() => effectiveTable(project, chart), [project, chart]);
  const any = useMemo(() => {
    if (!table) return null;
    return buildAnyModelCached(chart, table, resolveFit(chart.fit, analysesOf(project), table.id));
  }, [chart, project, table]);
  if (!any) return <div className="thumb-missing">No data</div>;
  return (
    <div className="thumb-chart" aria-hidden="true">
      <ChartCanvas chart={chart} any={any} cssWidth="100%" cssHeight="100%" />
    </div>
  );
}

/** What a results sheet is of: its kind and its table. */
function AnalysisThumb({ analysis, project }: { analysis: Analysis; project: Project }) {
  const table = project.dataTables.find((t) => t.id === analysis.dataTableId);
  return (
    <div className="thumb-result" aria-hidden="true">
      <span className="thumb-sigma">Σ</span>
      <strong>{analysis.kind === 'curvefit' ? 'Curve fit' : 'Descriptive statistics'}</strong>
      <span>{table?.name ?? 'Table missing'}</span>
      {analysis.kind === 'curvefit' && <span className="muted">{analysis.model ?? 'linear'}</span>}
    </div>
  );
}

/** The page with a box for each panel; the box of a panel that holds a graph says which. */
function LayoutThumb({ layout, project }: { layout: Layout; project: Project }) {
  const page = pageMm(layout.orientation);
  const frames = framesOf(layout);
  return (
    <div className="thumb-page" style={{ aspectRatio: `${page.width} / ${page.height}`, background: layout.background ?? '#fff' }} aria-hidden="true">
      {frames.map((f, i) => {
        const chart = project.charts.find((c) => c.id === layout.panels[i]);
        return (
          <span
            key={i}
            className={`thumb-panel${chart ? '' : ' empty'}`}
            style={{ left: `${(f.x / page.width) * 100}%`, top: `${(f.y / page.height) * 100}%`, width: `${(f.w / page.width) * 100}%`, height: `${(f.h / page.height) * 100}%` }}
            title={chart?.name}
          >
            {panelLabel(layout.labelStyle, i)}
          </span>
        );
      })}
    </div>
  );
}

export type ThumbItem =
  | { kind: 'table'; item: DataTable }
  | { kind: 'chart'; item: Chart }
  | { kind: 'analysis'; item: Analysis }
  | { kind: 'layout'; item: Layout };

export function Thumb({ entry, project }: { entry: ThumbItem; project: Project }) {
  return (
    <ThumbBoundary>
      {entry.kind === 'table' ? <TableThumb table={entry.item} /> : entry.kind === 'chart' ? <ChartThumb chart={entry.item} project={project} /> : entry.kind === 'analysis' ? <AnalysisThumb analysis={entry.item} project={project} /> : <LayoutThumb layout={entry.item} project={project} />}
    </ThumbBoundary>
  );
}
