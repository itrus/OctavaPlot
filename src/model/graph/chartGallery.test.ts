import { describe, expect, it } from 'vitest';
import { CHART_TYPES, chartTypesFor } from './chartTypes';
import { GALLERY, availableItems, galleryCounts, galleryItems, visibleItems, visibleTabs } from './chartGallery';
import { applyVariant } from './chartVariant';
import { createChart } from '../defaults';
import type { TableKind } from '../types';

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

  it('planned graphs say which preset of the catalogue they are', () => {
    for (const k of KINDS) for (const i of galleryItems(k).filter((x) => x.type === null)) expect(i.spec).toMatch(/^[a-z_]+\.[a-z_]+$/);
  });

  it('names the catalogue preset of every graph that is still planned', () => {
    const planned = KINDS.flatMap((k) => galleryItems(k).filter((i) => i.type === null));
    expect(planned.every((i) => !!i.spec)).toBe(true);
  });
  it('makes aligned dots as the dot plot without sideways spreading', () => {
    const aligned = galleryItems('column').find((i) => i.id === 'cat.aligned');
    expect(aligned?.type).toBe('scatter');
    const chart = applyVariant(createChart('t', { widthPx: 400, heightPx: 300 }, 'scatter'), aligned?.variant);
    expect(chart.jitter.enabled).toBe(false);
    expect(createChart('t', { widthPx: 400, heightPx: 300 }, 'scatter').jitter.enabled).toBe(true);
  });

  it('offers the horizontal versions of the grouped and contingency bars', () => {
    const horizontal = [...availableItems('grouped'), ...availableItems('contingency')].filter((i) => i.variant?.orientation === 'horizontal').map((i) => i.type);
    expect(horizontal.sort()).toEqual(['contingencyBars', 'contingencyPercent', 'contingencyStacked', 'groupedBar', 'groupedStacked']);
  });
});

describe('gallery counts and visibility', () => {
  it('counts come from the registry', () => {
    const all = KINDS.flatMap((k) => galleryItems(k));
    const c = galleryCounts();
    expect(c.total).toBe(all.length);
    expect(c.available).toBe(KINDS.flatMap((k) => availableItems(k)).length);
    expect(c.planned).toBe(all.filter((i) => i.type === null).length);
    expect(c.available + c.planned).toBe(c.total);
  });

  it('shows only the creatable graphs unless planned ones are asked for', () => {
    for (const k of KINDS) {
      expect(visibleItems(k, false)).toEqual(availableItems(k));
      expect(visibleItems(k, true)).toEqual(galleryItems(k));
      expect(visibleTabs(k, false).flatMap((t) => t.items)).toEqual(availableItems(k));
      expect(visibleTabs(k, true).flatMap((t) => t.items)).toEqual(galleryItems(k));
    }
  });

  it('keeps every tab, so one without a creatable graph can say so', () => {
    for (const k of KINDS) expect(visibleTabs(k, false).map((t) => t.id)).toEqual(GALLERY[k].map((t) => t.id));
  });

  it('every locked entry has a preset id', () => {
    for (const k of KINDS) for (const i of galleryItems(k).filter((x) => x.type === null)) expect(i.spec).toBeTruthy();
  });
});
