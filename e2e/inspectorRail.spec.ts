import { expect, test } from '@playwright/test';
import { drawing, openApp, openGraph, openProject } from './helpers';
import { createEmptyProject } from '../src/model/defaults';
import { availableItems } from '../src/model/graph/chartGallery';
import { addChart, addDataTable } from '../src/state/commands';
import { stringifyProject } from '../src/state/serialize';

test.describe('the icon rail of the inspector', () => {
  test('its pages show their own settings, a click on the chart goes to the page of what was clicked', async ({ page }) => {
    await openApp(page);
    await openGraph(page);
    const rail = page.getByRole('navigation', { name: 'Graph settings pages' });
    for (const name of ['Graph', 'Plot', 'Axes', 'Legend', 'Notes', 'Export']) await expect(rail.getByRole('tab', { name })).toBeVisible();
    // A bar chart has nothing to analyse: the centre it is drawn at is on Plot, with its calculation options.
    await expect(rail.getByRole('tab', { name: 'Analysis' })).toHaveCount(0);

    // Graph is open first; Plot holds the style of the data sets.
    await expect(rail.getByRole('tab', { name: 'Graph' })).toHaveAttribute('aria-selected', 'true');
    await rail.getByRole('tab', { name: 'Plot' }).click();
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
    await panel.getByRole('button', { name: /^Export .+\.svg$/ }).click();
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

test.describe('the graph a new graph starts as is among the thumbnails of the Type tab', () => {
  /** A project of a grouped table of replicates and a graph made as the New Graph dialog makes its first entry (Interleaved scatter). */
  const groupedProject = () => {
    let p = addDataTable('t', 'grouped', { sample: true })(createEmptyProject());
    const first = availableItems('grouped')[0];
    p = addChart('c', 't', undefined, first.type!, first.variant)(p);
    p = { ...p, charts: p.charts.map((c) => (c.id === 'c' ? { ...c, name: 'Grouped graph' } : c)) };
    return stringifyProject({ ...p, name: 'grouped' });
  };

  test('Interleaved scatter is a thumbnail, is the chosen one at first, and Interleaved bars changes the drawing', async ({ page }) => {
    await openApp(page);
    await openProject(page, groupedProject());
    await page.locator('.nav-item').filter({ hasText: 'Grouped graph' }).click();
    await expect(page.locator('.chart-surface svg')).toBeVisible();
    await page.getByRole('navigation', { name: 'Graph settings pages' }).getByRole('tab', { name: 'Graph' }).click();
    const scatter = page.getByRole('radio', { name: 'Interleaved scatter' });
    const bars = page.getByRole('radio', { name: 'Interleaved bars' });
    await expect(scatter).toHaveAttribute('aria-checked', 'true');
    await expect(bars).toHaveAttribute('aria-checked', 'false');
    const dots = await drawing(page);
    await bars.click();
    await expect(bars).toHaveAttribute('aria-checked', 'true');
    await expect(scatter).toHaveAttribute('aria-checked', 'false');
    expect(await drawing(page)).not.toBe(dots);
    await scatter.click();
    await expect(scatter).toHaveAttribute('aria-checked', 'true');
    expect(await drawing(page)).toBe(dots);
  });
});
