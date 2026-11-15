import { describe, expect, it } from 'vitest';
import { openDecision } from './openGuard';

describe('Open after the file is read', () => {
  const a = {};
  it('replaces when nothing came between', () => expect(openDecision({ token: 2, latest: 2, base: a, present: a })).toBe('replace'));
  it('asks again after an edit', () => expect(openDecision({ token: 2, latest: 2, base: a, present: {} })).toBe('ask'));
  it('drops an Open that a later one overtook', () => expect(openDecision({ token: 1, latest: 2, base: a, present: a })).toBe('drop'));
  it('drops it even when the project changed too', () => expect(openDecision({ token: 1, latest: 2, base: a, present: {} })).toBe('drop'));
});
