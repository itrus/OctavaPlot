import { useEffect, useState } from 'react';
import logoUrl from '../../assets/logo.svg';
import { benchSteps, runBenchmark, type BenchResult, type BenchStep } from '../diagnostics/benchmark';
import { MIN_BROWSERS, readSystemInfo, storagePersisted } from '../diagnostics/systemInfo';
import { ASSUMED_LIMIT_BYTES, formatBytes, heapUsage, keyName, measureLocalStorage, type StorageUsage } from '../diagnostics/storageUsage';
import { AUTOSAVE_META_KEY, clockTime, parseMeta } from '../../state/recovery/recovery';
import { usePreferences, useRecovery } from '../../state/AppContext';
import { DialogWindow } from './DialogShell';
import { useRoving } from '../inspector/common/roving';

const link = (href: string) => (
  <a href={href} target="_blank" rel="noreferrer">{href}</a>
);

const TABS = [
  { id: 'about', label: 'About' },
  { id: 'r', label: 'R' },
  { id: 'memory', label: 'Memory' },
  { id: 'system', label: 'System' },
  { id: 'benchmark', label: 'Benchmark' },
] as const;
type TabId = (typeof TABS)[number]['id'];

function AboutTab() {
  return (
    <>
      <div className="info-head">
        <img className="info-logo" src={logoUrl} alt="OctavaPlot logo" width={96} height={96} />
        <h2>OctavaPlot <span className="muted small">v{__APP_VERSION__}{__APP_BUILD__ ? ` (build #${__APP_BUILD__})` : ''}</span></h2>
      </div>

      <dl className="info-rows">
        <dt>Source code</dt>
        <dd>Code, issue tracker and releases: {link('https://github.com/itrus/OctavaPlot')}</dd>
        <dt>Built with</dt>
        <dd>React, D3 (scales), TypeScript and Vite; statistics in R with plumber2.</dd>
        <dt>Support</dt>
        <dd>
          Free software (GNU GPL v3). If it is useful to you,{' '}
          <a className="coffee-btn" href="https://www.buymeacoffee.com/itrus" target="_blank" rel="noreferrer">🎓 Buy me a coffee</a>
        </dd>
      </dl>
    </>
  );
}

/** The statistics engine: whether the R server answers, what R does for the app, and the two pieces cited. */
function RTab() {
  // Drawn like the browser badge of the System tab. Not checked yet: until the health check (GET /api/stats/health)
  // is built, the badge stays red.
  const [server] = useState<'ok' | 'bad'>('bad');
  return (
    <>
      <p className={`browser-badge ${server}`} title={server === 'ok' ? 'The R server answers' : 'Not connected: the connection check is not built yet'}>
        <span className="browser-badge-mark" aria-hidden="true">{server === 'ok' ? '✓' : '✗'}</span>
        <strong>R server</strong>
        <span>{server === 'ok' ? 'connected' : 'not connected'}</span>
      </p>
      <p>
        Statistical tests and curve fits are calculated in <strong>R</strong>. The app sends the values of an analysis to the R server at octava.be and
        shows the results R returns. The server is built with <strong>plumber2</strong>, which turns R functions into a web API.
      </p>
      <dl className="info-rows">
        <dt>R</dt>
        <dd>R Core Team. R: A language and environment for statistical computing. R Foundation for Statistical Computing, Vienna, Austria. {link('https://www.r-project.org/')}</dd>
        <dt>plumber2</dt>
        <dd>Pedersen TL. plumber2: Easy and Powerful Web Servers. R package (Posit). {link('https://plumber2.posit.co/')}</dd>
      </dl>
    </>
  );
}

