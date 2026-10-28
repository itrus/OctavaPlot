import { expect, test, type Page } from '@playwright/test';
import { createExampleProject } from '../src/model/defaults';
import { addAnalysis, addChart, addDataTable, composeCommands, patchLook, replaceTableData } from '../src/state/commands';
import { stringifyProject } from '../src/state/serialize';
import { openApp } from './helpers';

/**
 * A fit that takes long (the two-phase exponential) is made in a Web Worker: the graph is drawn at once without the curve and says
 * that it is fitting, a style edit during the fit is not held up, and the curve appears when the fit is done.
 */

/** An XY table of `rows` points of a sum of two exponentials with a little noise (the same every time), with a two-phase fit drawn on a graph. */
function fitProject(rows: number): string {
  let seed = 4242;
  const next = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const values = Array.from({ length: rows }, (_, i) => {
    const x = 0.1 + (i / rows) * 10;
    return [Math.round(x * 1000) / 1000, Math.round((3 + 4 * Math.exp(-0.7 * x) + 1.5 * Math.exp(-0.05 * x) + (next() - 0.5) * 0.4) * 1000) / 1000];
  });
  const p = composeCommands(
    addDataTable('t_fit', 'xy'),
    replaceTableData('t_fit', { names: ['X', 'Y'], titles: null, values }),
    addAnalysis('a_fit', 't_fit', 'curvefit', { model: 'exp_two_phase' }),
    addChart('c_fit', 't_fit', { widthPx: 800, heightPx: 600 }, 'xyScatter'),
    patchLook('c_fit', { fit: { analysisId: 'a_fit', band: 'confidence', extend: false, showParameters: false } }),
  )(createExampleProject());
  return stringifyProject({ ...p, name: 'fit-worker' });
}

const openProject = (page: Page, json: string) => page.locator('input[type="file"][accept*="oplot"]').setInputFiles({ name: 'fit.oplot', mimeType: 'application/json', buffer: Buffer.from(json) });

test('a long fit does not block the page: a title edit during the fit is drawn at once, and the curve comes when it is done', async ({ page }) => {
  test.setTimeout(240_000);
  await openApp(page);
  await openProject(page, fitProject(300));
  await expect(page.getByLabel('Project name')).toHaveValue('fit-worker');
  // The gaps between frames, from now on: a fit on the main thread would show as one very long gap.
  await page.evaluate(() => {
    const w = window as unknown as { __gaps: number[] };
    w.__gaps = [];
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      w.__gaps.push(now - last);
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const opened = Date.now();
  await page.locator('.nav-item').filter({ hasText: /SCAT$/ }).click();
  await expect(page.locator('.chart-surface svg')).toBeVisible();
  const fitting = page.getByRole('status').filter({ hasText: 'Fitting the curve' });
  await expect(fitting).toBeVisible();
  // Pending: the data are drawn, the curve is not, and the export waits for the final fit.
  await expect(page.locator('.chart-surface svg [id$="fitCurve"]')).toHaveCount(0);
  expect(await page.locator('.chart-surface svg [id*="-points-"]').count()).toBeGreaterThan(100);
  await expect(page.getByRole('button', { name: 'Export' })).toBeDisabled();

  // A style edit while the fit runs is on the screen within a moment (not after the fit).
  await page.getByRole('tab', { name: 'Text' }).click();
  const edited = Date.now();
  await page.getByLabel('Chart title', { exact: true }).fill('Edited during the fit');
  await expect(page.locator('.chart-surface svg #chart-title')).toHaveText('Edited during the fit', { timeout: 3000 });
  const editMs = Date.now() - edited;

  await expect(page.locator('.chart-surface svg [id$="fitCurve"]').first()).toBeVisible({ timeout: 180_000 });
  const fitMs = Date.now() - opened;
  await expect(fitting).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Export' })).toBeEnabled();
  // The edit made during the fit is still there. (This noisy data does not settle, so the fit says so and draws no band: no uncertainty from a fit that is doubtful.)
  await expect(page.locator('.chart-surface svg #chart-title')).toHaveText('Edited during the fit');
  await expect(page.locator('.chart-surface svg [id$="fitBand"]')).toHaveCount(0);
  await expect(page.locator('.warnings')).toContainText('did not settle');
  const worst = await page.evaluate(() => Math.max(...(window as unknown as { __gaps: number[] }).__gaps));
  console.log(`fit worker: title edit drawn after ${editMs} ms; curve after ${fitMs} ms; longest gap between frames ${Math.round(worst)} ms`);
  expect(worst).toBeLessThan(1000);
});
