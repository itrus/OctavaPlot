import { describe, expect, it } from 'vitest';
import { CHART_TYPES, chartTypesFor } from './chartTypes';
import { GALLERY, availableItems, galleryItems } from './chartGallery';
import type { TableKind } from './types';

const KINDS: TableKind[] = ['xy', 'column', 'grouped', 'contingency', 'survival'];

describe('graph gallery', () => {
  it('has tabs and graphs for every table type', () => {
    for (const k of KINDS) {
      expect(GALLERY[k].length).toBeGreaterThan(0);
      expect(galleryItems(k).length).toBeGreaterThanOrEqual(chartTypesFor(k).length);
    }
  });

  it('offers every chart type that can be made under its own table type (a horizontal or coloured version is another entry of the same type)', () => {
    for (const k of KINDS) {
      const made = [...new Set(availableItems(k).map((i) => i.type))];
      expect(made.slice().sort()).toEqual(chartTypesFor(k).map((c) => c.type).sort());
    }
    const all = KINDS.flatMap((k) => availableItems(k).map((i) => i.type));
    expect(new Set(all).size).toBe(CHART_TYPES.length);
  });

  it('offers the horizontal versions of the column charts', () => {
    const horizontal = availableItems('column').filter((i) => i.variant?.orientation === 'horizontal').map((i) => i.type);
    expect(horizontal.sort()).toEqual(['bar', 'box', 'violin']);
  });

  it('keys are unique within a table type, and the first graph of each is available', () => {
    for (const k of KINDS) {
      const ids = galleryItems(k).map((i) => i.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(availableItems(k)[0]).toBeDefined();
    }
  });

  it('planned graphs say which preset of the specification they are', () => {
    for (const k of KINDS) for (const i of galleryItems(k).filter((x) => x.type === null)) expect(i.spec).toMatch(/^[a-z_]+\.[a-z_]+$/);
  });

  it('names the specification preset of every graph that is still planned', () => {
    const planned = KINDS.flatMap((k) => galleryItems(k).filter((i) => i.type === null));
    expect(planned.every((i) => !!i.spec)).toBe(true);
  });
  it('offers the horizontal versions of the grouped and contingency bars', () => {
    const horizontal = [...availableItems('grouped'), ...availableItems('contingency')].filter((i) => i.variant?.orientation === 'horizontal').map((i) => i.type);
    expect(horizontal.sort()).toEqual(['contingencyBars', 'contingencyPercent', 'contingencyStacked', 'groupedBar', 'groupedStacked']);
  });
});
