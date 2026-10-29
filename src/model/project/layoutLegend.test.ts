import { describe, expect, it } from 'vitest';
import { addLayout, patchLayout } from '../../state/commands';
import { parseProject, stringifyProject } from '../../state/serialize';
import { createExampleProject } from '../defaults';
import type { Project } from '../types';
import { arrangeLayout, defaultLayout, mmToPt, pageFrame, sanitizeLayout, slotRects } from './layout';

const addLayoutTo = (p: Project): Project => addLayout('layout_1', {}, p.charts[0].id)(p);
const base = defaultLayout('l1', 'Page', { arrangement: { kind: 'grid', cols: 2, rows: 1 } }); // margin 12 mm, gap 6 mm, landscape

describe('the band of a master legend', () => {
  it('takes its height from the bottom of the panels area, with the gap between, and sits inside the margins', () => {
    const plain = pageFrame(base);
    const f = pageFrame(base, { position: 'bottom', sizePt: 40 });
    const gap = mmToPt(6);
    expect(f.content.h).toBeCloseTo(plain.content.h - 40 - gap, 9);
    expect(f.content.w).toBeCloseTo(plain.content.w, 9);
    expect(f.legend).not.toBeNull();
    expect(f.legend!.h).toBeCloseTo(40, 9);
    expect(f.legend!.y).toBeCloseTo(f.content.y + f.content.h + gap, 9);
    // The band ends exactly where the margin begins: the last point of the content area is the bottom margin.
    expect(f.legend!.y + f.legend!.h).toBeCloseTo(plain.content.y + plain.content.h, 9);
    expect(f.legend!.w).toBeCloseTo(plain.content.w, 9);
  });
  it('takes its width from the right of the panels area for a legend on the right', () => {
    const plain = pageFrame(base);
    const f = pageFrame(base, { position: 'right', sizePt: 90 });
    const gap = mmToPt(6);
    expect(f.content.w).toBeCloseTo(plain.content.w - 90 - gap, 9);
    expect(f.legend!.x + f.legend!.w).toBeCloseTo(plain.content.x + plain.content.w, 9);
    expect(f.legend!.h).toBeCloseTo(plain.content.h, 9);
  });
  it('is absent from a page without a legend, and the slots are the same as before', () => {
    expect(pageFrame(base).legend).toBeNull();
    expect(slotRects(base, null)).toEqual(slotRects(base));
  });
  it('shrinks the panels: two panels across with a right band are narrower by half of the band and gap each', () => {
    const band = { position: 'right' as const, sizePt: 80 };
    const plain = slotRects(base);
    const narrow = slotRects(base, band);
    const lost = 80 + mmToPt(6);
    expect(narrow[0].w).toBeCloseTo(plain[0].w - lost / 2, 9);
    // the right edge of the last panel is the left edge of the gap before the band
    const f = pageFrame(base, band);
    expect(narrow[1].x + narrow[1].w + mmToPt(6)).toBeCloseTo(f.legend!.x, 9);
  });
  it('never leaves the panels without room, whatever the band asks for', () => {
    const f = pageFrame(base, { position: 'bottom', sizePt: 100000 });
    expect(f.content.h).toBe(1);
    expect(f.legend!.h).toBeLessThanOrEqual(pageFrame(base).content.h);
  });
  it('is used by arrangeLayout: the graphs are placed in the smaller area', () => {
    const sizes = [{ widthPt: 300, heightPt: 200 }, null];
    const plain = arrangeLayout(base, sizes);
    const banded = arrangeLayout(base, sizes, { position: 'bottom', sizePt: 120 });
    expect(banded.frame.legend).not.toBeNull();
    expect(banded.placements[0].rect.h).toBeLessThan(plain.placements[0].rect.h);
    expect(banded.frame.widthPt).toBe(plain.frame.widthPt);
  });
});

describe('the legend field of a layout', () => {
  it('is absent from a new layout', () => {
    expect('legend' in base).toBe(false);
  });
  it('is read field by field: wrong values keep the base or the defaults, numbers are clamped', () => {
    const l = sanitizeLayout({ legend: { position: 'right', fontSizePt: 500, hideGraphLegends: false } }, base);
    expect(l.legend).toEqual({ position: 'right', fontSizePt: 24, hideGraphLegends: false });
    const d = sanitizeLayout({ legend: { position: 'middle', fontSizePt: 'big' } }, base);
    expect(d.legend).toEqual({ position: 'bottom', fontSizePt: 9, hideGraphLegends: true });
    const kept = sanitizeLayout({ legend: { position: 'middle', fontSizePt: 1 } }, l);
    expect(kept.legend).toEqual({ position: 'right', fontSizePt: 6, hideGraphLegends: false });
  });
  it('is removed by null or undefined, and a value that is not an object leaves the base', () => {
    const l = sanitizeLayout({ legend: { position: 'bottom', fontSizePt: 9, hideGraphLegends: true } }, base);
    expect('legend' in sanitizeLayout({ ...l, legend: undefined }, l)).toBe(false);
    expect('legend' in sanitizeLayout({ legend: null }, l)).toBe(false);
    expect(sanitizeLayout({ legend: 'yes' }, l).legend).toEqual(l.legend);
    expect(sanitizeLayout({ legend: 7 }, base).legend).toBeUndefined();
  });
  it('is set and removed by the patch command, and survives a save and an open', () => {
    const p0 = addLayoutTo(createExampleProject());
    const id = p0.layouts![0].id;
    const p1 = patchLayout(id, { legend: { position: 'right', fontSizePt: 11, hideGraphLegends: true } })(p0);
    expect(p1.layouts![0].legend).toEqual({ position: 'right', fontSizePt: 11, hideGraphLegends: true });
    const reopened = parseProject(stringifyProject(p1));
    expect(reopened.layouts![0].legend).toEqual({ position: 'right', fontSizePt: 11, hideGraphLegends: true });
    const p2 = patchLayout(id, { legend: undefined })(p1);
    expect('legend' in p2.layouts![0]).toBe(false);
    expect(stringifyProject(p2)).not.toContain('hideGraphLegends');
  });
  it('is not in a file of an older version, and opening one adds none', () => {
    const p = addLayoutTo(createExampleProject());
    expect(stringifyProject(p)).not.toContain('"legend":{"position"');
    expect(parseProject(stringifyProject(p)).layouts![0]).toEqual(p.layouts![0]);
  });
  it('is dropped when a file holds a wrong one, without refusing the file', () => {
    const p = addLayoutTo(createExampleProject());
    const raw = JSON.parse(stringifyProject(p));
    raw.project.layouts[0].legend = 'nonsense';
    expect(parseProject(JSON.stringify(raw)).layouts![0].legend).toBeUndefined();
  });
});
