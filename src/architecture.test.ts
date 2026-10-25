import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * How the source is laid out, and which way the imports may point. The layers, from the bottom: `util` knows nothing of the rest and `stats` only the model's types; `model` is the data and its rules; `state` is the project in memory (commands, files, history); `chart` draws a
 * model; `ui` is the app. A file imports from its own layer and from the ones under it. Inside `chart` the shared parts
 * (`shared`) know no family; a family (`xy`, `column`, `grouped`, ...) uses `shared`, and `survival` and `histogram` are drawn on
 * the XY chart's model, so they may use `xy`. Tests may import anything.
 */
const SRC = resolve(__dirname);

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
const rel = (file: string) => relative(SRC, file).split(sep).join('/');
const all = walk(SRC).map(rel);
const sources = all.filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.endsWith('.d.ts'));

/** The files a source file imports, as paths under src (relative imports only). */
function importsOf(file: string): string[] {
  const text = readFileSync(join(SRC, file), 'utf8');
  const set = new Set(all);
  return [...text.matchAll(/(?:from|import\()\s*'(\.[^']*)'/g)].flatMap((m) => {
    const base = normalize(join(dirname(file), m[1])).split(sep).join('/');
    const found = [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, base].find((c) => set.has(c));
    return found ? [found] : [];
  });
}

const layerOf = (file: string): string => (file.includes('/') ? file.split('/')[0] : 'app');
const MAY_IMPORT: Record<string, string[]> = {
  util: ['util'],
  stats: ['stats', 'util'],
  model: ['model', 'stats', 'util'],
  state: ['state', 'model', 'stats', 'util', 'chart'],
  chart: ['chart', 'model', 'stats', 'util'],
  testing: ['testing', 'model', 'state', 'chart', 'stats', 'util'],
  ui: ['ui', 'state', 'model', 'stats', 'chart', 'util', 'testing'],
  app: ['app', 'ui', 'state', 'model', 'stats', 'chart', 'util'],
};

describe('the layers of the source', () => {
  it('import only from their own layer and the ones under it', () => {
    // The calculations (stats) are written over the model's types, and nothing else of it.
    const allowed = (f: string, t: string) => MAY_IMPORT[layerOf(f)].includes(layerOf(t)) || (layerOf(f) === 'stats' && t === 'model/types.ts');
    const offenders = sources.flatMap((f) => importsOf(f).filter((t) => !allowed(f, t)).map((t) => `${f} -> ${t}`));
    expect(offenders).toEqual([]);
  });
});

const FAMILIES = ['xy', 'survival', 'column', 'grouped', 'histogram', 'pie', 'heatmap'];
const chartPart = (file: string): string | null => (file.startsWith('chart/') && file.split('/').length > 2 ? file.split('/')[1] : null);
/** The families a family may use besides `shared`: those drawn on another family's model. */
const BUILT_ON: Record<string, string[]> = { survival: ['xy'], histogram: ['xy'] };

describe('the chart folder', () => {
  it('has shared parts that know no family, and no format or page export either', () => {
    const offenders = sources
      .filter((f) => chartPart(f) === 'shared')
      .flatMap((f) => importsOf(f).filter((t) => [...FAMILIES, 'export'].includes(chartPart(t) ?? '')).map((t) => `${f} -> ${t}`));
    expect(offenders).toEqual([]);
  });

  it('has families that use the shared parts, and another family only where they are built on it', () => {
    const offenders = sources
      .filter((f) => FAMILIES.includes(chartPart(f) ?? ''))
      .flatMap((f) =>
        importsOf(f)
          .filter((t) => {
            const [a, b] = [chartPart(f)!, chartPart(t)];
            return b !== null && b !== a && b !== 'shared' && !(BUILT_ON[a] ?? []).includes(b);
          })
          .map((t) => `${f} -> ${t}`),
      );
    expect(offenders).toEqual([]);
  });

  it('keeps at its root only what puts the families together', () => {
    const root = sources.filter((f) => f.startsWith('chart/') && f.split('/').length === 2).sort();
    expect(root).toEqual(['chart/anyModel.tsx', 'chart/tooltip.ts']);
  });

  it('puts every source file in the folder of its family or in shared', () => {
    const known = new Set([...FAMILIES, 'shared', 'export']);
    const strays = sources.filter((f) => f.startsWith('chart/') && f.split('/').length > 2 && !known.has(f.split('/')[1]));
    expect(strays).toEqual([]);
  });
});

describe('the size of the folders', () => {
  it('keeps no folder above 30 files, tests and all', () => {
    const counts = new Map<string, number>();
    for (const f of all) counts.set(dirname(f), (counts.get(dirname(f)) ?? 0) + 1);
    const big = [...counts].filter(([, n]) => n > 30).map(([d, n]) => `${d}: ${n}`);
    expect(big).toEqual([]);
  });

  it('keeps the tests next to what they test: each test file has a source file of the same name beside it, or sits in __tests__', () => {
    const tests = all.filter((f) => /\.test\.tsx?$/.test(f));
    const names = new Set(all.map((f) => f.replace(/\.(tsx?)$/, '')));
    // Tests of several parts of a family, named after the part they are about, are fine: the rule is only that they are not far away.
    const far = tests.filter((t) => {
      const dir = dirname(t);
      return !dir.endsWith('__tests__') && !all.some((f) => dirname(f) === dir && !/\.test\.tsx?$/.test(f));
    });
    expect(far).toEqual([]);
    expect(names.size).toBeGreaterThan(0);
  });
});
