import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createChart } from '../defaults';
import { dataLayer } from './style';

const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'testing' ? [] : sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [path] : [];
  });

describe('the data layer of a chart', () => {
  it('is the layer a new chart starts with', () => {
    const chart = createChart('t');
    expect(dataLayer(chart)).toBe(chart.layers[0]);
  });

  it('is reached through dataLayer everywhere: no other code indexes the layers by position', () => {
    const offenders = sources(resolve(__dirname, '../..'))
      .filter((file) => !file.endsWith(join('model', 'graph', 'style.ts')))
      // A use of the array (chart.layers[0]); the text of a note that names a place in a file (`${path}.layers[0]`) is not one.
      .filter((file) => /[\w)\]]\.layers\[0\]/.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
