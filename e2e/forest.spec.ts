import { expect, test, type Locator, type Page } from '@playwright/test';
import { createEmptyProject } from '../src/model/defaults';
import { addChart, addDataTable, replaceTableData } from '../src/state/commands';
import { stringifyProject } from '../src/state/serialize';
import { openApp, openProject } from './helpers';

/** A forest plot of typed estimates and limits ("Mean (or median), Upper/Lower limits"), made as the gallery makes it, opened in the browser. */
function forestProject(kind: 'difference' | 'ratio'): string {
  let p = addDataTable('t', 'grouped', { layout: { kind: 'summary', format: 'mean-limits' } })(createEmptyProject());
  p = replaceTableData('t', {
    names: ['Mean', 'Upper', 'Lower'],
    titles: ['Alpha 2019', 'Beta 2020', 'Gamma 2021', 'Pooled'],
    values: [[0.8, 1.2, 0.5], [1.5, 2.4, 0.9], [0.4, 0.9, 0.2], [0.9, 1.1, 0.7]],
  })(p);
  p = addChart('c', 't', undefined, 'groupedLine', { forest: kind })(p);
  p = { ...p, charts: p.charts.map((c) => (c.id === 'c' ? { ...c, name: 'Forest graph' } : c)) };
  return stringifyProject({ ...p, name: 'forest' });
}

/** The summary diamonds in the drawing: closed paths of four corners. */
const diamonds = (svg: Locator) => svg.evaluate((el) => [...el.querySelectorAll('path')].filter((q) => /^M[-\d.,]+(L[-\d.,]+){3}Z$/.test(q.getAttribute('d') ?? '')).length);

/** What is drawn, as geometry and words: every path and every label, in order (the markup can differ in the order of attributes after an update). */
const geometry = (svg: Locator) =>
  svg.evaluate((el) => [...el.querySelectorAll('path, text')].map((q) => (q.tagName === 'path' ? q.getAttribute('d') : q.textContent)));

async function openForest(page: Page, kind: 'difference' | 'ratio'): Promise<Locator> {
  await openApp(page);
  await openProject(page, forestProject(kind));
  await page.locator('.nav-item').filter({ hasText: 'Forest graph' }).click();
  const svg = page.locator('.chart-surface svg');
  await expect(svg).toBeVisible();
  return svg;
}

test('a study ticked as a summary row is drawn as a diamond, and Undo and Redo take it away and bring it back', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const svg = await openForest(page, 'ratio');
  expect(await diamonds(svg)).toBe(0);
  const pooled = page.getByLabel('Summary row: Pooled');
  await pooled.check();
  expect(await diamonds(svg)).toBe(1);
  await page.getByRole('button', { name: 'Undo' }).click();
  expect(await diamonds(svg)).toBe(0);
  await expect(pooled).not.toBeChecked();
  await page.getByRole('button', { name: 'Redo' }).click();
  expect(await diamonds(svg)).toBe(1);
  await pooled.uncheck();
  expect(await diamonds(svg)).toBe(0);
  expect(errors).toEqual([]);
});

test('the diamond comes with its interval in the tooltip, and a click on it selects its data set', async ({ page }) => {
  const svg = await openForest(page, 'ratio');
  await page.getByLabel('Summary row: Pooled').check();
  const diamond = svg.locator('path[id*="points"]').last();
  await diamond.hover({ force: true });
  await expect(page.getByText(/limits as entered: 0\.7 to 1\.1/)).toBeVisible();
  await diamond.click({ force: true });
  // The inspector now edits that data set (the group selector shows its name, not "Global").
  await expect(page.locator('.inspector-host select').first().locator('option:checked')).toHaveText('Group A');
});

test('the Direction control turns a forest plot and turns it back, with its diamond and no error', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const svg = await openForest(page, 'difference');
  await page.getByLabel('Summary row: Pooled').check();
  const horizontal = await geometry(svg);
  await page.getByLabel('Columns run').getByRole('button', { name: 'Vertical' }).click();
  expect(await geometry(svg)).not.toEqual(horizontal);
  expect(await diamonds(svg)).toBe(1);
  await page.getByLabel('Columns run').getByRole('button', { name: 'Horizontal' }).click();
  expect(await geometry(svg)).toEqual(horizontal);
  expect(errors).toEqual([]);
});

for (const kind of ['difference', 'ratio'] as const) {
  test(`a forest plot of ${kind === 'ratio' ? 'ratios' : 'differences'} draws with its studies, its line at no effect and no error`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await openApp(page);
    await openProject(page, forestProject(kind));
    await expect(page.getByLabel('Project name')).toHaveValue('forest');
    await page.locator('.nav-item').filter({ hasText: 'Forest graph' }).click();
    const svg = page.locator('.chart-surface svg');
    await expect(svg).toBeVisible();
    // The studies are the labels down the left; the dashed line at no effect is in the drawing.
    for (const study of ['Alpha 2019', 'Beta 2020', 'Gamma 2021', 'Pooled']) await expect(svg).toContainText(study);
    expect(await svg.evaluate((el) => el.querySelectorAll('[stroke-dasharray]').length)).toBeGreaterThan(0);
    expect(await svg.evaluate((el) => el.innerHTML)).not.toMatch(/NaN|undefined|Infinity/);
    if (process.env.SHOTS) await svg.screenshot({ path: `${process.env.SHOTS}/forest-${kind}-${info.project.name}.png` });
    expect(errors).toEqual([]);
  });
}
