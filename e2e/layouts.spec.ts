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

/** The page is drawn wider than tall when landscape and taller than wide when portrait (A4: 297 × 210 mm or 210 × 297 mm). */
async function expectOrientation(page: Page, orientation: PageOrientation): Promise<void> {
  await expect
    .poll(async () => {
      const box = await page.locator('.layout-page').boundingBox();
      return box ? (box.width > box.height ? 'landscape' : 'portrait') : 'none';
    })
    .toBe(orientation);
}

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

/** The settings of the page of the inspector in view (the right panel), and a page of its rail. */
const settings = (page: Page) => page.getByRole('tabpanel');
const tab = (page: Page, name: 'Page' | 'Panels' | 'Graphs' | 'Legend' | 'Export') => page.getByRole('navigation', { name: 'Layout settings pages' }).getByRole('tab', { name }).click();
/** The graph chosen in each panel, by the select of "Graphs in the panels". */
const panelGraphs = async (page: Page) => {
  await tab(page, 'Graphs');
  return settings(page).getByLabel(/^Panel [A-Za-z0-9]+$/).evaluateAll((els) => els.map((e) => (e as HTMLSelectElement).selectedOptions[0]?.text));
};
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
        await expectOrientation(page, orientation);
      }
      expect(errors).toEqual([]);
    });
  }

  test('an array of graphs across and down changes the number of panels, and Undo takes it back', async ({ page }) => {
    await open(page, [{ name: 'Array page', over: { arrangement: { kind: 'grid', cols: 2, rows: 1 } } }]);
    await openLayout(page, 'Array page');
    const count = async () => {
      const n = (await panelGraphs(page)).length;
      await tab(page, 'Panels');
      return n;
    };
    expect(await count()).toBe(2);
    await tab(page, 'Panels');
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

test.describe('the arrangement thumbnails of the Panels page', () => {
  test('choosing a thumbnail arranges the page, Array and Free placement are among them, and Undo takes a choice back', async ({ page }) => {
    await open(page, [{ name: 'Thumb page', over: { arrangement: { kind: 'grid', cols: 2, rows: 1 } } }]);
    await openLayout(page, 'Thumb page');
    await tab(page, 'Panels');
    const choice = (name: string | RegExp) => settings(page).getByRole('radio', { name });
    await expect(choice('Two across')).toHaveAttribute('aria-checked', 'true');
    await choice('2 × 2').click();
    await expect(choice('2 × 2')).toHaveAttribute('aria-checked', 'true');
    await expect(choice('Two across')).toHaveAttribute('aria-checked', 'false');
    expect(await panelGraphs(page)).toHaveLength(4);
    await tab(page, 'Panels');
    await choice('Array').click();
    await expect(choice(/^Array 3 × 2/)).toHaveAttribute('aria-checked', 'true');
    await expect(settings(page).getByLabel('Graphs across', { exact: true })).toHaveValue('3');
    await choice('Free placement').click();
    await expect(choice('Free placement')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('.layout-frame').first()).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(choice(/^Array 3 × 2/)).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('.layout-frame')).toHaveCount(0);
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
    await tab(page, 'Graphs');
    await settings(page).getByLabel('Panel B').selectOption({ label: '(empty)' });
    await expect(page.getByRole('img', { name: 'Empty page, 1 graphs' })).toBeVisible();
  });
});

test.describe('the page', () => {
  test('turning the page changes its size, and Undo turns it back', async ({ page }) => {
    await open(page, [{ name: 'Turn page', over: { orientation: 'landscape' } }]);
    await openLayout(page, 'Turn page');
    await expectOrientation(page, 'landscape');
    await tab(page, 'Page');
    await settings(page).getByRole('button', { name: 'Portrait' }).click();
    await expectOrientation(page, 'portrait');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expectOrientation(page, 'landscape');
  });

  test('a title, a panel-label style and the scaling are drawn on the page', async ({ page }) => {
    await open(page, [{ name: 'Look page', over: { arrangement: { kind: 'grid', cols: 2, rows: 1 } } }]);
    await openLayout(page, 'Look page');
    const plain = await pageMarkup(page);

    await tab(page, 'Page');
    await settings(page).getByLabel('Title on top of the page').check();
    await settings(page).getByLabel('Title', { exact: true }).fill('Figure 1');
    await expect(page.locator('.layout-page > svg')).toContainText('Figure 1');

    await settings(page).getByLabel('Style', { exact: true }).selectOption({ index: 1 });
    expect(await pageMarkup(page)).not.toBe(plain);

    const titled = await pageMarkup(page);
    await tab(page, 'Graphs');
    await settings(page).getByLabel('Scaling factor', { exact: true }).selectOption({ value: 'percent' });
    await settings(page).getByLabel('Percentage', { exact: true }).fill('50');
    await settings(page).getByLabel('Percentage', { exact: true }).press('Enter');
    expect(await pageMarkup(page)).not.toBe(titled);
  });

  test('a master legend takes a band of the page, and switching it off gives the room back', async ({ page }) => {
    await open(page, [{ name: 'Legend page', over: { arrangement: { kind: 'grid', cols: 2, rows: 1 } } }]);
    await openLayout(page, 'Legend page');
    const without = await pageMarkup(page);
    await tab(page, 'Legend');
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
    await tab(page, 'Panels');
    await settings(page).getByRole('radio', { name: 'Free placement' }).click();
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
    await tab(page, 'Panels');
    await settings(page).getByRole('radio', { name: 'Free placement' }).click();
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

test.describe('the zoom of the page', () => {
  test('the magnifier of the status bar is there as for a graph: the page opens whole, zooms, and goes back to fit', async ({ page }) => {
    await open(page, [{ name: 'Zoom page', over: { arrangement: { kind: 'grid', cols: 2, rows: 1 } } }]);
    await openLayout(page, 'Zoom page');
    const width = async () => (await page.locator('.layout-page').boundingBox())!.width;
    await expect(page.locator('.zoom-pct')).toHaveText('100%');
    const whole = await width();
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await expect(page.locator('.zoom-pct')).toHaveText('125%');
    await expect.poll(width).toBeGreaterThan(whole * 1.2);
    await page.getByRole('button', { name: 'Zoom out' }).click();
    await page.getByRole('button', { name: 'Zoom out' }).click();
    await expect(page.locator('.zoom-pct')).toHaveText('75%');
    await expect.poll(width).toBeLessThan(whole * 0.8);
    await page.getByRole('button', { name: /Fit the page to the window/ }).click();
    await expect(page.locator('.zoom-pct')).toHaveText('100%');
    await expect.poll(width).toBeCloseTo(whole, 0);
    // Turning the page goes back to fit.
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await tab(page, 'Page');
    await settings(page).getByRole('button', { name: 'Portrait' }).click();
    await expect(page.locator('.zoom-pct')).toHaveText('100%');
  });
});

test.describe('exporting a page', () => {
  /** Opens the Export page of the layout's inspector, chooses the format, exports, and gives the downloaded bytes and name. */
  async function exportAs(page: Page, format: 'SVG' | 'PNG' | 'PDF'): Promise<{ bytes: Buffer; name: string; dialogText: string }> {
    await tab(page, 'Export');
    const panel = page.locator('.export-panel');
    await expect(panel).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await panel.getByRole('button', { name: new RegExp(`^${format}`) }).click();
    const dialogText = (await panel.textContent()) ?? '';
    const download = page.waitForEvent('download');
    // The button names the file it writes.
    const button = panel.getByRole('button', { name: new RegExp(`^Export .+\\.${format.toLowerCase()}$`) });
    const label = ((await button.textContent()) ?? '').replace(/^Export /, '');
    await button.click();
    const file = await download;
    expect(file.suggestedFilename()).toBe(label);
    return { bytes: await readFile(await file.path()), name: file.suggestedFilename(), dialogText };
  }

  test('SVG is the page as vector markup', async ({ page }) => {
    await open(page, [{ name: 'Export page', over: { arrangement: { kind: 'grid', cols: 2, rows: 1 } } }]);
    await openLayout(page, 'Export page');
    const { bytes, name, dialogText } = await exportAs(page, 'SVG');
    expect(name).toMatch(/\.svg$/);
    const text = bytes.toString('utf8');
    expect(text).toMatch(/^<\?xml|^<svg/);
    expect(text).not.toMatch(/NaN|undefined/);
    // A vector page stays the paper it is: its name and its size in mm, and no pixels or points.
    expect(dialogText).toContain('A4 · 297 × 210 mm');
    expect(dialogText).not.toMatch(/\d px|\d pt/);
  });

  test('the size of a PNG follows the resolution, and a vector page says only A4 and its size in mm', async ({ page }) => {
    await open(page, [{ name: 'Dpi page', over: { arrangement: { kind: 'grid', cols: 2, rows: 1 } } }]);
    await openLayout(page, 'Dpi page');
    await tab(page, 'Export');
    const panel = page.locator('.export-panel');
    await panel.getByRole('button', { name: /^PNG/ }).click();
    const sizes = panel.locator('.report-sizes li');
    // A4 landscape (the page of this test) at each resolution, in whole pixels; the points and the millimetres (with the name of the paper) stay.
    for (const [dpi, px] of [['150', '1754 × 1240 px'], ['300', '3508 × 2480 px'], ['600', '7016 × 4961 px']] as const) {
      await panel.getByRole('button', { name: `${dpi} dpi`, exact: true }).click();
      await expect(sizes.first()).toHaveText(px);
      await expect(sizes.nth(1)).toHaveText('841.89 × 595.28 pt');
      await expect(sizes.nth(2)).toHaveText('A4 · 297 × 210 mm');
    }
    // No Picture line.
    await expect(panel.getByText(/^Picture: /)).toHaveCount(0);
    await panel.getByRole('button', { name: /^PDF/ }).click();
    await expect(sizes).toHaveCount(0);
    await expect(panel.getByText('A4 · 297 × 210 mm')).toBeVisible();
  });

  test('PNG has the size the dialog states, and PDF is one file that starts as a PDF', async ({ page }) => {
    await open(page, [{ name: 'Export page', over: { arrangement: { kind: 'grid', cols: 2, rows: 1 } } }]);
    await openLayout(page, 'Export page');
    const png = await exportAs(page, 'PNG');
    expect(png.name).toMatch(/\.png$/);
    // The first line of the size is the pixels of the picture at the resolution chosen.
    const [, w, h] = /(\d+) × (\d+) px/.exec(png.dialogText) ?? [];
    expect([...png.bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(png.bytes.readUInt32BE(16)).toBe(Number(w));
    expect(png.bytes.readUInt32BE(20)).toBe(Number(h));

    const pdf = await exportAs(page, 'PDF');
    expect(pdf.name).toMatch(/\.pdf$/);
    expect(pdf.bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});
