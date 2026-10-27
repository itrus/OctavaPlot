import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { expect, test, type Page } from '@playwright/test';
import { createExampleProject } from '../src/model/defaults';
import { replaceTableData, setChartType } from '../src/state/commands';
import { stringifyProject } from '../src/state/serialize';
import { openApp } from './helpers';

/**
 * Measurements against the performance table of the ROADMAP (npm run perf). They are not checks: the targets are provisional and
 * depend on the computer, so each timing is written down (test-results/perf.json) and printed, with the machine it was taken on.
 * Nothing here runs with the other browser tests.
 */
test.skip(!process.env.PERF, 'measurements: run with npm run perf');

const results: Array<{ what: string; ms: number; target: string }> = [];
const note = (what: string, ms: number, target: string) => results.push({ what, ms: Math.round(ms), target });

/** A project whose first table holds `rows` x `groups` pseudo-random values (the same every time). */
function bigProject(rows: number, groups: number, type?: Parameters<typeof setChartType>[1]): string {
  let seed = 12345;
  const next = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  let p = createExampleProject();
  const table = p.dataTables[0];
  p = replaceTableData(table.id, {
    names: Array.from({ length: groups }, (_, i) => `Group ${i + 1}`),
    titles: null,
    values: Array.from({ length: rows }, () => Array.from({ length: groups }, () => Math.round((10 + 4 * next()) * 1000) / 1000)),
  })(p);
  if (type) p = setChartType(p.charts[0].id, type)(p);
  return stringifyProject({ ...p, name: 'perf' });
}

const openProject = (page: Page, json: string) => page.locator('input[type="file"][accept*="oplot"]').setInputFiles({ name: 'perf.oplot', mimeType: 'application/json', buffer: Buffer.from(json) });

/** The time from `trigger` to the first change of the drawing, and to the frame after it, as the page sees them. */
async function timeToUpdate(page: Page, trigger: () => Promise<unknown>): Promise<{ commit: number; frame: number }> {
  await page.evaluate(() => {
    const w = window as unknown as { __perf: { start: number; commit: number; frame: number } };
    w.__perf = { start: 0, commit: 0, frame: 0 };
    document.addEventListener('input', () => (w.__perf.start ||= performance.now()), { capture: true, once: true });
    document.addEventListener('pointerdown', () => (w.__perf.start ||= performance.now()), { capture: true, once: true });
    const svg = document.querySelector('.chart-surface svg')!;
    const watch = new MutationObserver(() => {
      watch.disconnect();
      w.__perf.commit = performance.now();
      requestAnimationFrame(() => requestAnimationFrame(() => (w.__perf.frame = performance.now())));
    });
    watch.observe(svg, { subtree: true, childList: true, attributes: true, characterData: true });
  });
  await trigger();
  await page.waitForFunction(() => (window as unknown as { __perf: { frame: number } }).__perf.frame > 0);
  return page.evaluate(() => {
    const t = (window as unknown as { __perf: { start: number; commit: number; frame: number } }).__perf;
    return { commit: t.commit - t.start, frame: t.frame - t.start };
  });
}

test.afterAll(() => {
  const machine = `${os.cpus()[0]?.model.trim()} (${os.cpus().length} threads), ${Math.round(os.totalmem() / 2 ** 30)} GB, ${os.platform()} ${os.release()}`;
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/perf.json', JSON.stringify({ machine, results }, null, 2));
  console.log(`\nMachine: ${machine}`);
  for (const r of results) console.log(`${String(r.ms).padStart(7)} ms  ${r.what}  (target ${r.target})`);
});

