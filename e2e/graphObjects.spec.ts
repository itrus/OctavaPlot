import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';
import { createEmptyProject } from '../src/model/defaults';
import { applyVariant } from '../src/model/graph/chartVariant';
import type { Project } from '../src/model/types';
import { createDrawing, presetById } from '../src/model/graph/drawingPresets';
import { addChart, addDataTable, addDrawing, replaceTableData } from '../src/state/commands';
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
