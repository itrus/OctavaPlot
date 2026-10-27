import { describe, expect, it } from 'vitest';
import { createExportController, exportStatusText, type ExportJob, type ExportState } from './exportJob';

const deferred = () => {
  let resolve!: (v: string) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<string>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};
const job = (work: ExportJob['work'], pixels: ExportJob['pixels'] = { width: 100, height: 100 }): ExportJob => ({ label: 'PNG', pixels, tooBigMessage: 'too big', work });

describe('export controller', () => {
  it('runs one job when started twice at once', async () => {
    const seen: ExportState[] = [];
    const c = createExportController((s) => seen.push(s));
    const d = deferred();
    let runs = 0;
    const work = () => {
      runs++;
      return d.promise;
    };
    const first = c.start(job(work));
    const second = await c.start(job(work));
    expect(second).toEqual({ kind: 'ignored' });
    d.resolve('ok');
    expect(await first).toEqual({ kind: 'ran', message: 'ok' });
    expect(runs).toBe(1);
  });

  it('moves through the phases and is free again when done', async () => {
    const phases: string[] = [];
    const c = createExportController((s) => phases.push(s.phase));
    await c.start(job(async (phase) => {
      phase('rasterizing');
      phase('encoding');
      return 'saved';
    }));
    expect(phases).toEqual(['preparing', 'rasterizing', 'encoding', 'done']);
    expect(await c.start(job(async () => 'again'))).toEqual({ kind: 'ran', message: 'again' });
  });

  it('reports a failure and is free again', async () => {
    const c = createExportController(() => {});
    const out = await c.start(job(async () => {
      throw new Error('boom');
    }));
    expect(out).toEqual({ kind: 'failed', message: 'PNG export failed: boom' });
    expect(c.state().phase).toBe('failed');
    expect(c.state().error).toContain('boom');
    expect((await c.start(job(async () => 'fine'))).kind).toBe('ran');
  });

  it('refuses an oversized canvas before any work starts', async () => {
    const c = createExportController(() => {});
    let worked = false;
    const out = await c.start(job(async () => {
      worked = true;
      return '';
    }, { width: 20000, height: 100 }));
    expect(out).toEqual({ kind: 'refused', message: 'too big' });
    expect(worked).toBe(false);
    expect(c.state().phase).toBe('failed');
  });

  it('says what an active export is doing', () => {
    expect(exportStatusText({ phase: 'rasterizing', label: 'PNG', error: null })).toBe('Drawing PNG…');
    expect(exportStatusText({ phase: 'done', label: 'PNG', error: null })).toBe('');
  });
});
