/**
 * The R statistics server (plumber2), reached on the app's own origin: Caddy on the VPS and Vite in development forward
 * /api/stats/<route> to R with the prefix removed (vite.config.ts, server/plumber2.R).
 */
const HEALTH_URL = '/api/stats/health';

/** How long the health check waits before it counts as no answer. */
const HEALTH_TIMEOUT_MS = 5000;

/**
 * Asks the R server whether it answers. True only for an OK status with the body {"status":"ok"}; another status or
 * body, a network error, the timeout or `signal` aborting give false. Sends no data.
 */
export async function checkStatsServer(signal?: AbortSignal, timeoutMs = HEALTH_TIMEOUT_MS): Promise<boolean> {
  if (signal?.aborted) return false;
  const controller = new AbortController();
  const stop = () => controller.abort();
  const timer = setTimeout(stop, timeoutMs);
  signal?.addEventListener('abort', stop, { once: true });
  try {
    const response = await fetch(HEALTH_URL, { signal: controller.signal, cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!response.ok) return false;
    const body: unknown = await response.json();
    return typeof body === 'object' && body !== null && (body as { status?: unknown }).status === 'ok';
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', stop);
  }
}
