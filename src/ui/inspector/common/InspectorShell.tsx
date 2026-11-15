import type { ReactNode, Ref, UIEvent } from 'react';
import type { InspectorPage } from '../../../state/inspectorNav';
import { GRAPH_PAGE_ICONS } from '../../components/icons';
import { PlaceContext } from './controls';
import { PAGES } from './nav';
import { useRoving } from './roving';

/** The pages of an inspector: what the rail and the title show for each. The page with the id 'export' stands apart at the foot of the rail. */
export interface InspectorKit<P extends string> {
  /** What is formatted ("Graph", "Layout"): it names the panel and the rail for assistive technology. */
  name: string;
  pages: ReadonlyArray<{ id: P; label: string; title: string; heading?: string }>;
  icons: Record<P, () => ReactNode>;
}

const GRAPH_KIT: InspectorKit<InspectorPage> = { name: 'Graph', pages: PAGES, icons: GRAPH_PAGE_ICONS };

/** The icon rail beside the settings: one button per page the inspector has; Export, the last, stands apart at the foot. */
function InspectorRail<P extends string>({ kit, pages, page, onPage }: { kit: InspectorKit<P>; pages: readonly P[]; page: P; onPage: (p: P) => void }) {
  const items = kit.pages.filter((p) => pages.includes(p.id));
  const roving = useRoving(items.map(() => true), items.findIndex((p) => p.id === page), (i) => onPage(items[i].id), 'vertical');
  const button = (p: (typeof items)[number], i: number) => {
    const Glyph: () => ReactNode = kit.icons[p.id];
    return (
      <button key={p.id} role="tab" aria-selected={page === p.id} title={p.title} {...roving.itemProps(i)} className={`insp-rail-btn${page === p.id ? ' active' : ''}`} onClick={() => onPage(p.id)}>
        <Glyph />
        <span>{p.label}</span>
      </button>
    );
  };
  return (
    <nav className="insp-rail" aria-label={`${kit.name} settings pages`}>
      <div role="tablist" aria-orientation="vertical" className="insp-rail-all" {...roving.groupProps}>
        <div className="insp-rail-pages">{items.map((p, i) => (p.id === 'export' ? null : button(p, i)))}</div>
        <div className="insp-rail-foot">{items.map((p, i) => (p.id === 'export' ? button(p, i) : null))}</div>
      </div>
    </nav>
  );
}

/** The frame of an inspector: a title, the underlined tabs of the page when it has several, the settings (which scroll), and the icon rail on the right. */
export function InspectorShell<P extends string = InspectorPage, T extends string = string>({ nav, kit = GRAPH_KIT as unknown as InspectorKit<P>, children }: { nav: { page: P; setPage: (p: P) => void; pages: readonly P[]; parts: ReadonlyArray<{ id: T; label: string }>; part?: T; setPart: (p: T) => void; graphId?: string; scrollRef?: Ref<HTMLDivElement>; onScroll?: (e: UIEvent<HTMLDivElement>) => void }; kit?: InspectorKit<P>; children: ReactNode }) {
  const info = kit.pages.find((p) => p.id === nav.page);
  const label = info?.label ?? '';
  const roving = useRoving(nav.parts.map(() => true), nav.parts.findIndex((p) => p.id === nav.part), (i) => nav.setPart(nav.parts[i].id));
  return (
    <aside className="inspector" aria-label={`${kit.name} formatting`}>
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
        <div className="insp-main" role="tabpanel" ref={nav.scrollRef} onScroll={nav.onScroll}>
          <PlaceContext.Provider value={nav.graphId ? { graphId: nav.graphId, page: `${nav.page}/${nav.part ?? ''}` } : null}>{children}</PlaceContext.Provider>
        </div>
      </div>
      <InspectorRail kit={kit} pages={nav.pages} page={nav.page} onPage={nav.setPage} />
    </aside>
  );
}
