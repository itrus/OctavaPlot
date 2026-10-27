import { expect, test, type Page } from '@playwright/test';
import { announced, cell, navItem, openApp, openGraph, openTable } from './helpers';

const activeCell = (page: Page) => page.getByRole('grid', { name: 'Data table' }).getAttribute('aria-activedescendant');

test.describe('the data grid', () => {
  test('Home, End and their Ctrl forms move along the row and to the corners', async ({ page }) => {
    await openApp(page);
    await cell(page, 2, 1).click();
    await page.keyboard.press('End');
    expect(await activeCell(page)).toBe('grid-cell-2-3');
    await page.keyboard.press('Home');
    expect(await activeCell(page)).toBe('grid-cell-2--1');
    await page.keyboard.press('Control+End');
    expect(await activeCell(page)).toMatch(/^grid-cell-(\d+)-3$/);
    const lastRow = Number(/grid-cell-(\d+)-3/.exec((await activeCell(page)) ?? '')?.[1]);
    expect(lastRow).toBeGreaterThan(4);
    await page.keyboard.press('Control+Home');
    expect(await activeCell(page)).toBe('grid-cell-0--1');
  });

  test('Ctrl+D fills the selection down from its first row, and Undo takes it back', async ({ page }) => {
    await openApp(page);
    await cell(page, 0, 0).click();
    await cell(page, 2, 1).click({ modifiers: ['Shift'] });
    const first = await cell(page, 0, 0).textContent();
    await page.keyboard.press('Control+d');
    await expect(cell(page, 1, 0)).toHaveText(first ?? '');
    await expect(cell(page, 2, 0)).toHaveText(first ?? '');
    await expect(page.getByRole('status').filter({ hasText: 'Filled down' })).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(cell(page, 1, 0)).not.toHaveText(first ?? '');
  });

  test('Fill series writes start, start + step ... into the selected cells', async ({ page }) => {
    await openApp(page);
    // Three empty cells below the data.
    await cell(page, 5, 0).click();
    await cell(page, 7, 0).click({ modifiers: ['Shift'] });
    await page.getByRole('button', { name: 'Rows' }).click();
    await page.getByRole('menuitem', { name: /Fill series/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Fill series' });
    await dialog.getByLabel('Start').fill('10');
    await dialog.getByLabel('Step').fill('2.5');
    await dialog.getByRole('button', { name: 'Fill' }).click();
    await expect(cell(page, 5, 0)).toHaveText('10');
    await expect(cell(page, 6, 0)).toHaveText('12.5');
    await expect(cell(page, 7, 0)).toHaveText('15');
  });
});

test.describe('the chart', () => {
  test('arrow keys select data sets and points, Escape returns, and the selection is read out', async ({ page }) => {
    await openApp(page);
    await openGraph(page);
    await page.locator('.chart-surface').click({ position: { x: 8, y: 8 } });
    await expect(announced(page)).toHaveText('Whole chart');
    await page.keyboard.press('ArrowRight');
    await expect(announced(page)).toHaveText(/^Group [A-D], data set 1 of 4, 5 points$/);
    await page.keyboard.press('ArrowRight');
    await expect(announced(page)).toHaveText(/^Group [A-D], data set 2 of 4, 5 points$/);
    const second = /^(Group [A-D])/.exec((await announced(page).textContent()) ?? '')?.[1] ?? '';
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(announced(page)).toHaveText(new RegExp(`^${second}, point 2 of 5: value `));
    // The inspector follows the selection.
    await expect(page.locator('select[aria-label="Data set"]')).toContainText(second);
    await page.keyboard.press('Escape');
    await expect(announced(page)).toHaveText('Whole chart');
  });

  test('the title, the legend and the axes are stops after the data sets, and Enter opens their settings', async ({ page }) => {
    await openApp(page);
    await openGraph(page);
    await page.locator('.chart-surface').click({ position: { x: 8, y: 8 } });
    // Four data sets, then the title, the legend and the axes.
    await page.keyboard.press('ArrowRight', { delay: 0 });
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
    await expect(announced(page)).toHaveText('Chart title. Press Enter to open its settings.');
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('Chart title', { exact: true })).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(announced(page)).toHaveText('Legend. Press Enter to open its settings.');
    await expect(page.locator('.key-stop')).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.getByText('Show legend')).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(announced(page)).toHaveText('X axis. Press Enter to open its settings.');
    await page.keyboard.press('Enter');
    await expect(page.getByText('Tick direction').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(announced(page)).toHaveText('Whole chart');
    await expect(page.locator('.key-stop')).toHaveCount(0);
  });

  test('Shift with Left and Right selects several data sets, which the inspector edits together', async ({ page }) => {
    await openApp(page);
    await openGraph(page);
    await page.locator('.chart-surface').click({ position: { x: 8, y: 8 } });
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await expect(announced(page)).toHaveText(/^Group [A-D], Group [A-D], Group [A-D]: 3 data sets edited together$/);
    await expect(page.locator('select[aria-label="Data set"]')).toContainText('3 data sets together');
  });
});

test.describe('the navigator', () => {
  test('arrow keys move between the folders and pages, Left and Right fold a folder', async ({ page }) => {
    await openApp(page);
    await navItem(page, 'Graph 1', 'BAR').click();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator(':focus')).toContainText('New Graph');
    await page.keyboard.press('ArrowUp');
    await expect(page.locator(':focus')).toContainText('Graph 1');
    await page.keyboard.press('Home');
    await expect(page.locator(':focus')).toHaveText('Data Tables');
    await page.keyboard.press('ArrowLeft');
    await expect(navItem(page, 'Data 1', 'COL')).toHaveCount(0);
    await page.keyboard.press('ArrowRight');
    await expect(navItem(page, 'Data 1', 'COL')).toHaveCount(1);
    await page.keyboard.press('End');
    await expect(page.locator(':focus')).toContainText('New Layout');
  });
});

test.describe('dialogs', () => {
  test('the Export dialog takes the focus, keeps it, and gives it back on Escape', async ({ page }) => {
    await openApp(page);
    await openTable(page);
    await openGraph(page);
    const toolbarExport = page.getByRole('button', { name: 'Export' }).first();
    await toolbarExport.click();
    const dialog = page.getByRole('dialog', { name: /^Export / });
    await expect(dialog).toBeVisible();
    const inside = () => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
    expect(await inside()).toBe(true);
    // Tabbing round and round never leaves the dialog.
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Tab');
      expect(await inside()).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(toolbarExport).toBeFocused();
  });
});
