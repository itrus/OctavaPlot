import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FILL_PATTERNS, legendKeyFill, resolveBarFill } from '../model/fill';
import type { Project } from '../model/types';
import { parseProject, stringifyProject } from '../state/serialize';
import { patchStyle } from '../state/commands';
import {
  BAR_FILL_KEY_FRAMES,
  BAR_FILL_NEGATIVE_INDEX,
  BAR_FILL_PATTERN_COUNT,
  barFillFixture,
} from '../testing/barFillFixture';
import { ChartSvg } from './ChartSvg';
import { chartToSvgString } from './export';
import { buildChartModel } from './model';

const svgOf = (p: Project): string => chartToSvgString(p.charts[0], p.dataTables[0]);
const modelOf = (p: Project) => buildChartModel(p.charts[0], p.dataTables[0]);
const count = (s: string, re: RegExp): number => (s.match(re) ?? []).length;
const editorHtml = (p: Project): string =>
  renderToStaticMarkup(
    createElement(ChartSvg, {
      chart: p.charts[0],
      model: modelOf(p),
      editor: { selection: { kind: 'chart' } as never },
      cssWidth: '1px',
      cssHeight: '1px',
    }),
  );

describe('bar fill visual fixture', () => {
  const project = barFillFixture();

  it('X8a has nine data sets: seven patterns, one solid, one none, a visible legend and a manual range', () => {
    const chart = project.charts[0];
    const table = project.dataTables[0];
    expect(table.groups).toHaveLength(9);
    expect(chart.legend.visible).toBe(true);
    expect(chart.yAxis.min).toBe(-2);
    expect(chart.yAxis.max).toBe(3);
    const modes = modelOf(project).groups.map((g) => g.bar?.fillSpec.mode);
    expect(modes).toEqual([...Array(BAR_FILL_PATTERN_COUNT).fill('pattern'), 'solid', 'none']);
    expect(modelOf(project).groups.slice(0, BAR_FILL_PATTERN_COUNT).map((g) => g.bar?.fillSpec.pattern)).toEqual([...FILL_PATTERNS]);
    expect(Math.max(...table.groups[BAR_FILL_NEGATIVE_INDEX].observations.map((o) => o.value as number))).toBeLessThan(0);
  });

  it('X8b has marks for each pattern role only, and the negative bar hangs from the baseline', () => {
    const groups = modelOf(project).groups;
    groups.forEach((g, i) => {
      const bar = g.bar!;
      if (i < BAR_FILL_PATTERN_COUNT) {
        expect(bar.marks?.kind).toBe(FILL_PATTERNS[i] === 'dots' ? 'dots' : 'lines');
        expect(bar.marks?.count).toBeGreaterThan(0);
      } else {
        expect(bar.marks).toBeNull();
      }
    });
    const base = groups[0].bar!.anchor.y;
    for (const g of groups) expect(g.bar!.anchor.y).toBeCloseTo(base, 9);
    const neg = groups[BAR_FILL_NEGATIVE_INDEX].bar!;
    expect(neg.y).toBeCloseTo(neg.anchor.y, 9);
    expect(neg.height).toBeGreaterThan(0);
    const pos = groups[0].bar!;
    expect(pos.y + pos.height).toBeCloseTo(pos.anchor.y, 9);
  });

  it('X8c export has 17 frames, 15 clip paths and no editor machinery', () => {
    const s = svgOf(project);
    expect(count(s, /stroke-linejoin="miter"/g)).toBe(9 + BAR_FILL_KEY_FRAMES);
    expect(count(s, /<clipPath/g)).toBe(1 + 2 * BAR_FILL_PATTERN_COUNT);
    expect(count(s, /<clipPath id="fill-clip-[^"]*legend-/g)).toBe(BAR_FILL_PATTERN_COUNT);
    expect(count(s, /class="fill-marks"/g)).toBe(2 * BAR_FILL_PATTERN_COUNT);
    expect(count(s, /<g opacity/g)).toBe(0);
    for (const bad of ['<pattern', '<image', '<desc', 'pointer-events', 'data-hit']) expect(s).not.toContain(bad);
  });

  it('X8d legend keys cap the spacing at 8 pt and the mark at half of it', () => {
    const style = project.charts[0].defaults;
    const group = modelOf(project).groups[0].bar!.fillSpec;
    expect(group.spacingPt).toBe(12);
    const key = legendKeyFill(group);
    expect(key.spacingPt).toBe(8);
    expect(key.markWidthPt).toBe(2);
    expect(legendKeyFill(resolveBarFill({ ...style, barPatternSpacingPt: 12, barPatternWidthPt: 10 })).markWidthPt).toBe(4);
    expect(legendKeyFill({ ...group, spacingPt: 6 }).spacingPt).toBe(6);
  });

  it('X8e the opacity variant puts one group opacity on each pattern bar and key', () => {
    const p = barFillFixture({ opacity: true });
    const s = svgOf(p);
    expect(count(s, /<g opacity="0.5"/g)).toBe(2 * BAR_FILL_PATTERN_COUNT);
    expect(s).not.toContain('<g opacity="0.5" opacity');
    expect(count(s, /fill-opacity="0.5"/g)).toBeGreaterThanOrEqual(1);
    expect(p.charts[0].yAxis.showGrid).toBe(true);
    expect(count(s, /<clipPath/g)).toBe(1 + 2 * BAR_FILL_PATTERN_COUNT);
  });

  it('X8f editor markup: marks ignore the pointer, each bar frame owns the hit attributes', () => {
    const html = editorHtml(project);
    expect(count(html, /<g[^>]*pointer-events="none"/g)).toBe(2 * BAR_FILL_PATTERN_COUNT);
    const frames = html.match(/<rect[^>]*data-hit="bar"[^>]*>/g) ?? [];
    expect(frames).toHaveLength(9);
    expect(html).not.toMatch(/<path[^>]*class="fill-marks"[^>]*data-hit/);
  });

  it('X8g is deterministic and survives a save and load', () => {
    expect(svgOf(project)).toBe(svgOf(project));
    expect(editorHtml(project)).toBe(editorHtml(project));
    const loaded = parseProject(stringifyProject(project));
    expect(svgOf(loaded)).toBe(svgOf(project));
  });

  it('X8h a style-only edit changes only that data set colour', () => {
    const chart = project.charts[0];
    const id = project.dataTables[0].groups[0].id;
    const edited = patchStyle(chart.id, id, { barPatternColor: '#cc0000' })(project);
    const before = svgOf(project);
    const after = svgOf(edited);
    expect(after).not.toBe(before);
    expect(after.replaceAll('#cc0000', '#000000')).toBe(before);
    expect(count(after, /#cc0000/g)).toBe(2);
  });
});
