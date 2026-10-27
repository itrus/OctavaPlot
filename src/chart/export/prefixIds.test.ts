import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createExampleProject } from '../../model/defaults';
import { prepareChartInput } from '../../model/table/preparedChart';
import { buildAnyModelCached, ChartCanvas } from '../anyModel';
import { prefixIds } from './prefixIds';

/** The first implementation: three split/join passes over the whole markup for every id. Kept as the reference. */
function referencePrefixIds(markup: string, prefix: string): string {
  const ids = new Set([...markup.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
  let out = markup;
  for (const id of ids) {
    out = out.split(` id="${id}"`).join(` id="${prefix}${id}"`).split(`url(#${id})`).join(`url(#${prefix}${id})`).split(`href="#${id}"`).join(`href="#${prefix}${id}"`);
  }
  return out;
}

const synthetic = (n: number): string => {
  let s = '<svg>';
  for (let i = 0; i < n; i++) s += `<clipPath id="c${i}"><rect/></clipPath><g clip-path="url(#c${i})"><use href="#c${i}"/></g>`;
  return `${s}</svg>`;
};

const median = (f: () => void): number => {
  const t: number[] = [];
  for (let i = 0; i < 3; i++) {
    const a = performance.now();
    f();
    t.push(performance.now() - a);
  }
  return t.sort((x, y) => x - y)[1];
};

describe('prefixIds', () => {
  it('matches the first implementation on the example chart', () => {
    const p = createExampleProject();
    const chart = p.charts[0];
    const prepared = prepareChartInput(p, chart);
    if (!prepared) throw new Error('example chart has no data');
    const any = buildAnyModelCached(chart, prepared.table, prepared.fit);
    const markup = renderToStaticMarkup(createElement(ChartCanvas, { chart, any, cssWidth: '600px', cssHeight: '400px' }));
    expect(markup).toContain(' id="');
    expect(prefixIds(markup, 'p0-')).toBe(referencePrefixIds(markup, 'p0-'));
  });

  it('matches on ids that are prefixes of others, regex characters and unknown references', () => {
    const markup =
      '<svg><clipPath id="plot-clip"/><clipPath id="plot-clip-2"/><pattern id="a.b*c"/><pattern id="a+b(1)"/><g id="$1"/>' +
      '<g clip-path="url(#plot-clip)"/><g clip-path="url(#plot-clip-2)"/><rect fill="url(#a.b*c)"/><rect fill="url(#aXb*c)"/>' +
      '<use href="#plot-clip"/><use xlink:href="#plot-clip-2"/><use href="#unknown"/><rect fill="url(#unknown)"/><g data-id="plot-clip"/></svg>';
    expect(prefixIds(markup, 'p1-')).toBe(referencePrefixIds(markup, 'p1-'));
    expect(prefixIds(markup, 'p1-')).toContain('url(#unknown)');
    expect(prefixIds(markup, 'p1-')).toContain('data-id="plot-clip"');
  });

  it('leaves markup without ids alone', () => {
    expect(prefixIds('<svg><rect fill="url(#x)"/></svg>', 'p-')).toBe('<svg><rect fill="url(#x)"/></svg>');
  });

  it('scales linearly with the number of ids', () => {
    const small = synthetic(1000);
    const big = synthetic(8000);
    expect(prefixIds(synthetic(300), 'p-')).toBe(referencePrefixIds(synthetic(300), 'p-'));
    const t1 = median(() => prefixIds(small, 'p-'));
    const t8 = median(() => prefixIds(big, 'p-'));
    expect(t8).toBeLessThan(400);
    expect(t8).toBeLessThan(20 * Math.max(t1, 1));
  });
});
