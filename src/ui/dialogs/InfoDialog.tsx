import { useState } from 'react';
import { ModalBackdrop } from './DialogShell';
import { CloseIcon } from '../components/icons';
import { useRoving } from '../inspector/common/roving';
import { PALETTE_GROUPS, PALETTE_GROUP_INFO, DATAWRAPPER_CITATION, GGSCI_CITATION, palettesInGroup } from '../../model/graph/palettes';
import { HEAT_PALETTE_GROUPS } from '../../model/options/heatmapOptions';

const link = (href: string) => (
  <a href={href} target="_blank" rel="noreferrer">{href}</a>
);

const TABS = [
  { id: 'about', label: 'About' },
  { id: 'palettes', label: 'Colour palettes' },
  { id: 'gradients', label: 'Heat-map gradients' },
] as const;
type TabId = (typeof TABS)[number]['id'];

function AboutTab() {
  return (
    <>
      <div className="info-head">
        <img className="info-logo" src={`${import.meta.env.BASE_URL}logo.svg`} alt="OctavaPlot logo" width={128} height={128} />
        <h2>OctavaPlot <span className="muted small">v{__APP_VERSION__}{__APP_COMMIT__ ? ` (build ${__APP_COMMIT__})` : ''}</span></h2>
      </div>
      <p>Scientific data tables and the charts drawn from them, in the browser. Everything stays in your browser; nothing is sent anywhere.</p>

      <h3>Source code</h3>
      <p>
        The code, the issue tracker and the releases are on GitHub: {link('https://github.com/itrus/OctavaPlot')}
      </p>

      <h3>Support</h3>
      <p>
        OctavaPlot is free software (GNU GPL v3). If it is useful to you,{' '}
        <a className="coffee-btn" href="https://www.buymeacoffee.com/itrus" target="_blank" rel="noreferrer">🎓 Buy me a coffee</a>
      </p>

      <h3>Built with</h3>
      <p>React, D3 (scales), TypeScript and Vite.</p>
    </>
  );
}

function PalettesTab() {
  return (
    <>
      <p>
        The <strong>Color palette</strong> button of a graph opens a window with every palette as a button. Point at one to see all its colours,
        what it is and where it comes from; click it to give the data sets its colours, in order.
      </p>
      <h3>Sources</h3>
      <p>
        The first two groups come from the <strong>ggsci</strong> R package: {GGSCI_CITATION.text} {link(GGSCI_CITATION.url)}. Source code and
        the palette data: {link(GGSCI_CITATION.repository)}. The descriptions follow {link(GGSCI_CITATION.vignette)}.
      </p>
      <p>
        <strong>Published styles</strong> are collected in: {DATAWRAPPER_CITATION.text} {link(DATAWRAPPER_CITATION.url)}. They are named after the
        organisation whose style guide they follow, not as its official palettes. Values printed in a guide are exact; those read from an image are
        approximate, and each description says which.
      </p>
      <h3>Groups</h3>
      {PALETTE_GROUPS.map((g) => (
        <p key={g}>
          <strong>{g}.</strong> {PALETTE_GROUP_INFO[g]}
          <br />
          <span className="muted">{palettesInGroup(g).map((p) => p.name).join(', ')}.</span>
        </p>
      ))}
      <p className="muted small">
        Gephi&rsquo;s palette engine is generative, so it is a seeded port of the one in ggsci giving ten fixed colours; iTerm is the Rose Pine
        scheme only (ggsci has more than 400). The palettes in &ldquo;Other&rdquo; are the app&rsquo;s own, except Colorblind-friendly, which is the
        palette of Okabe &amp; Ito (2008). Black and White and Monochrome run from the darkest colour to the lightest. Colour-vision notes use the
        simulation of Machado, Oliveira &amp; Fernandes (2009).
      </p>
    </>
  );
}

function GradientsTab() {
  return (
    <>
      <p>
        A heat map colours its cells with one of the continuous gradients, or with a Custom scale of two or three colours. The <strong>Scale</strong> button
        opens a window with every gradient as a button drawn as a bar; point at one to see its colours and source, click it to apply it.
      </p>
      <h3>Sources</h3>
      <p>
        GSEA, Bootstrap 5 and Material Design come from the <strong>ggsci</strong> R package ({link(GGSCI_CITATION.url)}). The{' '}
        <strong>Published</strong> gradients are sampled from the default sequential gradients pictured in {DATAWRAPPER_CITATION.text}{' '}
        {link(DATAWRAPPER_CITATION.url)}; they are approximate, 11 colours each, and run from dark to light, while the others run from light to dark
        (<em>Reverse the colours</em> flips either).
      </p>
      <p>
        The <strong>Viridis family</strong> (Viridis, Cividis, Inferno) and the <strong>ColorBrewer</strong> maps (RdBu, BrBG; both diverging) are
        named colour maps, each given as 11 stops that are used as supplied; no source is cited for them here.
      </p>
      <h3>Gradients</h3>
      {HEAT_PALETTE_GROUPS.filter((g) => g.label !== 'Custom').map((g) => (
        <p key={g.label}>
          <strong>{g.label}.</strong> <span className="muted">{g.options.map((o) => o.label).join(', ')}.</span>
        </p>
      ))}
      <p className="muted small">GSEA, RdBu and BrBG are diverging: their middle is the centre value.</p>
    </>
  );
}

/** A window with the program's version and credits, in tabs; the sources of the colour palettes and gradients are cited here. */
export function InfoDialog({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<TabId>('about');
  const roving = useRoving(TABS.map(() => true), TABS.findIndex((t) => t.id === tab), (i) => setTab(TABS[i].id));
  return (
    <ModalBackdrop onClose={onClose}>
      <div className="modal modal-wide" role="dialog" aria-modal="true" aria-label="Info" tabIndex={-1} ref={(el) => el?.focus()}>
        <div className="modal-head">
          <strong>Info</strong>
          <button className="modal-close" onClick={onClose} aria-label="Close"><CloseIcon /></button>
        </div>
        <div className="format-tabs info-tabs" role="tablist" aria-label="Info" {...roving.groupProps}>
          {TABS.map((t, i) => (
            <button key={t.id} id={`info-tab-${t.id}`} role="tab" aria-selected={tab === t.id} aria-controls="info-panel" {...roving.itemProps(i)} className={`format-tab${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="modal-body modal-pad info-view" id="info-panel" role="tabpanel" aria-labelledby={`info-tab-${tab}`}>
          {tab === 'about' && <AboutTab />}
          {tab === 'palettes' && <PalettesTab />}
          {tab === 'gradients' && <GradientsTab />}
        </div>
        <div className="modal-foot">
          <button className="primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </ModalBackdrop>
  );
}
