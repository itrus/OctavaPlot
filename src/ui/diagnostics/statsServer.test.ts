import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkStatsServer } from './statsServer';

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('checkStatsServer', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('is true for an OK status with {"status":"ok"}, asking /api/stats/health without the cache', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => reply(200, { status: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(checkStatsServer()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/stats/health');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: 'no-store' });
  });

  it('is false for an error status, another body or a body that is not JSON', async () => {
    const answers = [() => reply(500, { status: 'ok' }), () => reply(200, { status: 'down' }), () => reply(200, ['ok']), () => reply(200, null), () => new Response('<html>', { status: 200 })];
    for (const answer of answers) {
      vi.stubGlobal('fetch', vi.fn(async () => answer()));
      await expect(checkStatsServer()).resolves.toBe(false);
    }
  });

  it('is false when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(checkStatsServer()).resolves.toBe(false);
  });

  it('gives up after the timeout or when the caller aborts, and sends nothing for a signal already aborted', async () => {
    // Never answers; rejects only when its signal aborts, as fetch does.
    const hanging = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    vi.stubGlobal('fetch', hanging);
    await expect(checkStatsServer(undefined, 20)).resolves.toBe(false);

    const caller = new AbortController();
    const pending = checkStatsServer(caller.signal, 60_000);
    caller.abort();
    await expect(pending).resolves.toBe(false);

    const already = new AbortController();
    already.abort();
    await expect(checkStatsServer(already.signal)).resolves.toBe(false);
    expect(hanging).toHaveBeenCalledTimes(2);
  });
});
