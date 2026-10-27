import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Opens the app with the example project. The browser's own file pickers are switched off so that saving and opening go through
 * a download and a file input, which a test can drive (the native dialogs cannot be reached).
 */
export async function openApp(page: Page, viewport?: { width: number; height: number }): Promise<void> {
  if (viewport) await page.setViewportSize(viewport);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true });
    Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true });
  });
  await page.goto('./');
  await expect(page.locator('.nav-tree')).toBeVisible();
  // The first view is loaded in a separate chunk.
  await expect(page.getByRole('grid', { name: 'Data table' })).toBeVisible();
}

/** An item of the navigator by its name and badge (the badge is part of its text: "Graph 1BAR"). */
export const navItem = (page: Page, name: string, badge: 'BAR' | 'COL' | 'XY' | 'GRP' | string): Locator => page.locator('.nav-item').filter({ hasText: new RegExp(`${name.replace(/[()]/g, '\\$&')}${badge}$`) });

/** Opens the example graph (Graph 1) and waits for its drawing. */
export async function openGraph(page: Page, name = 'Graph 1'): Promise<void> {
  await navItem(page, name, 'BAR').click();
  await expect(page.locator('.chart-surface svg')).toBeVisible();
}

/** Opens a table by name. */
export async function openTable(page: Page, name = 'Data 1'): Promise<void> {
  await navItem(page, name, 'COL').click();
  await expect(page.getByRole('grid', { name: 'Data table' })).toBeVisible();
}

/** A cell of the data grid by row and column (both from 0; column -1 is the Row title). */
export const cell = (page: Page, row: number, col: number): Locator => page.locator(`#grid-cell-${row}-${col}`);

/** The drawing of the graph as markup, without the editor's own marks (selection outlines): it changes when anything drawn changes. */
export const drawing = (page: Page): Promise<string> =>
  page.locator('.chart-surface svg').evaluate((svg) => {
    const copy = svg.cloneNode(true) as SVGElement;
    copy.querySelectorAll('[data-editor-only]').forEach((e) => e.remove());
    return copy.innerHTML;
  });

/** The line read out to screen readers for the selection on the chart. */
export const announced = (page: Page): Locator => page.locator('.chart-wrap [role="status"]');

/** The status bar message. */
export const status = (page: Page): Locator => page.locator('.statusbar-message');
