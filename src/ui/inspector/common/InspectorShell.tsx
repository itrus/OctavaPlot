import type { ReactNode } from 'react';
import type { InspectorPage } from '../../../state/inspectorNav';
import { AnalysisPageIcon, AxesPageIcon, ExportIcon, GraphPageIcon, LegendPageIcon, NotesPageIcon, PlotPageIcon } from '../../components/icons';
import { PAGES, type Part } from './nav';
import { useRoving } from './roving';

const ICONS: Record<InspectorPage, () => ReactNode> = {
  graph: GraphPageIcon,
  plot: PlotPageIcon,
  axes: AxesPageIcon,
  legend: LegendPageIcon,
  analysis: AnalysisPageIcon,
  notes: NotesPageIcon,
  export: ExportIcon,
};

/** The icon rail beside the settings: one button per page the inspector has; Export, the last, stands apart at the foot. */
function InspectorRail({ pages, page, onPage }: { pages: readonly InspectorPage[]; page: InspectorPage; onPage: (p: InspectorPage) => void }) {
  const items = PAGES.filter((p) => pages.includes(p.id));
  const roving = useRoving(items.map(() => true), items.findIndex((p) => p.id === page), (i) => onPage(items[i].id), 'vertical');
  const button = (p: (typeof items)[number], i: number) => {
    const Glyph = ICONS[p.id];
    return (
      <button key={p.id} role="tab" aria-selected={page === p.id} title={p.title} {...roving.itemProps(i)} className={`insp-rail-btn${page === p.id ? ' active' : ''}`} onClick={() => onPage(p.id)}>
        <Glyph />
        <span>{p.label}</span>
      </button>
    );
  };
  return (
    <nav className="insp-rail" aria-label="Graph settings pages">
      <div role="tablist" aria-orientation="vertical" className="insp-rail-all" {...roving.groupProps}>
        <div className="insp-rail-pages">{items.map((p, i) => (p.id === 'export' ? null : button(p, i)))}</div>
        <div className="insp-rail-foot">{items.map((p, i) => (p.id === 'export' ? button(p, i) : null))}</div>
      </div>
    </nav>
  );
}

/** The frame of an inspector: a title, the underlined tabs of the page when it has several, the settings (which scroll), and the icon rail on the right. */
export function InspectorShell({ nav, children }: { nav: { page: InspectorPage; setPage: (p: InspectorPage) => void; pages: readonly InspectorPage[]; parts: ReadonlyArray<{ id: Part; label: string }>; part?: Part; setPart: (p: Part) => void }; children: ReactNode }) {
  const info = PAGES.find((p) => p.id === nav.page);
  const label = info?.label ?? '';
  const roving = useRoving(nav.parts.map(() => true), nav.parts.findIndex((p) => p.id === nav.part), (i) => nav.setPart(nav.parts[i].id));
  return (
    <aside className="inspector" aria-label="Graph formatting">
      <div className="insp-col">
        <div className="insp-title">{info?.heading ?? `Format ${label}`}</div>
        {nav.parts.length > 1 && (
          <div className="insp-tabs" role="tablist" aria-label={`${label} settings`} {...roving.groupProps}>
            {nav.parts.map((p, i) => (
              <button key={p.id} role="tab" aria-selected={nav.part === p.id} {...roving.itemProps(i)} className={`insp-tab${nav.part === p.id ? ' active' : ''}`} onClick={() => nav.setPart(p.id)}>
                {p.label}
              </button>
            ))}
          </div>
        )}
        <div className="insp-main" role="tabpanel">{children}</div>
      </div>
      <InspectorRail pages={nav.pages} page={nav.page} onPage={nav.setPage} />
    </aside>
  );
}
