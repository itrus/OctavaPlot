import { describe, expect, it } from 'vitest';
import { bindingSelectState } from './axes';
import {
  MAX_TICKS_PER_AXIS,
  resolveYAxis,
  validateAxisInterval,
  validateAxisMax,
  validateAxisMin,
  type AxisEditContext,
  type YAxisInput,
} from './scales';

const base: YAxisInput = { values: [0, 3], includeZero: true, min: null, max: null, majorInterval: null, tickCountHint: 5 };
const ctxOf = (input: YAxisInput): AxisEditContext => ({
  min: input.min,
  max: input.max,
  majorInterval: input.majorInterval,
  domain: resolveYAxis(input).domain,
});

describe('resolveYAxis', () => {
  it('baseline: automatic limits and ticks, no warnings', () => {
    const r = resolveYAxis(base);
    expect(r.warnings).toEqual([]);
    expect(r.domain[0]).toBe(0);
    expect(r.ticks[0]).toBe(0);
  });

  it('a tiny interval falls back to the automatic domain [0, 3]', () => {
    const input: YAxisInput = { ...base, values: [0.5, 2.5], includeZero: false, majorInterval: 0.0001 };
    const r = resolveYAxis(input);
    expect(r.warnings).toEqual(['Major tick interval is too small for this range; using automatic ticks.']);
    expect(r.domain).toEqual(resolveYAxis({ ...input, majorInterval: null }).domain);
    expect(r.domain).toEqual([0, 3]);
    expect(r.ticks.length).toBeLessThan(20);
  });

  it('conflict warning comes before the tiny-interval warning', () => {
    const r = resolveYAxis({ ...base, min: 50, majorInterval: 0.0001 });
    expect(r.warnings[0]).toBe('Manual Y limit conflicts with the data range; using automatic limits.');
    expect(r.warnings).toContain('Major tick interval is too small for this range; using automatic ticks.');
    expect(r.warnings.indexOf('Manual Y limit conflicts with the data range; using automatic limits.')).toBeLessThan(
      r.warnings.indexOf('Major tick interval is too small for this range; using automatic ticks.'),
    );
    expect(r.domain[0]).toBeLessThan(r.domain[1]);
  });

  it('exactly 500 ticks is allowed and 501 falls back', () => {
    const at500 = resolveYAxis({ ...base, min: 0, max: 499, majorInterval: 1 });
    expect(MAX_TICKS_PER_AXIS).toBe(500);
    expect(at500.ticks).toHaveLength(500);
    expect(at500.warnings).toEqual([]);
    const at501 = resolveYAxis({ ...base, min: 0, max: 500, majorInterval: 1 });
    expect(at501.warnings).toEqual(['Major tick interval is too small for this range; using automatic ticks.']);
    expect(at501.ticks.length).toBeLessThan(500);
    expect(at501.domain).toEqual([0, 500]);
  });
});

describe('axis edit validators', () => {
  it('min and max messages use the manual counterpart or the automatic one', () => {
    expect(validateAxisMin(5, ctxOf({ ...base, max: 4 }))).toBe('Must be below the maximum (4).');
    expect(validateAxisMin(1, ctxOf({ ...base, max: 4 }))).toBeNull();
    expect(validateAxisMax(-1, ctxOf({ ...base, min: 0 }))).toBe('Must be above the minimum (0).');
    expect(validateAxisMax(2, ctxOf({ ...base, min: 0 }))).toBeNull();
    const auto = ctxOf(base);
    expect(validateAxisMin(auto.domain[1] + 1, auto)).toBe(`Must be below the automatic maximum (${auto.domain[1]}).`);
    expect(validateAxisMax(auto.domain[0], auto)).toBe(`Must be above the automatic minimum (${auto.domain[0]}).`);
  });

  it('limits are formatted without floating point noise', () => {
    expect(validateAxisMin(1, ctxOf({ ...base, min: null, max: 0.1 + 0.2 }))).toBe('Must be below the maximum (0.3).');
  });

  it('interval messages', () => {
    const ctx = ctxOf({ ...base, min: 0, max: 1000 });
    expect(validateAxisInterval(0, ctx)).toBe('Must be greater than 0.');
    expect(validateAxisInterval(-2, ctx)).toBe('Must be greater than 0.');
    expect(validateAxisInterval(1, ctx)).toBe('Too small for this range: it would draw more than 500 ticks.');
    expect(validateAxisInterval(3, ctx)).toBeNull();
  });

  it('agree with the resolver away from the boundary', () => {
    const input: YAxisInput = { ...base, min: 0, max: 1000 };
    const ctx = ctxOf(input);
    for (const v of [0.5, 1, 3, 100, 250]) {
      const rejected = validateAxisInterval(v, ctx) !== null;
      const warned = resolveYAxis({ ...input, majorInterval: v }).warnings.length > 0;
      expect(rejected).toBe(warned);
    }
    for (const v of [-5, 4000]) {
      expect(validateAxisMin(v, ctx) === null).toBe(resolveYAxis({ ...input, min: v }).warnings.length === 0);
    }
  });
});

describe('Plot data on', () => {
  it('is offered for bar, scatter and mean only', () => {
    for (const type of ['bar', 'scatter', 'mean'] as const) expect(bindingSelectState(type, {}).offered).toBe(true);
    // Types outside the Cartesian set (a future pie, say) are not offered.
    expect(bindingSelectState('pie' as never, {}).offered).toBe(false);
  });
});
