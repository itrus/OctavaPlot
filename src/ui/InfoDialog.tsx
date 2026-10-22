import { PALETTE_GROUPS, PALETTE_GROUP_INFO, GGSCI_CITATION, palettesInGroup } from '../model/palettes';

const link = (href: string) => (
  <a href={href} target="_blank" rel="noreferrer">{href}</a>
);

/** A window with the program's version and credits, and the credits for what it uses; the source of the colour palettes is cited here. */
export function InfoDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="modal modal-wide" role="dialog" aria-modal="true" aria-label="Info" tabIndex={-1} ref={(el) => el?.focus()}>
        <div className="modal-head">
          <strong>Info</strong>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body modal-pad info-view">
      <div className="info-head">
        <img className="info-logo" src={`${import.meta.env.BASE_URL}logo.svg`} alt="OctavaPlot logo" width={128} height={128} />
        <h2>OctavaPlot <span className="muted small">v{__APP_VERSION__}{__APP_COMMIT__ ? ` (build ${__APP_COMMIT__})` : ''}</span></h2>
      </div>
      <p>Scientific data tables and the charts drawn from them, in the browser. Everything stays in your browser; nothing is sent anywhere.</p>

      <h3>Support</h3>
      <p>
        OctavaPlot is free software (GNU GPL v3). If it is useful to you,{' '}
        <a className="coffee-btn" href="https://www.buymeacoffee.com/itrus" target="_blank" rel="noreferrer">🎓 Buy me a coffee</a>
      </p>

      <h3>Colour palettes</h3>
      <p>
        The palettes come from the <strong>ggsci</strong> R package: {GGSCI_CITATION.text} {link(GGSCI_CITATION.url)}. Source code and
        the palette data: {link(GGSCI_CITATION.repository)}. The descriptions follow {link(GGSCI_CITATION.vignette)}.
      </p>
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
        palette of Okabe &amp; Ito (2008). Colour-vision notes use the simulation of Machado, Oliveira &amp; Fernandes (2009).
      </p>

      <h3>Built with</h3>
      <p>React, D3 (scales), TypeScript and Vite.</p>
        </div>
        <div className="modal-foot">
          <button className="primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
