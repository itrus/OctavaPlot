import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { createEmptyProject } from '../src/model/defaults';
import { slotCount, standardArrangements } from '../src/model/project/layout';
import type { Layout, PageOrientation, Project } from '../src/model/types';
import { addChart, addDataTable, addLayout } from '../src/state/commands';
import { stringifyProject } from '../src/state/serialize';
import { openApp, openProject } from './helpers';

/**
 * The page layouts, in the browser. Each test builds its project here: three graphs (one of an XY, a column and a grouped table)
 * and the layouts it needs, opens it, and works the settings beside the page the way a person does.
 */

const GRAPHS = [
  { id: 'c-xy', name: 'Alpha XY', table: 'xy', type: 'xyScatter' },
  { id: 'c-col', name: 'Beta Column', table: 'column', type: 'bar' },
  { id: 'c-grp', name: 'Gamma Grouped', table: 'grouped', type: 'groupedBar' },
] as const;

/** A project of the three graphs and the layouts `layouts` names (each filled with the graphs from the first, in order). */
function projectOf(layouts: Array<{ name: string; over?: Parameters<typeof addLayout>[1] }>): string {
  let p: Project = createEmptyProject();
  for (const g of GRAPHS) {
    p = addDataTable(`t-${g.id}`, g.table, { sample: true })(p);
    p = addChart(g.id, `t-${g.id}`, undefined, g.type)(p);
    p = { ...p, charts: p.charts.map((c) => (c.id === g.id ? { ...c, name: g.name } : c)) };
  }
  layouts.forEach((l, i) => {
    p = addLayout(`l-${i}`, l.over ?? {}, GRAPHS[0].id)(p);
    p = { ...p, layouts: (p.layouts ?? []).map((x): Layout => (x.id === `l-${i}` ? { ...x, name: l.name } : x)) };
  });
  return stringifyProject({ ...p, name: 'layouts' });
}

async function open(page: Page, layouts: Parameters<typeof projectOf>[0]): Promise<void> {
  await openApp(page);
  await openProject(page, projectOf(layouts));
  await expect(page.getByLabel('Project name')).toHaveValue('layouts');
}

const openLayout = async (page: Page, name: string) => {
  await page.locator('.nav-item').filter({ hasText: name }).click();
  await expect(page.locator('.layout-page > svg')).toBeVisible();
};

const settings = (page: Page) => page.getByRole('complementary', { name: 'Layout settings' });
/** The graph chosen in each panel, by the select of "Graphs in the panels". */
const panelGraphs = (page: Page) => settings(page).getByLabel(/^Panel [A-Za-z0-9]+$/).evaluateAll((els) => els.map((e) => (e as HTMLSelectElement).selectedOptions[0]?.text));
/** The page's markup: it changes when anything drawn on the page changes. */
const pageMarkup = (page: Page) => page.locator('.layout-page > svg').evaluate((svg) => svg.innerHTML);

test.describe('the arrangements', () => {
  for (const orientation of ['landscape', 'portrait'] as PageOrientation[]) {
    test(`every standard arrangement of a ${orientation} page draws one panel for each slot`, async ({ page }) => {
      const standards = standardArrangements(orientation);
      await open(page, standards.map((s, i) => ({ name: `Page ${i} ${s.id}`, over: { orientation, arrangement: s.arrangement } })));
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      for (const [i, s] of standards.entries()) {
        await openLayout(page, `Page ${i} ${s.id}`);
        const markup = await pageMarkup(page);
        expect(markup, s.label).not.toMatch(/NaN|undefined|Infinity/);
        expect((await panelGraphs(page)).length, s.label).toBe(slotCount(s.arrangement));
        await expect(page.getByText(orientation === 'landscape' ? 'A4 landscape, 297 × 210 mm' : 'A4 portrait, 210 × 297 mm')).toBeVisible();
      }
      expect(errors).toEqual([]);
    });
  }

  test('an array of graphs across and down changes the number of panels, and Undo takes it back', async ({ page }) => {
    await open(page, [{ name: 'Array page', over: { arrangement: { kind: 'grid', cols: 2, rows: 1 } } }]);
    await openLayout(page, 'Array page');
    const count = async () => (await panelGraphs(page)).length;
    expect(await count()).toBe(2);
    const across = settings(page).getByLabel('Graphs across', { exact: true });
    const down = settings(page).getByLabel('Graphs down', { exact: true });
    await across.fill('3');
    await across.press('Enter');
    await expect.poll(count).toBe(3);
    await down.fill('2');
    await down.press('Enter');
    await expect.poll(count).toBe(6);
    // Undo takes back one step at a time: the rows, then the columns.
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(count).toBe(3);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(count).toBe(2);
  });
});