function MemoryTab() {
  const [usage] = useState(readUsage);
  const { settings } = usePreferences();
  const { autosaveOk } = useRecovery();
  const [savedAt] = useState(readSavedAt);
  const [heap] = useState(heapUsage);
  const pct = usage ? Math.min(100, (usage.appBytes / ASSUMED_LIMIT_BYTES) * 100) : 0;
  return (
    <>
      <p>
        <strong>Autosave</strong>{' '}
        {!settings.autosave ? 'is off.' : !autosaveOk ? 'is failing: the browser refused to store the project.' : savedAt !== null ? `is on; last saved at ${clockTime(savedAt)}.` : 'is on; nothing saved yet.'}
      </p>
      {!usage ? (
        <p>Browser storage cannot be read.</p>
      ) : (
        <>
          <p>
            <strong>{formatBytes(usage.appBytes)}</strong> of about {formatBytes(ASSUMED_LIMIT_BYTES)} localStorage used (limit approximate).
          </p>
          <div className="storage-bar" role="img" aria-label={`${pct.toFixed(1)} percent of the assumed limit used`}><div style={{ width: `${pct}%` }} /></div>
          <table className="storage-table">
            <thead><tr><th>Item</th><th>Size</th></tr></thead>
            <tbody>
              {usage.rows.map((r) => <tr key={r.key}><td title={r.key}>{keyName(r.key)}</td><td>{formatBytes(r.bytes)}</td></tr>)}
              {usage.rows.length === 0 && <tr><td colSpan={2} className="muted">Nothing stored.</td></tr>}
            </tbody>
          </table>
        </>
      )}
      {heap && <p><strong>Page memory:</strong> {formatBytes(heap.used)} of {formatBytes(heap.limit)} (JavaScript heap).</p>}
    </>
  );
}

/** Starts when the tab opens (the tab is mounted only while shown), and stops if it closes first. */
function BenchmarkTab() {
  const [results, setResults] = useState<Partial<Record<BenchStep['id'], BenchResult>>>({});
  const [failed, setFailed] = useState(false);
  const steps = benchSteps();
  useEffect(() => {
    let cancelled = false;
    runBenchmark((r) => { if (!cancelled) setResults((t) => ({ ...t, [r.id]: r })); }, () => cancelled).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);
  const done = steps.every((s) => results[s.id] !== undefined);
  const runs = new Set(steps.map((s) => s.n));
  // The steps are independent, so the totals add and the standard errors add in quadrature.
  const total = steps.reduce((sum, s) => sum + (results[s.id]?.mean ?? 0), 0);
  const totalSe = Math.sqrt(steps.reduce((sum, s) => sum + (results[s.id]?.se ?? 0) ** 2, 0));
  const slowest = Math.max(1, ...steps.map((s) => results[s.id]?.mean ?? 0));
  const ms = (v: number) => (v < 10 ? v.toFixed(1) : Math.round(v).toString());
  const timeText = (mean: number, se: number) => `${ms(mean)} ± ${ms(se)} ms`;
  return (
    <>
      {failed && <p>The benchmark could not run in this browser.</p>}
      <table className="storage-table bench-table">
        <thead><tr><th /><th /><th className="muted small">M ± SE{runs.size === 1 ? `, n = ${[...runs][0]}` : ''}</th></tr></thead>
        <tbody>
          {steps.map((s) => {
            const r = results[s.id];
            return (
              <tr key={s.id}>
                <td>{s.label}</td>
                <td className="bench-bar" aria-hidden="true">{r && <div style={{ width: `${(100 * r.mean) / slowest}%` }} />}</td>
                <td title={r ? `mean ± standard error of ${r.n} runs` : undefined}>{r ? timeText(r.mean, r.se) : failed ? '' : 'running…'}</td>
              </tr>
            );
          })}
          <tr className="muted"><td>Curve fit (with R)</td><td /><td>later</td></tr>
          {done && <tr className="bench-total"><td>Total</td><td /><td>{timeText(total, totalSe)}</td></tr>}
        </tbody>
      </table>
    </>
  );
}

function SystemTab() {
  const [system] = useState(readSystemInfo);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void storagePersisted().then((p) => { if (alive) setPersisted(p); });
    return () => { alive = false; };
  }, []);
  const { browser } = system;
  return (
    <>
      <p className={`browser-badge ${browser.supported === true ? 'ok' : browser.supported === false ? 'bad' : 'unknown'}`} title={browser.supported === null ? 'Not recognised: cannot be checked against the minimum' : browser.supported ? 'Meets the minimum' : 'Older than the minimum: parts of the app may not work'}>
        <span className="browser-badge-mark" aria-hidden="true">{browser.supported === true ? '✓' : browser.supported === false ? '✗' : '?'}</span>
        <strong>{browser.text}</strong>
        <span>{browser.supported === true ? 'meets the minimum' : browser.supported === false ? 'too old' : 'not recognised'}</span>
      </p>
      <h3>Minimum browser</h3>
      <p>
        {MIN_BROWSERS.flatMap((r) => [{ label: r.label, min: r.min }, ...(r.also ? [{ label: r.also.label, min: r.min }] : [])])
          .map((r) => `${r.label} ${r.min[0]}${r.min[1] ? `.${r.min[1]}` : ''}`)
          .join(', ')}{' '}
        or newer.
      </p>
      <h3>This computer</h3>
      <table className="storage-table">
        <tbody>
          <tr><td>Required features</td><td>{system.missing.length === 0 ? 'all present' : `missing: ${system.missing.join(', ')}`}</td></tr>
          {system.limited.length > 0 && <tr><td>Optional features</td><td>{system.limited.join('; ')}</td></tr>}
          {system.threads !== null && <tr><td>CPU threads</td><td>{system.threads}</td></tr>}
          {system.deviceMemoryGb !== null && <tr><td>Device memory</td><td>{system.deviceMemoryGb >= 8 ? '8 GB or more' : `about ${system.deviceMemoryGb} GB`}</td></tr>}
          <tr><td>Screen</td><td>{system.screen}</td></tr>
          {persisted !== null && <tr><td>Storage kept</td><td>{persisted ? 'protected from clean-up' : 'may be cleared by the browser when space is low'}</td></tr>}
        </tbody>
      </table>
    </>
  );
}

