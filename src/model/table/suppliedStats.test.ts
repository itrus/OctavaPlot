import { describe, expect, it } from 'vitest';
import { suppliedStats } from './suppliedStats';

describe('supplied limits', () => {
  it('a centre outside its limits is an invalid interval, with a reason, and the centre stays usable', () => {
    const s = suppliedStats('mean-limits', [10, 3, 2])!.stats;
    expect(s.interval.status).not.toBe('ok');
    expect(s.interval.lower).toBeNull();
    expect(s.interval.upper).toBeNull();
    expect(s.centre).toBe(10);
    expect(s.notices).toHaveLength(1);
    expect(s.notices[0]).toMatchObject({ code: 'interval-invalid', severity: 'blocking' });
    expect(s.notices[0].message).toMatch(/limits/i);
  });
  it('a centre inside its limits is ok, also for asymmetric limits', () => {
    expect(suppliedStats('mean-limits', [2.5, 3, 2])!.stats.interval).toMatchObject({ status: 'ok', lower: 2, upper: 3 });
    expect(suppliedStats('mean-limits', [2.1, 7, 2])!.stats.interval).toMatchObject({ status: 'ok', lower: 2, upper: 7 });
    expect(suppliedStats('mean-limits', [2, 3, 2])!.stats.interval.status).toBe('ok');
    expect(suppliedStats('mean-limits', [2.5, 3, 2])!.stats.notices).toHaveLength(0);
  });
});
