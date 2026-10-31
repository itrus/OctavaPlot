import { expect, test, type Page } from '@playwright/test';
import { GALLERY } from '../src/model/graph/chartGallery';
import { createEmptyProject } from '../src/model/defaults';
import type { Project, TableKind } from '../src/model/types';
import { addChart, addDataTable } from '../src/state/commands';
import { stringifyProject } from '../src/state/serialize';
import { openApp, openProject } from './helpers';

/**
 * Every graph of the gallery, drawn in the browser. One project for each table type holds one graph for every entry of its tabs,
 * built here from the catalogue (nothing is read from a file), each on the sample data of its table. The graphs are opened one
 * after the other: each has to draw, without an error in the page and without a number that is not one in its markup.
 */

const KINDS = Object.keys(GALLERY) as TableKind[];

/** The entries of a table type that can be made now, with the name its graph is given (numbered, so that no name holds another). */
const entriesOf = (kind: TableKind) =>
  GALLERY[kind]
    .flatMap((tab) => tab.items)
    .filter((item) => item.type !== null)
    .map((item, i) => ({ item, name: `G${String(i + 1).padStart(2, '0')} ${item.id}` }));

function projectOf(kind: TableKind): string {
  let p: Project = addDataTable('t1', kind, { sample: true })(createEmptyProject());
  for (const { item, name } of entriesOf(kind)) {
    p = addChart(`c-${item.id}`, 't1', undefined, item.type!, item.variant)(p);
    p = { ...p, charts: p.charts.map((c) => (c.id === `c-${item.id}` ? { ...c, name } : c)) };
  }
  return stringifyProject({ ...p, name: `${kind} gallery` });
}

/** Errors the page reports while `body` runs: thrown in the page, or written to the console as errors. */
async function pageErrors(page: Page, body: () => Promise<void>): Promise<string[]> {
  const found: string[] = [];
  const onError = (e: Error) => found.push(e.message);
  const onConsole = (m: { type(): string; text(): string }) => m.type() === 'error' && found.push(m.text());
  page.on('pageerror', onError);
  page.on('console', onConsole);
  try {
    await body();
  } finally {
    page.off('pageerror', onError);
    page.off('console', onConsole);
  }
  return found;
}

for (const kind of KINDS) {
  test(`every graph of the ${kind} gallery draws`, async ({ page }) => {
    const entries = entriesOf(kind);
    test.setTimeout(30_000 + entries.length * 6_000);
    await openApp(page);
    const errors = await pageErrors(page, async () => {
      await openProject(page, projectOf(kind));
      await expect(page.getByLabel('Project name')).toHaveValue(`${kind} gallery`);
      for (const { item, name } of entries) {
        await page.locator('.nav-item').filter({ hasText: name }).click();
        const svg = page.locator('.chart-surface svg');
        await expect(svg, item.id).toBeVisible();
        const [markup, box] = await svg.evaluate((el) => {
          const copy = el.cloneNode(true) as SVGElement;
          copy.querySelectorAll('[data-editor-only]').forEach((e) => e.remove());
          return [copy.innerHTML, el.getAttribute('viewBox')] as const;
        });
        expect(markup, `${item.id}: a number that is not one`).not.toMatch(/NaN|undefined|Infinity/);
        expect(markup.length, `${item.id}: nothing is drawn`).toBeGreaterThan(500);
        const [w, h] = (box ?? '').split(/\s+/).slice(2).map(Number);
        expect(w > 0 && h > 0, `${item.id}: viewBox ${box}`).toBe(true);
      }
    });
    expect(errors).toEqual([]);
  });
}
