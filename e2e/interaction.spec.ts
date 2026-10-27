import { expect, test, type Page } from '@playwright/test';
import { drawing, navItem, openApp, openGraph, status } from './helpers';

/** The bars of the example graph, one for each data set, in drawing order. */
const bars = (page: Page) => page.locator('.chart-surface [data-hit="bar"][data-group-id]');
const dataSet = (page: Page) => page.locator('select[aria-label="Data set"]');
// The Opacity of the bars comes first.
const opacity = (page: Page) => page.getByRole('textbox', { name: 'Opacity', exact: true }).first();

test.describe('several data sets together', () => {
  test('Ctrl-click selects them, one edit reaches both, "Mixed" shows where they differ, and the dot resets them', async ({ page }) => {
    await openApp(page);
    await openGraph(page);
    await bars(page).nth(0).click();
    await bars(page).nth(1).click({ modifiers: ['Control'] });
    await expect(dataSet(page)).toContainText('2 data sets together');

    const before = await drawing(page);
    await opacity(page).fill('0.4');
    await opacity(page).press('Enter');
    expect(await drawing(page)).not.toBe(before);
    // The two agree now, and the others were not touched: adding a third that differs makes the field "Mixed".
    await expect(opacity(page)).toHaveValue('0.4');
    await bars(page).nth(2).click({ modifiers: ['Control'] });
    await expect(dataSet(page)).toContainText('3 data sets together');
    await expect(opacity(page)).toHaveValue('');
    await expect(opacity(page)).toHaveAttribute('placeholder', 'Mixed');
    await expect(page.locator('.mixed-tag').first()).toBeVisible();

    // The dot beside the field takes the setting back in the data sets that had their own.
    await page.getByRole('button', { name: "Reset Opacity to the graph's value" }).click();
    expect(await drawing(page)).toBe(before);
    await expect(opacity(page)).toHaveValue('1');
  });

  test('Ctrl-click on a selected data set takes it out again, and the boxes of the picker do the same', async ({ page }) => {
    await openApp(page);
    await openGraph(page);
    await bars(page).nth(0).click();
    await bars(page).nth(1).click({ modifiers: ['Control'] });
    await bars(page).nth(1).click({ modifiers: ['Control'] });
    await expect(dataSet(page)).not.toContainText('together');

    await page.getByText('Edit several data sets together…').click();
    const boxes = page.getByRole('group', { name: 'data sets edited together' }).getByRole('checkbox');
    await boxes.nth(1).check();
    await boxes.nth(2).check();
    await expect(dataSet(page)).toContainText('3 data sets together');
    await boxes.nth(0).uncheck();
    await expect(dataSet(page)).toContainText('2 data sets together');
  });

  test('Reset beside the selector puts the selected data sets back, in one step', async ({ page }) => {
    await openApp(page);
    await openGraph(page);
    const before = await drawing(page);
    await bars(page).nth(0).click();
    await bars(page).nth(1).click({ modifiers: ['Control'] });
    await opacity(page).fill('0.3');
    await opacity(page).press('Enter');
    expect(await drawing(page)).not.toBe(before);
    await page.getByRole('button', { name: "Reset these data sets to the graph's settings" }).click();
    expect(await drawing(page)).toBe(before);
  });
});

test.describe('annotations', () => {
  test('a dragged annotation keeps its new place, and Undo puts it back', async ({ page }) => {
    await openApp(page);
    await openGraph(page);
    await page.getByRole('tab', { name: 'Annotations' }).click();
    await page.getByRole('button', { name: '+ Add text annotation' }).click();
    const left = page.getByRole('textbox', { name: 'Left', exact: true });
    const before = Number(await left.inputValue());

    const note = page.locator('.chart-surface [data-hit="annotation"]').first();
    const box = (await note.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 90, { steps: 8 });
    await page.mouse.up();
    expect(Number(await left.inputValue())).toBeGreaterThan(before + 5);

    await page.getByRole('button', { name: 'Undo' }).click();
    expect(Number(await left.inputValue())).toBe(before);
  });

  test('anchored to data, a note follows the axis range, and a value outside the range hides it with a notice', async ({ page }) => {
    await openApp(page);
    await openGraph(page);
    await page.getByRole('tab', { name: 'Annotations' }).click();
    await page.getByRole('button', { name: '+ Add text annotation' }).click();
    await page.getByLabel('Anchor').selectOption('data');
    const yValue = page.getByRole('textbox', { name: 'Y value', exact: true });
    await yValue.fill('1');
    await yValue.press('Enter');
    const note = page.locator('.chart-surface [data-hit="annotation"]').first();
    const top = async () => (await note.boundingBox())!.y;
    const at1 = await top();

    // A higher value is higher on the page.
    await yValue.fill('2');
    await yValue.press('Enter');
    expect(await top()).toBeLessThan(at1);

    // Far above the axis range: not drawn, and the graph says so.
    await yValue.fill('1000');
    await yValue.press('Enter');
    await expect(page.locator('.chart-surface [data-hit="annotation"]')).toHaveCount(0);
    await expect(page.getByLabel('Chart warnings')).toContainText('anchored to values outside the axis range');
  });
});

test.describe('the legend', () => {
  test('Move right shifts the legend and nothing else, and Undo puts it back', async ({ page }) => {
    await openApp(page);
    await openGraph(page);
    await page.getByRole('tab', { name: 'Legend' }).click();
    const legend = page.locator('.chart-surface #legend');
    const plot = page.locator('.chart-surface #plot-area');
    const x0 = (await legend.boundingBox())!.x;
    const plot0 = await plot.boundingBox();
    await page.getByRole('textbox', { name: 'Move right', exact: true }).fill('-40');
    await page.getByRole('textbox', { name: 'Move right', exact: true }).press('Enter');
    expect((await legend.boundingBox())!.x).toBeLessThan(x0 - 10);
    expect(await plot.boundingBox()).toEqual(plot0);
    await page.getByRole('button', { name: 'Undo' }).click();
    expect((await legend.boundingBox())!.x).toBeCloseTo(x0, 1);
  });
});

test.describe('a narrow window', () => {
  test('the navigator closes when a different item is chosen, and stays when the open one is chosen again', async ({ page }) => {
    await openApp(page, { width: 800, height: 700 });
    const app = page.locator('.app');
    await page.getByRole('button', { name: 'Show navigation panel' }).click();
    await expect(app).toHaveAttribute('data-nav', 'open');
    await navItem(page, 'Data 1', 'COL').click();
    await expect(app).toHaveAttribute('data-nav', 'open');
    await navItem(page, 'Graph 1', 'BAR').click();
    await expect(app).toHaveAttribute('data-nav', 'closed');
    await expect(status(page)).toHaveText('');
    // The page does not scroll sideways.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});
