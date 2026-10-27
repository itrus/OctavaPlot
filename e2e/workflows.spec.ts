import { expect, test } from '@playwright/test';
import { cell, drawing, navItem, openApp, openGraph, openTable, status } from './helpers';

test.describe('editing the data', () => {
  test('a typed value reaches the graph, and Undo takes it back', async ({ page }) => {
    await openApp(page);
    await openGraph(page);
    const before = await drawing(page);

    await openTable(page);
    await cell(page, 0, 0).click();
    await page.keyboard.type('9');
    await page.keyboard.press('Enter');
    await expect(cell(page, 0, 0)).toHaveText('9');

    await openGraph(page);
    expect(await drawing(page)).not.toBe(before);

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('.statusbar-message')).toContainText('Undid');
    expect(await drawing(page)).toBe(before);
  });

  test('an excluded value leaves the graph and Include brings it back', async ({ page }) => {
    await openApp(page);
    await openGraph(page);
    const before = await drawing(page);

    await openTable(page);
    await cell(page, 0, 0).click();
    await page.getByRole('button', { name: 'Exclude' }).click();
    await openGraph(page);
    expect(await drawing(page)).not.toBe(before);

    await openTable(page);
    await cell(page, 0, 0).click();
    await page.getByRole('button', { name: 'Include' }).click();
    await openGraph(page);
    expect(await drawing(page)).toBe(before);
  });
});

test.describe('graphs', () => {
  test('Duplicate adds a copy, with a message that goes at the next action; Undo removes the copy', async ({ page }) => {
    await openApp(page);
    await openGraph(page);
    const graphs = page.locator('.nav-item').filter({ hasText: /BAR$/ });
    const count = await graphs.count();

    await page.getByRole('button', { name: 'Duplicate' }).click();
    await expect(graphs).toHaveCount(count + 1);
    await expect(status(page)).toContainText('Duplicated Graph 1.');

    // The message belongs to the action: the next one clears it.
    await navItem(page, 'Data 1', 'COL').click();
    await expect(status(page)).toHaveText('');

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(graphs).toHaveCount(count);
    await expect(status(page)).toContainText('Undid');
  });
});

test.describe('files', () => {
  test('a saved project opens again with its name and its graphs', async ({ page }) => {
    await openApp(page);
    await page.getByLabel('Project name').fill('Round trip');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save Project' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^Round_trip.*\.oplot$/);
    const path = await file.path();
    const text = await (await import('node:fs/promises')).readFile(path, 'utf8');
    const saved = (JSON.parse(text) as { project: { name: string; charts: unknown[] } }).project;
    expect(saved.name).toBe('Round trip');
    expect(saved.charts.length).toBeGreaterThan(0);

    // Another project, then the saved one again through the file input of Open Project.
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(status(page)).toHaveText('New project.');
    await page.locator('input[type="file"][accept*="oplot"]').setInputFiles({ name: file.suggestedFilename(), mimeType: 'application/json', buffer: Buffer.from(text) });
    await expect(page.getByLabel('Project name')).toHaveValue('Round trip');
    await expect(page.locator('.nav-item').filter({ hasText: /BAR$/ })).toHaveCount(saved.charts.length);
  });

  test('a PNG export has the size and the resolution the dialog states', async ({ page }) => {
    await openApp(page);
    await openGraph(page);
    await page.getByRole('button', { name: 'Export' }).first().click();
    const dialog = page.getByRole('dialog', { name: /^Export / });
    await expect(dialog).toBeVisible();
    const text = (await dialog.getByText(/^Picture: /).textContent()) ?? '';
    const [, w, h, dpi] = /Picture: (\d+) × (\d+) px at (\d+) dpi/.exec(text) ?? [];
    expect(Number(w)).toBeGreaterThan(0);

    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Export', exact: true }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.png$/);
    const bytes = await (await import('node:fs/promises')).readFile(await file.path());
    // The PNG signature, then the IHDR chunk with the width and the height.
    expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(bytes.readUInt32BE(16)).toBe(Number(w));
    expect(bytes.readUInt32BE(20)).toBe(Number(h));
    // The resolution is written into the file (pHYs, pixels per metre).
    const phys = bytes.indexOf(Buffer.from('pHYs'));
    expect(phys).toBeGreaterThan(0);
    expect(Math.round(bytes.readUInt32BE(phys + 4) * 0.0254)).toBe(Number(dpi));
  });
});