test.describe('the graphs in the panels', () => {
  test('a graph is filled in from the project, and choosing one that is already on the page swaps the two', async ({ page }) => {
    await open(page, [{ name: 'Swap page', over: { arrangement: { kind: 'grid', cols: 2, rows: 1 } } }]);
    await openLayout(page, 'Swap page');
    expect(await panelGraphs(page)).toEqual(['Alpha XY', 'Beta Column']);
    const before = await pageMarkup(page);

    // Panel B takes the graph that panel A has: the two change places, and nothing is lost.
    await settings(page).getByLabel('Panel B').selectOption({ label: 'Alpha XY' });
    expect(await panelGraphs(page)).toEqual(['Beta Column', 'Alpha XY']);
    expect(await pageMarkup(page)).not.toBe(before);

    await page.getByRole('button', { name: 'Undo' }).click();
    expect(await panelGraphs(page)).toEqual(['Alpha XY', 'Beta Column']);
    expect(await pageMarkup(page)).toBe(before);
  });

  test('an empty panel can be chosen, and the page then holds one graph less', async ({ page }) => {
    await open(page, [{ name: 'Empty page', over: { arrangement: { kind: 'grid', cols: 2, rows: 1 } } }]);
    await openLayout(page, 'Empty page');
    await expect(page.getByRole('img', { name: 'Empty page, 2 graphs' })).toBeVisible();
    await settings(page).getByLabel('Panel B').selectOption({ label: '(empty)' });
    await expect(page.getByRole('img', { name: 'Empty page, 1 graphs' })).toBeVisible();
  });
});

test.describe('the page', () => {
  test('turning the page changes its size, and Undo turns it back', async ({ page }) => {
    await open(page, [{ name: 'Turn page', over: { orientation: 'landscape' } }]);
    await openLayout(page, 'Turn page');
    await expect(page.getByText('A4 landscape, 297 × 210 mm')).toBeVisible();
    await settings(page).getByRole('button', { name: 'Portrait' }).click();
    await expect(page.getByText('A4 portrait, 210 × 297 mm')).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByText('A4 landscape, 297 × 210 mm')).toBeVisible();
  });

  test('a title, a panel-label style and the scaling are drawn on the page', async ({ page }) => {
    await open(page, [{ name: 'Look page', over: { arrangement: { kind: 'grid', cols: 2, rows: 1 } } }]);
    await openLayout(page, 'Look page');
    const plain = await pageMarkup(page);

    await settings(page).getByLabel('Title on top of the page').check();
    await settings(page).getByLabel('Title', { exact: true }).fill('Figure 1');
    await expect(page.locator('.layout-page > svg')).toContainText('Figure 1');

    await settings(page).getByLabel('Style', { exact: true }).selectOption({ index: 1 });
    expect(await pageMarkup(page)).not.toBe(plain);

    const titled = await pageMarkup(page);
    await settings(page).getByLabel('Scaling factor', { exact: true }).selectOption({ value: 'percent' });
    await settings(page).getByLabel('Percentage', { exact: true }).fill('50');
    await settings(page).getByLabel('Percentage', { exact: true }).press('Enter');
    expect(await pageMarkup(page)).not.toBe(titled);
  });

  test('a master legend takes a band of the page, and switching it off gives the room back', async ({ page }) => {
    await open(page, [{ name: 'Legend page', over: { arrangement: { kind: 'grid', cols: 2, rows: 1 } } }]);
    await openLayout(page, 'Legend page');
    const without = await pageMarkup(page);
    await settings(page).getByLabel('Master legend').check();
    await expect(settings(page).getByLabel('Text size', { exact: true })).toBeVisible();
    const withLegend = await pageMarkup(page);
    expect(withLegend).not.toBe(without);
    await settings(page).getByLabel('Master legend').uncheck();
    expect(await pageMarkup(page)).toBe(without);
  });
});

