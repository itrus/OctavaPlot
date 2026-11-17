/** What the browser says about itself, for the Info window. Every value is read defensively: a browser may not offer a field, and none of it is needed to run. */

type Family = 'Chrome' | 'Edge' | 'Firefox' | 'Safari' | 'Chromium';
type Version = readonly [number, number];

/**
 * The oldest browsers the build supports: the default build target of the installed Vite ("baseline-widely-available" in
 * Vite 8.3.5: chrome111, edge111, firefox114, safari16.4), which vite.config.ts does not override. Update it with Vite.
 */
export const MIN_BROWSERS: ReadonlyArray<{ family: Family; label: string; min: Version; /** Browsers judged by this row as well. */ also?: { family: Family; label: string } }> = [
  { family: 'Chrome', label: 'Chrome', min: [111, 0] },
  { family: 'Edge', label: 'Edge', min: [111, 0], also: { family: 'Chromium', label: 'other Chromium-based (Opera, Brave, …)' } },
  { family: 'Firefox', label: 'Firefox', min: [114, 0] },
  { family: 'Safari', label: 'Safari (also on iOS)', min: [16, 4] },
];

export interface Browser {
  /** For display, for example "Chrome 131". */
  text: string;
  /** Which row of MIN_BROWSERS judges it; null when the browser is not recognised. */
  family: Family | null;
  /** True or false once recognised; null when it is not. */
  supported: boolean | null;
}

export interface SystemInfo {
  browser: Browser;
  threads: number | null;
  /** GB, as Chrome reports it: rounded down to a power of two and capped at 8. */
  deviceMemoryGb: number | null;
  screen: string;
  /** Features the app cannot run without that this browser lacks. */
  missing: string[];
  /** Features with a fallback that this browser lacks, with what is lost. */
  limited: string[];
}

interface UaBrand { brand: string; version: string }

const parseVersion = (s: string): Version => {
  const [major, minor] = s.split('.');
  return [Number.parseInt(major, 10) || 0, Number.parseInt(minor ?? '0', 10) || 0];
};
const atLeast = (v: Version, min: Version): boolean => v[0] > min[0] || (v[0] === min[0] && v[1] >= min[1]);

function judge(text: string, family: Family, version: Version): Browser {
  const row = MIN_BROWSERS.find((r) => r.family === family || r.also?.family === family);
  return { text, family, supported: row ? atLeast(version, row.min) : null };
}

/**
 * The browser and whether it meets the minimum. From the brand list where the browser has one (Chromium-based browsers), else from
 * the user-agent text. Approximate by nature: a browser can present itself as another.
 */
export function detectBrowser(nav: { userAgentData?: { brands?: UaBrand[] }; userAgent?: string }): Browser {
  const brands = nav.userAgentData?.brands?.filter((b) => !/not.?a.?brand/i.test(b.brand));
  const specific = brands?.find((b) => b.brand !== 'Chromium');
  const chromium = brands?.find((b) => b.brand === 'Chromium');
  if (specific || chromium) {
    const b = specific ?? chromium!;
    const text = `${b.brand} ${b.version}`;
    // A Chromium-based browser is judged by its engine; Chrome and Edge also by their own row.
    const family: Family = /chrome/i.test(b.brand) ? 'Chrome' : /edge/i.test(b.brand) ? 'Edge' : 'Chromium';
    return judge(text, family, parseVersion(chromium?.version ?? b.version));
  }
  const ua = nav.userAgent ?? '';
  // Edge also says "Chrome" (and Chrome says "Safari"), so the more specific name is looked for first.
  const m = /(Edg)\/([\d.]+)/.exec(ua) ?? /(Firefox)\/([\d.]+)/.exec(ua) ?? /(Chrome)\/([\d.]+)/.exec(ua) ?? /(Version)\/([\d.]+)/.exec(ua);
  if (!m) return { text: 'unknown', family: null, supported: null };
  const family: Family = m[1] === 'Edg' ? 'Edge' : m[1] === 'Version' ? 'Safari' : (m[1] as Family);
  const shown = m[1] === 'Version' ? m[2].split('.').slice(0, 2).join('.') : m[2].split('.')[0];
  return judge(`${family} ${shown}`, family, parseVersion(m[2]));
}

export function readSystemInfo(): SystemInfo {
  const nav = navigator as Navigator & { userAgentData?: { brands?: UaBrand[] }; deviceMemory?: number };
  const missing: string[] = [];
  if (typeof Worker === 'undefined') missing.push('Web Workers (curve fits)');
  if (typeof structuredClone === 'undefined') missing.push('structuredClone');
  if (typeof ResizeObserver === 'undefined') missing.push('ResizeObserver');
  try { localStorage.length; } catch { missing.push('localStorage (autosave)'); }
  const limited: string[] = [];
  if (typeof CompressionStream === 'undefined') limited.push('CompressionStream: PDFs are not compressed');
  if (!('showSaveFilePicker' in window)) limited.push('Save dialog: files go to Downloads');
  return {
    browser: detectBrowser(nav),
    threads: typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null,
    deviceMemoryGb: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    screen: `${window.screen.width} × ${window.screen.height}, pixel ratio ${window.devicePixelRatio}`,
    missing,
    limited,
  };
}

/** Whether the browser promised not to evict this site's storage; null where it cannot say. */
export async function storagePersisted(): Promise<boolean | null> {
  try { return (await navigator.storage?.persisted?.()) ?? null; } catch { return null; }
}