test('opening a project with 100 000 observations', async ({ page }) => {
  test.setTimeout(600_000);
  const json = bigProject(25_000, 4);
  await openApp(page);
  const t0 = Date.now();
  await openProject(page, json);
  await expect(page.getByLabel('Project name')).toHaveValue('perf');
  await expect(page.getByRole('grid', { name: 'Data table' })).toBeVisible();
  note('open a project with 100 000 observations: until the table shows', Date.now() - t0, 'under 3000');
  await page.locator('.nav-item').filter({ hasText: /BAR$/ }).first().click();
  await expect(page.locator('.chart-surface svg')).toBeVisible({ timeout: 240_000 });
  note('open a project with 100 000 observations: until its graph is drawn', Date.now() - t0, 'under 3000');
});

test('editing the title, a colour and a stroke of a graph of 100 000 observations', async ({ page }) => {
  test.setTimeout(600_000);
  await openApp(page);
  await openProject(page, bigProject(25_000, 4));
  await expect(page.getByLabel('Project name')).toHaveValue('perf');
  await page.locator('.nav-item').filter({ hasText: /BAR$/ }).first().click();
  await expect(page.locator('.chart-surface svg')).toBeVisible({ timeout: 240_000 });

  await page.getByRole('tab', { name: 'Text' }).click();
  const title = page.getByLabel('Chart title', { exact: true });
  const t = await timeToUpdate(page, () => title.fill('A different title'));
  note('edit the title: until the drawing changes', t.commit, 'under 50');
  note('edit the title: until the next frame', t.frame, 'under 50');

  await page.getByRole('tab', { name: 'Style' }).click();
  const border = page.getByRole('textbox', { name: 'Border', exact: true }).first();
  const s = await timeToUpdate(page, () => border.fill('3'));
  note('edit a stroke width: until the next frame', s.frame, 'under 50');
});

test('selecting one point among 10 000', async ({ page }) => {
  test.setTimeout(600_000);
  await openApp(page);
  await openProject(page, bigProject(10_000, 1, 'scatter'));
  await expect(page.getByLabel('Project name')).toHaveValue('perf');
  await page.locator('.nav-item').filter({ hasText: /▥/ }).first().click();
  await expect(page.locator('.chart-surface svg')).toBeVisible({ timeout: 240_000 });
  const point = page.locator('.chart-surface [data-hit="point"]').nth(5000);
  await expect(point).toHaveCount(1);
  const box = (await point.boundingBox())!;
  const t = await timeToUpdate(page, () =>
    point.evaluate((el, b) => el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, clientX: b.x, clientY: b.y })), box),
  );
  note('select one point of 10 000: until the drawing changes', t.commit, 'under 100');
  note('select one point of 10 000: until the next frame', t.frame, 'under 100');
});

test('exporting a normal figure as PNG', async ({ page }) => {
  await openApp(page);
  await page.locator('.nav-item').filter({ hasText: /BAR$/ }).first().click();
  await expect(page.locator('.chart-surface svg')).toBeVisible({ timeout: 240_000 });
  await page.getByRole('button', { name: 'Export' }).first().click();
  const dialog = page.getByRole('dialog', { name: /^Export / });
  const wait = page.waitForEvent('download');
  const t0 = Date.now();
  await dialog.getByRole('button', { name: 'Export', exact: true }).click();
  await wait;
  note('export a normal figure as PNG: until the file is made', Date.now() - t0, 'under 2000');
});

for (const [label, json] of [
  ['a normal graph', () => stringifyProject({ ...createExampleProject(), name: 'perf' })],
  ['a graph of 10 000 observations', () => bigProject(2_500, 4)],
] as const) {
  test(`editing the title of ${label}`, async ({ page }) => {
    test.setTimeout(600_000);
    await openApp(page);
    await openProject(page, json());
    await expect(page.getByLabel('Project name')).toHaveValue('perf');
    await page.locator('.nav-item').filter({ hasText: '▥' }).first().click();
    await expect(page.locator('.chart-surface svg')).toBeVisible({ timeout: 240_000 });
    await page.getByRole('tab', { name: 'Text' }).click();
    const t = await timeToUpdate(page, () => page.getByLabel('Chart title', { exact: true }).fill('A different title'));
    note(`edit the title of ${label}: until the next frame`, t.frame, 'under 50');
  });
}