test.describe('free placement', () => {
  test('the boxes are typed in mm, panels are added and removed, and Undo takes each step back', async ({ page }) => {
    await open(page, [{ name: 'Free page', over: { arrangement: { kind: 'grid', cols: 2, rows: 1 } } }]);
    await openLayout(page, 'Free page');
    await settings(page).getByLabel('Panels', { exact: true }).selectOption({ value: 'free' });
    await expect(page.locator('.layout-frame')).toHaveCount(2);

    const before = await pageMarkup(page);
    await settings(page).getByLabel('Left', { exact: true }).fill('20');
    await settings(page).getByLabel('Left', { exact: true }).press('Enter');
    expect(await pageMarkup(page)).not.toBe(before);
    await expect(settings(page).getByLabel('Left', { exact: true })).toHaveValue('20');

    await settings(page).getByRole('button', { name: 'Add panel' }).click();
    await expect(page.locator('.layout-frame')).toHaveCount(3);
    await settings(page).getByRole('button', { name: 'Remove panel' }).click();
    await expect(page.locator('.layout-frame')).toHaveCount(2);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('.layout-frame')).toHaveCount(3);
  });

  test('a box dragged on the page keeps its new place', async ({ page }) => {
    await open(page, [{ name: 'Drag page', over: { arrangement: { kind: 'grid', cols: 2, rows: 1 } } }]);
    await openLayout(page, 'Drag page');
    await settings(page).getByLabel('Panels', { exact: true }).selectOption({ value: 'free' });
    const frame = page.locator('.layout-frame').first();
    const start = (await frame.boundingBox())!;
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(start.x + start.width / 2 + 40, start.y + start.height / 2 + 30, { steps: 5 });
    await page.mouse.up();
    const moved = (await page.locator('.layout-frame').first().boundingBox())!;
    expect(Math.round(moved.x - start.x)).toBeGreaterThan(20);
    expect(Math.round(moved.y - start.y)).toBeGreaterThan(10);
  });
});

test.describe('exporting a page', () => {
  /** Opens the export dialog of the layout, chooses the format, exports, and gives the downloaded bytes and name. */
  async function exportAs(page: Page, format: 'SVG' | 'PNG' | 'PDF'): Promise<{ bytes: Buffer; name: string; dialogText: string }> {
    await page.locator('.layout-view .toolbar').getByRole('button', { name: 'Export' }).click();
    const dialog = page.getByRole('dialog', { name: /^Export / });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('group', { name: 'Export format' }).getByRole('button', { name: format, exact: true }).click();
    const dialogText = (await dialog.textContent()) ?? '';
    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Export', exact: true }).click();
    const file = await download;
    return { bytes: await readFile(await file.path()), name: file.suggestedFilename(), dialogText };
  }

  test('SVG is the page as vector markup', async ({ page }) => {
    await open(page, [{ name: 'Export page', over: { arrangement: { kind: 'grid', cols: 2, rows: 1 } } }]);
    await openLayout(page, 'Export page');
    const { bytes, name } = await exportAs(page, 'SVG');
    expect(name).toMatch(/\.svg$/);
    const text = bytes.toString('utf8');
    expect(text).toMatch(/^<\?xml|^<svg/);
    expect(text).not.toMatch(/NaN|undefined/);
  });

  test('PNG has the size the dialog states, and PDF is one file that starts as a PDF', async ({ page }) => {
    await open(page, [{ name: 'Export page', over: { arrangement: { kind: 'grid', cols: 2, rows: 1 } } }]);
    await openLayout(page, 'Export page');
    const png = await exportAs(page, 'PNG');
    expect(png.name).toMatch(/\.png$/);
    const [, w, h] = /Picture: (\d+) × (\d+) px/.exec(png.dialogText) ?? [];
    expect([...png.bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(png.bytes.readUInt32BE(16)).toBe(Number(w));
    expect(png.bytes.readUInt32BE(20)).toBe(Number(h));

    const pdf = await exportAs(page, 'PDF');
    expect(pdf.name).toMatch(/\.pdf$/);
    expect(pdf.bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});
