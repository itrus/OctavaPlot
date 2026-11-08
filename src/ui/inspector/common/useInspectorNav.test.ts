import { beforeEach, describe, expect, it } from 'vitest';
import { forgetPlaces, recallPlace, recallSection, rememberPlace, rememberSection } from '../../../state/inspectorNav';

describe('the place an inspector was left at (state/inspectorNav.ts)', () => {
  beforeEach(forgetPlaces);

  it('is unknown for a graph whose inspector was never opened', () => {
    expect(recallPlace('g1')).toBeUndefined();
    expect(recallSection('g1', 'plot/style/Layers')).toBeUndefined();
  });

  it('keeps the page, the tabs and the scroll of each graph apart', () => {
    rememberPlace('g1', { page: 'plot', parts: { plot: 'frame' } });
    rememberPlace('g2', { page: 'axes' });
    rememberPlace('g1', { scrollTop: 120 });
    expect(recallPlace('g1')).toEqual({ page: 'plot', parts: { plot: 'frame' }, scrollTop: 120, sections: {} });
    expect(recallPlace('g2')).toEqual({ page: 'axes', parts: {}, scrollTop: 0, sections: {} });
  });

  it('keeps a section that was opened or shut, without losing the rest of the place', () => {
    rememberPlace('g1', { page: 'plot', scrollTop: 40 });
    rememberSection('g1', 'plot/style/Layers', true);
    rememberSection('g1', 'plot/style/Other', false);
    rememberPlace('g1', { page: 'legend' });
    expect(recallSection('g1', 'plot/style/Layers')).toBe(true);
    expect(recallSection('g1', 'plot/style/Other')).toBe(false);
    expect(recallPlace('g1')).toMatchObject({ page: 'legend', scrollTop: 40 });
    expect(recallSection('g2', 'plot/style/Layers')).toBeUndefined();
  });

  it('is forgotten for every graph when another project is opened', () => {
    rememberPlace('g1', { page: 'plot' });
    rememberSection('g1', 'k', true);
    forgetPlaces();
    expect(recallPlace('g1')).toBeUndefined();
    expect(recallSection('g1', 'k')).toBeUndefined();
  });
});
