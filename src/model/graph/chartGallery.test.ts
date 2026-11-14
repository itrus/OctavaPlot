import { describe, expect, it } from 'vitest';
import { CHART_TYPES, chartTypeInfo, chartTypesFor } from './chartTypes';
import { GALLERY, availableItems, galleryItems } from './chartGallery';
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

  it('a planned graph (one without a chart type, shown locked) names its catalogue preset; none is planned now', () => {
    const all = KINDS.flatMap((k) => galleryItems(k));
    // The check is not vacuous: there are entries, and the ones that are planned (none today) carry a preset of the form "family.name".
    expect(all.length).toBeGreaterThan(50);
    for (const i of all.filter((x) => x.type === null)) expect(i.spec).toMatch(/^[a-z_]+\.[a-z_]+$/);
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

describe('gallery contents', () => {
  it('holds the creatable graphs of a table type among its tabs, each under the table type its chart type is drawn from', () => {
    for (const k of KINDS) {
      const made = galleryItems(k).filter((i) => i.type !== null);
      expect(made).toEqual(availableItems(k));
      expect(made.every((i) => chartTypeInfo(i.type!)?.tableKind === k)).toBe(true);
      expect(GALLERY[k].every((t) => t.items.length > 0)).toBe(true);
    }
  });

  it('says of a plain graph (no variant) what its chart type says: the same name and description', () => {
    for (const k of KINDS) {
      const plain = galleryItems(k).filter((i) => i.type !== null && i.variant === undefined);
      expect(plain.length).toBeGreaterThan(0);
      for (const i of plain) expect({ id: i.id, label: i.label, description: i.description }).toEqual({ id: i.id, label: chartTypeInfo(i.type!)?.label, description: chartTypeInfo(i.type!)?.description });
    }
  });
});
