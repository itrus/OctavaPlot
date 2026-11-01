import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';
import { createEmptyProject } from '../src/model/defaults';
import { applyVariant } from '../src/model/graph/chartVariant';
import type { Project } from '../src/model/types';
import { addBracket, addChart, addDataTable, replaceTableData } from '../src/state/commands';
import { stringifyProject } from '../src/state/serialize';
import { openApp, openProject } from './helpers';

/** A bar chart with a comparison bracket, and a bubble chart made as the gallery makes it, opened in the browser. */
function project(): string {
  let p: Project = addDataTable('t', 'column', { sample: true })(createEmptyProject());
  p = addChart('c', 't', undefined, 'bar')(p);
  const groups = p.dataTables.find((t) => t.id === 't')!.groups.map((g) => g.id);
  p = addBracket('c', { id: 'b1', from: groups[0], to: groups[3], label: 'p = 0.003', color: '#aa0000', widthPt: 2, fontSizePt: 16 })(p);
  p = addDataTable('s', 'xy', { sample: true, layout: { kind: 'sized' } })(p);
  p = replaceTableData('s', { names: ['X', 'Y', 'Count'], titles: null, values: [[1, 5, 10], [2, 6, 40], [3, 7, 100]] })(p);
  p = addChart('d', 's', undefined, 'xyBubble')(p);
  p = { ...p, charts: p.charts.map((c) => (c.id === 'd' ? { ...applyVariant(c, { bubbles: true }), name: 'Bubble graph' } : c.id === 'c' ? { ...c, name: 'Bracket graph' } : c)) };
  return stringifyProject({ ...p, name: 'brackets' });
}

async function open(page: Page, graph: string) {
  await openApp(page);
  await openProject(page, project());
  await page.locator('.nav-item').filter({ hasText: graph }).click();
  await expect(page.locator('.chart-surface svg')).toBeVisible();
}

/** The height of the bar of the bracket on the page: the second number of its path. */
const barTop = (page: Page) =>
  page.locator('.chart-surface svg path[id$="b1-bracket-bar"]').first().evaluate((p) => Number(/V([-\d.]+)H/.exec(p.getAttribute('d') ?? '')?.[1]));

test.describe('comparison brackets', () => {
  test('a dragged bracket keeps its new place in a field of the inspector, and Undo puts it back', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page, 'Bracket graph');
    await page.getByRole('tab', { name: 'Annotations' }).click();
    const lift = page.getByRole('textbox', { name: 'Move up or right', exact: true });
    await expect(lift).toHaveValue('0');
    const before = await barTop(page);

    const twin = page.locator('.chart-surface [data-hit="bracket"]').first();
    const box = (await twin.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 1);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y - 60, { steps: 8 });
    await page.mouse.up();

    expect(Number(await lift.inputValue())).toBeGreaterThan(20);
    expect(await barTop(page)).toBeLessThan(before - 20);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(lift).toHaveValue('0');
    expect(await barTop(page)).toBeCloseTo(before, 1);
    expect(errors).toEqual([]);
  });

  test('a number moves the bracket and a label of several lines is drawn line by line', async ({ page }) => {
    await open(page, 'Bracket graph');
    await page.getByRole('tab', { name: 'Annotations' }).click();
    const lift = page.getByRole('textbox', { name: 'Move up or right', exact: true });
    const before = await barTop(page);
    await lift.fill('40');
    await lift.press('Enter');
    expect(await barTop(page)).toBeCloseTo(before - 40, 1);

    const label = page.getByRole('textbox', { name: 'Label of bracket 1' });
    await label.fill('Welch t-test\np = 0.003');
    const texts = page.locator('.chart-surface svg text[id*="b1-bracket-label"]');
    await expect(texts).toHaveCount(2);
    await expect(texts.nth(0)).toHaveText('Welch t-test');
    await expect(texts.nth(1)).toHaveText('p = 0.003');
    const [y0, y1] = await texts.evaluateAll((all) => all.map((t) => Number(t.getAttribute('y'))));
    expect(y1 - y0).toBeCloseTo(16 * 1.2, 1);
  });
});

test.describe('the size legend of a bubble chart', () => {
  test('is a row of circles under the plot, takes the sizes typed, and goes with its switch', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page, 'Bubble graph');
    const circles = page.locator('.chart-surface svg circle[id^="size-legend-key"]');
    await expect(circles).toHaveCount(3);
    await expect(page.locator('.chart-surface svg text[id^="size-legend-label"]')).toHaveText(['20', '50', '100']);

    const sizes = page.getByRole('textbox', { name: 'Sizes shown', exact: true });
    await sizes.fill('5, 50');
    await sizes.press('Enter');
    await expect(circles).toHaveCount(2);
    await expect(page.locator('.chart-surface svg text[id^="size-legend-label"]')).toHaveText(['5', '50']);

    await sizes.fill('five');
    await sizes.press('Enter');
    await expect(page.getByText('Enter numbers separated by commas.')).toBeVisible();
    await expect(circles).toHaveCount(2);

    await page.getByLabel('Size legend', { exact: true }).uncheck();
    await expect(circles).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

test.describe('PDF', () => {
  test('is vector: shapes and text in the content, no picture, at the size of the graph', async ({ page }) => {
    await open(page, 'Bracket graph');
    await page.getByRole('button', { name: 'Export' }).first().click();
    const dialog = page.getByRole('dialog', { name: /^Export / });
    await dialog.getByRole('group', { name: 'Export format' }).getByRole('button', { name: 'PDF', exact: true }).click();
    // A PDF has no resolution.
    await expect(dialog.getByRole('combobox', { name: 'Resolution' })).toBeDisabled();
    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Export', exact: true }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.pdf$/);
    const bytes = await readFile(await file.path());
    const text = bytes.toString('latin1');
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text).not.toContain('/Image');
    expect(text).toMatch(/\/MediaBox\[0 0 768 576\]/);
    const m = /4 0 obj\n<<\/Filter\/FlateDecode\/Length (\d+)>>\nstream\n/.exec(text)!;
    const start = m.index + m[0].length;
    const stream = inflateSync(bytes.subarray(start, start + Number(m[1]))).toString('latin1');
    expect(stream).toContain('(p = 0.003) Tj');
    expect(stream).toMatch(/ re\nf/);
  });
});
