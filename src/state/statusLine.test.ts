import { describe, expect, it } from 'vitest';
import { statusAfter } from './statusLine';

const screen = () => ({ project: {}, selection: {}, view: {} });

describe('the status line clears on the next action', () => {
  it('shows nothing, and remembers nothing, when there is no message', () => {
    expect(statusAfter('', null, screen())).toEqual({ status: '', seen: null });
  });

  it('keeps a message that appears with its action, and remembers what was on screen with it', () => {
    const now = screen();
    const r = statusAfter('Project saved.', null, now);
    expect(r.status).toBe('Project saved.');
    expect(r.seen).toEqual({ text: 'Project saved.', ...now });
  });

  it('keeps the message while nothing changes', () => {
    const now = screen();
    const first = statusAfter('Copied.', null, now);
    expect(statusAfter('Copied.', first.seen, now)).toEqual({ status: 'Copied.', seen: first.seen });
  });

  it('clears it at the first edit, new selection or change of page', () => {
    const now = screen();
    const { seen } = statusAfter('Duplicated Graph 1.', null, now);
    for (const changed of [{ ...now, project: {} }, { ...now, selection: {} }, { ...now, view: {} }]) {
      expect(statusAfter('Duplicated Graph 1.', seen, changed)).toEqual({ status: '', seen: null });
    }
  });

  it('starts again for a new message, even when something changed with it', () => {
    const before = screen();
    const { seen } = statusAfter('Duplicated Graph 1.', null, before);
    const after = screen();
    const r = statusAfter('Undid: Move legend', seen, after);
    expect(r.status).toBe('Undid: Move legend');
    expect(r.seen).toEqual({ text: 'Undid: Move legend', ...after });
    expect(statusAfter('Undid: Move legend', r.seen, after).status).toBe('Undid: Move legend');
  });

  it('forgets the message once it has cleared, so the next one is judged on its own', () => {
    const now = screen();
    const { seen } = statusAfter('A', null, now);
    const cleared = statusAfter('A', seen, screen());
    expect(cleared).toEqual({ status: '', seen: null });
    const next = screen();
    expect(statusAfter('B', cleared.seen, next).seen).toEqual({ text: 'B', ...next });
  });
});
