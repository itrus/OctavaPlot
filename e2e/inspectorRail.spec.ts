import { expect, test } from '@playwright/test';
import { drawing, openApp, openGraph } from './helpers';

test.describe('the icon rail of the inspector', () => {
  test('its pages show their own settings, a click on the chart goes to the page of what was clicked', async ({ page }) => {
    await openApp(page);
    await openGraph(page);
    const rail = page.getByRole('navigation', { name: 'Graph settings pages' });
    for (const name of ['Graph', 'Plot', 'Axes', 'Legend', 'Analysis', 'Notes', 'Export']) await expect(rail.getByRole('tab', { name })).toBeVisible();

    // Plot is open first and holds the style of the data sets.
    await expect(rail.getByRole('tab', { name: 'Plot' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('textbox', { name: 'Opacity', exact: true }).first()).toBeVisible();

    // Another page replaces it.
    await rail.getByRole('tab', { name: 'Axes' }).click();
    await expect(rail.getByRole('tab', { name: 'Axes' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('textbox', { name: 'Opacity', exact: true })).toHaveCount(0);

    // A click on a bar goes back to Plot.
    await page.locator('.chart-surface [data-hit="bar"][data-group-id]').first().click();
    await expect(rail.getByRole('tab', { name: 'Plot' })).toHaveAttribute('aria-selected', 'true');
  });

  test('the Export page is in the panel, not a pop-up, and exports a file', async ({ page }) => {
    await openApp(page);
    await openGraph(page);
    await page.getByRole('navigation', { name: 'Graph settings pages' }).getByRole('tab', { name: 'Export' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const panel = page.locator('.export-panel');
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: /^SVG/ }).click();
    const download = page.waitForEvent('download');
    await panel.getByRole('button', { name: 'Export .svg' }).click();
    expect((await download).suggestedFilename()).toMatch(/.svg$/);
  });
});

test.describe('the graph type tab', () => {
  test('is the first tab of the Graph page, lists the types of the table and changes the graph', async ({ page }) => {
    await openApp(page);
    await openGraph(page);
    await page.getByRole('navigation', { name: 'Graph settings pages' }).getByRole('tab', { name: 'Graph' }).click();
    await expect(page.getByRole('tab', { name: 'Type' })).toHaveAttribute('aria-selected', 'true');
    const before = await drawing(page);
    await page.getByRole('radio', { name: /Scatter/i }).first().click();
    await expect(page.getByRole('radio', { name: /Scatter/i }).first()).toHaveAttribute('aria-checked', 'true');
    expect(await drawing(page)).not.toBe(before);
  });
});
