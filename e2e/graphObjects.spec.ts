import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';
import { createEmptyProject } from '../src/model/defaults';
import { applyVariant } from '../src/model/graph/chartVariant';
import type { Project } from '../src/model/types';
import { createDrawing, presetById } from '../src/model/graph/drawingPresets';
import { addChart, addDataTable, addDrawing, addLayout, replaceTableData } from '../src/state/commands';
import { stringifyProject } from '../src/state/serialize';
import { openApp, openProject, railPage } from './helpers';

/** A bar chart with a bracket drawn on it (a drawing object with a text), and a bubble chart made as the gallery makes it, opened in the browser. */
function project(): string {
  let p: Project = addDataTable('t', 'column', { sample: true })(createEmptyProject());
  p = addChart('c', 't', undefined, 'bar')(p);
  p = addDrawing({ chartId: 'c' }, { ...createDrawing(presetById('bracketText')!, { xFrac: 0.2, yFrac: 0.2 }, { xFrac: 0.7, yFrac: 0.2 }, { color: '#aa0000', fontSizePt: 16, widthPt: 2 }, 'b1'), text: 'p = 0.003' })(p);
  p = addDataTable('s', 'xy', { sample: true, layout: { kind: 'sized' } })(p);
  p = replaceTableData('s', { names: ['X', 'Y', 'Count'], titles: null, values: [[1, 5, 10], [2, 6, 40], [3, 7, 100]] })(p);
  p = addChart('d', 's', undefined, 'xyBubble')(p);
  p = { ...p, charts: p.charts.map((c) => (c.id === 'd' ? { ...applyVariant(c, { bubbles: true }), name: 'Bubble graph' } : c.id === 'c' ? { ...c, name: 'Bracket graph' } : c)) };
  // An empty page, for pasting onto.
  p = addLayout('page', { arrangement: { kind: 'grid', cols: 1, rows: 1 } })(p);
  p = { ...p, layouts: p.layouts!.map((l) => ({ ...l, name: 'Paste page' })) };
  return stringifyProject({ ...p, name: 'graph objects' });
}

async function open(page: Page, graph: string) {
  await openApp(page);
  await openProject(page, project());
  await page.locator('.nav-item').filter({ hasText: graph }).click();
  await expect(page.locator('.chart-surface svg')).toBeVisible();
}

test.describe('the size legend of a bubble chart', () => {
  test('is a row of circles under the plot, takes the sizes typed, and goes with its switch', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page, 'Bubble graph');
    const circles = page.locator('.chart-surface svg circle[id^="size-legend-key"]');
    await expect(circles).toHaveCount(3);
    await expect(page.locator('.chart-surface svg text[id^="size-legend-label"]')).toHaveText(['20', '50', '100']);

    await railPage(page, 'Plot');
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
    await expect(page.getByRole('navigation', { name: 'Graph settings pages' })).toBeVisible();
    await page.getByRole('navigation', { name: 'Graph settings pages' }).getByRole('tab', { name: 'Export' }).click();
    const panel = page.locator('.export-panel');
    await panel.getByRole('button', { name: /^PDF/ }).click();
    // A PDF has no resolution.
    await expect(panel.getByRole('combobox', { name: /Resolution/ })).toHaveCount(0);
    const download = page.waitForEvent('download');
    await panel.getByRole('button', { name: /^Export .+\.pdf$/ }).click();
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

test.describe('copy and paste of texts and shapes', () => {
  const shapes = (page: Page) => page.locator('.chart-surface [data-hit="drawing"]');
  test('Ctrl+C and Ctrl+V paste a copy beside the shape, Ctrl+X takes it away, and a copy goes to another graph', async ({ page }) => {
    await open(page, 'Bracket graph');
    await expect(shapes(page)).toHaveCount(1);
    await shapes(page).first().click();
    await page.keyboard.press('ControlOrMeta+c');
    await page.keyboard.press('ControlOrMeta+v');
    await expect(shapes(page)).toHaveCount(2);
    // The copy is moved a little, so it does not hide the original.
    const [a, b] = [await shapes(page).nth(0).boundingBox(), await shapes(page).nth(1).boundingBox()];
    expect(Math.abs(a!.x - b!.x) + Math.abs(a!.y - b!.y)).toBeGreaterThan(2);
    // The pasted copy is selected: Ctrl+X takes it off the graph.
    await page.keyboard.press('ControlOrMeta+x');
    await expect(shapes(page)).toHaveCount(1);
    // What was cut is on the clipboard and goes onto another graph.
    await page.locator('.nav-item').filter({ hasText: 'Bubble graph' }).click();
    await expect(page.locator('.chart-surface svg')).toBeVisible();
    await expect(shapes(page)).toHaveCount(0);
    await page.locator('.chart-surface').focus();
    await page.keyboard.press('ControlOrMeta+v');
    await expect(shapes(page)).toHaveCount(1);
    await expect(shapes(page).first()).toContainText('p = 0.003');
  });
  test('a shape copied from a graph pastes onto a page, and a plain text pastes as a new text', async ({ page }) => {
    await open(page, 'Bracket graph');
    await shapes(page).first().click();
    await page.keyboard.press('ControlOrMeta+c');
    await page.locator('.nav-item').filter({ hasText: 'Paste page' }).click();
    const pageShapes = page.locator('.layout-drawings [data-hit="drawing"]');
    await expect(pageShapes).toHaveCount(0);
    await page.locator('.layout-page-wrap').focus();
    await page.keyboard.press('ControlOrMeta+v');
    await expect(pageShapes).toHaveCount(1);
    await expect(page.locator('.statusbar-message')).toContainText('Pasted 1 shape.');
    // Text from elsewhere becomes a text of the page.
    await page.evaluate(() => navigator.clipboard.writeText('Figure 1'));
    await page.locator('.layout-page-wrap').focus();
    await page.keyboard.press('ControlOrMeta+v');
    await expect(page.locator('.statusbar-message')).toContainText('Pasted the text as a new text.');
    await expect(page.locator('.layout-page')).toContainText('Figure 1');
  });
});
