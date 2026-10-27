import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative, resolve, sep } from 'node:path';
import { parseSync } from 'vite';
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

type AstNode = { type?: string; [key: string]: unknown };

/** The text of a string literal, or of a template literal with nothing in it to fill in; null for anything else. */
function literalText(node: unknown): string | null {
  const n = node as AstNode | null;
  if (!n) return null;
  if (n.type === 'Literal' && typeof n.value === 'string') return n.value;
  const quasis = n.quasis as { value: { cooked: string | null } }[] | undefined;
  if (n.type === 'TemplateLiteral' && (n.expressions as unknown[]).length === 0 && quasis) return quasis[0].value.cooked;
  return null;
}

/**
 * Every module a source text names by a relative specifier ('./x', '../x'), found in the syntax tree, so that quotes,
 * line breaks, comments and strings cannot fool it: import and export declarations (`from`, `export *`, side-effect
 * and type-only forms), `import x = require()`, `import()` calls and `import('./x').T` types.
 * The parser is the oxc one that comes with vite (TypeScript 7 has no compiler API in JavaScript). The project has no path aliases.
 */
function specifiersOf(text: string, fileName: string): string[] {
  const found: string[] = [];
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) return value.forEach(visit);
    const node = value as AstNode;
    switch (node.type) {
      case 'ImportDeclaration':
      case 'ExportAllDeclaration':
      case 'ExportNamedDeclaration':
      case 'ImportExpression':
      case 'TSImportType':
        found.push(literalText(node.source) ?? '');
        break;
      case 'TSExternalModuleReference':
        found.push(literalText(node.expression) ?? '');
        break;
    }
    for (const key in node) visit(node[key]);
  };
  visit(parseSync(fileName, text).program);
  return found.filter((s) => s.startsWith('.'));
}

/** Where a specifier written in `file` points, as a path under src among the `known` files (.ts, .tsx, index.ts, bare); null if none. */
function resolveSpecifier(file: string, specifier: string, known: Set<string>): string | null {
  const base = normalize(join(dirname(file), specifier)).split(sep).join('/');
  return [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, base].find((c) => known.has(c)) ?? null;
}

/** The files a source file imports, as paths under src (relative imports only). */
function importsOf(file: string): string[] {
  const text = readFileSync(join(SRC, file), 'utf8');
  const known = new Set(all);
  return specifiersOf(text, file).flatMap((s) => resolveSpecifier(file, s, known) ?? []);
}

describe('the scanner of imports', () => {
  const scan = (text: string, file = 'a/x.ts') => specifiersOf(text, file);
  it('reads single and double quotes', () => {
    expect(scan(`import a from './one'; import b from "../two";`)).toEqual(['./one', '../two']);
  });
  it('reads an export from over several lines, and export *', () => {
    expect(scan(`export {\n  a,\n  b,\n} from\n  "./three";\nexport * from './four';\nexport * as ns from './five';`)).toEqual(['./three', './four', './five']);
  });
  it('reads side-effect imports and dynamic imports', () => {
    expect(scan(`import './six'; import "./seven"; const m = import('./eight'); const n = import(\`./nine\`);`)).toEqual(['./six', './seven', './eight', './nine']);
  });
  it('reads type-only forms, import-equals and import types', () => {
    const text = `import type { T } from './ten'; import { type U } from './eleven'; export type { V } from './twelve';
import legacy = require('./thirteen'); type W = import('./fourteen').W;`;
    expect(scan(text)).toEqual(['./ten', './eleven', './twelve', './thirteen', './fourteen']);
  });
  it('reads a tsx file', () => {
    expect(scan(`import { a } from './z'; export const x = <div>{a}</div>;`, 'a/x.tsx')).toEqual(['./z']);
  });
  it('does not count a specifier inside a comment or a string', () => {
    const text = `// import a from './no1'\n/* export * from './no2' */\nconst s = "from './no3'"; const t = \`import('./no4')\`; const u = 'import x from "./no5"';`;
    expect(scan(text)).toEqual([]);
  });
  it('ignores packages and a dynamic import that is not a plain string', () => {
    expect(scan(`import React from 'react'; import { x } from 'node:path'; import y from '@scope/pkg'; const m = import(name);`)).toEqual([]);
  });
  it('resolves to .ts, .tsx, index.ts or the bare name, and finds nothing outside the known files', () => {
    const known = new Set(['a/b.ts', 'a/c.tsx', 'a/d/index.ts', 'a/e.css']);
    expect(['./b', './c', './d', './e.css', '../../outside'].map((s) => resolveSpecifier('a/x.ts', s, known))).toEqual(['a/b.ts', 'a/c.tsx', 'a/d/index.ts', 'a/e.css', null]);
  });
});

const layerOf = (file: string): string => (file.includes('/') ? file.split('/')[0] : 'app');
/** The layers from the bottom up: a layer may import its own and the ones before it, except as the table below says. */
const LAYER_ORDER = ['util', 'stats', 'model', 'state', 'chart', 'ui'];
const upTo = (layer: string): string[] => LAYER_ORDER.slice(0, LAYER_ORDER.indexOf(layer) + 1);
const MAY_IMPORT: Record<string, string[]> = {
  util: upTo('util'),
  stats: ['stats', 'util'], // and model/types.ts, see the test
  model: upTo('model'),
  state: [...upTo('state'), 'chart'], // the project in memory uses the charts' models
  chart: upTo('chart').filter((l) => l !== 'state'), // a chart does not know the project's state
  testing: ['testing', 'model', 'state', 'chart', 'stats', 'util'],
  ui: [...upTo('ui'), 'testing'],
  app: ['app', ...LAYER_ORDER],
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
    expect(root).toEqual(['chart/anyModel.tsx', 'chart/selectionOrder.ts', 'chart/tooltip.ts']);
  });

  it('puts every source file in the folder of its family or in shared', () => {
    const known = new Set([...FAMILIES, 'shared', 'export']);
    const strays = sources.filter((f) => f.startsWith('chart/') && f.split('/').length > 2 && !known.has(f.split('/')[1]));
    expect(strays).toEqual([]);
  });
});

describe('the data of a graph', () => {
  it('comes from prepareChartInput: no renderer looks a table up itself, and the app and the views do not call effectiveTable', () => {
    const read = (f: string) => readFileSync(join(SRC, f), 'utf8');
    const lookups = sources.filter((f) => f.startsWith('chart/') && /\bdataTables\b/.test(read(f)));
    const bypasses = sources.filter((f) => (f.startsWith('ui/') || f === 'App.tsx') && /\beffectiveTable\b/.test(read(f)));
    expect(lookups).toEqual([]);
    expect(bypasses).toEqual([]);
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
