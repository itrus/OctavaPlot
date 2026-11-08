import { expect, test } from '@playwright/test';
import { openApp, openGraph, openTable } from './helpers';

/** Going to the table and back finds the graph's settings where they were left: the page of the rail, its tab, and how far they were scrolled. */
test.describe('the inspector of a graph after a visit to a table', () => {
  const rail = (page: import('@playwright/test').Page) => page.getByRole('navigation', { name: 'Graph settings pages' });
  const insp = (page: import('@playwright/test').Page) => page.locator('.insp-main');

  test('keeps the page, the tab and the scroll', async ({ page }) => {
    await openApp(page);
    await openGraph(page);
    // A new graph starts on the Graph page.
    await expect(rail(page).getByRole('tab', { name: 'Graph' })).toHaveAttribute('aria-selected', 'true');

    await rail(page).getByRole('tab', { name: 'Plot' }).click();
    await page.getByRole('tablist', { name: 'Plot settings' }).getByRole('tab', { name: 'Frame' }).click();
    await rail(page).getByRole('tab', { name: 'Legend' }).click();
    await rail(page).getByRole('tab', { name: 'Plot' }).click();
    await page.getByRole('tablist', { name: 'Plot settings' }).getByRole('tab', { name: 'Style' }).click();
    // Scroll the settings of the Plot page down.
    await insp(page).evaluate((el) => { el.scrollTop = 200; });
    const left = await insp(page).evaluate((el) => el.scrollTop);
    expect(left).toBeGreaterThan(50);
    await page.getByRole('tablist', { name: 'Plot settings' }).getByRole('tab', { name: 'Frame' }).click();
    await page.getByRole('tablist', { name: 'Plot settings' }).getByRole('tab', { name: 'Style' }).click();
    await insp(page).evaluate((el) => { el.scrollTop = 200; });
    await expect.poll(() => insp(page).evaluate((el) => el.scrollTop)).toBe(left);

    await openTable(page);
    await expect(page.locator('.inspector')).toHaveCount(0);
    await openGraph(page);

    await expect(rail(page).getByRole('tab', { name: 'Plot' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tablist', { name: 'Plot settings' }).getByRole('tab', { name: 'Style' })).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => insp(page).evaluate((el) => el.scrollTop)).toBe(left);

    // The tab chosen on another page is kept too.
    await page.getByRole('tablist', { name: 'Plot settings' }).getByRole('tab', { name: 'Frame' }).click();
    await rail(page).getByRole('tab', { name: 'Axes' }).click();
    await openTable(page);
    await openGraph(page);
    await expect(rail(page).getByRole('tab', { name: 'Axes' })).toHaveAttribute('aria-selected', 'true');
    await rail(page).getByRole('tab', { name: 'Plot' }).click();
    await expect(page.getByRole('tablist', { name: 'Plot settings' }).getByRole('tab', { name: 'Frame' })).toHaveAttribute('aria-selected', 'true');
  });

  test('keeps a section open that was opened by hand', async ({ page }) => {
    await openApp(page);
    await openGraph(page);
    await rail(page).getByRole('tab', { name: 'Plot' }).click();
    // The head of a section has an arrow before its name; Layers starts shut.
    const layers = () => page.locator('.insp-section-head', { hasText: 'Layers' });
    await expect(layers()).toHaveAttribute('aria-expanded', 'false');
    await layers().click();
    await expect(layers()).toHaveAttribute('aria-expanded', 'true');

    await openTable(page);
    await openGraph(page);

    await expect(layers()).toHaveAttribute('aria-expanded', 'true');
    // Shut again by hand, it stays shut.
    await layers().click();
    await openTable(page);
    await openGraph(page);
    await expect(layers()).toHaveAttribute('aria-expanded', 'false');
  });
});