function readUsage(): StorageUsage | null {
  try { return measureLocalStorage(); } catch { return null; }
}

function readSavedAt(): number | null {
  try { return parseMeta(localStorage.getItem(AUTOSAVE_META_KEY))?.savedAt ?? null; } catch { return null; }
}

/**
 * A window with the program's version and credits, in tabs: About, R (the statistics engine), memory, system and a benchmark.
 * It opens when the app starts unless "Don't show at start" is ticked (here or in Settings).
 */
export function InfoDialog({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<TabId>('about');
  const { settings, updateSettings } = usePreferences();
  const roving = useRoving(TABS.map(() => true), TABS.findIndex((t) => t.id === tab), (i) => setTab(TABS[i].id));
  return (
    <DialogWindow title="Info" onClose={onClose}>
        <div className="format-tabs info-tabs" role="tablist" aria-label="Info" {...roving.groupProps}>
          {TABS.map((t, i) => (
            <button key={t.id} id={`info-tab-${t.id}`} role="tab" aria-selected={tab === t.id} aria-controls="info-panel" {...roving.itemProps(i)} className={`format-tab${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="modal-body modal-pad info-view" id="info-panel" role="tabpanel" aria-labelledby={`info-tab-${tab}`}>
          {tab === 'about' && <AboutTab />}
          {tab === 'r' && <RTab />}
          {tab === 'memory' && <MemoryTab />}
          {tab === 'system' && <SystemTab />}
          {tab === 'benchmark' && <BenchmarkTab />}
        </div>
        <div className="modal-foot">
          <label className="choice-label info-start-check">
            <input type="checkbox" checked={!settings.aboutAtStart} onChange={(e) => updateSettings({ aboutAtStart: !e.target.checked })} /> Don't show at start
          </label>
          <button className="primary" onClick={onClose}>Close</button>
        </div>
    </DialogWindow>
  );
}
