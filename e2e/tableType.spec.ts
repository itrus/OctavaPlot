import { expect, test } from '@playwright/test';
import { openApp, openTable } from './helpers';

const typeButton = (page: import('@playwright/test').Page, name: RegExp) => page.locator('.toolbar').getByRole('button', { name });

test('the type of an existing table is changed from its toolbar, with a notice of what follows, and Undo restores it', async ({ page }) => {
  await openApp(page);
  await openTable(page);
  await typeButton(page, /^Column table/).click();
  const dialog = page.getByRole('dialog', { name: /^Change the type of / });
  await expect(dialog.getByRole('button', { name: 'Change', exact: true })).toBeDisabled();
  await dialog.getByRole('radio', { name: /^XY table/ }).check();
  await expect(dialog).toContainText('will change to graphs of the XY table');
  await dialog.getByRole('button', { name: 'Change', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(typeButton(page, /^XY table/)).toBeVisible();
  await page.keyboard.press('Control+z');
  await expect(typeButton(page, /^Column table/)).toBeVisible();
});

test('the subtype of an XY table (how its series are entered) is changed from the same dialog', async ({ page }) => {
  await openApp(page);
  await openTable(page);
  await typeButton(page, /^Column table/).click();
  const dialog = page.getByRole('dialog', { name: /^Change the type of / });
  await dialog.getByRole('radio', { name: /^XY table/ }).check();
  await dialog.getByRole('button', { name: 'Change', exact: true }).click();
  // Now an XY table of single values: choose replicates in subcolumns for the same type.
  await typeButton(page, /^XY table/).click();
  const again = page.getByRole('dialog', { name: /^Change the type of / });
  await expect(again.getByRole('button', { name: 'Change', exact: true })).toBeDisabled();
  await again.getByRole('radio', { name: /replicate values in side-by-side subcolumns/ }).check();
  await expect(again.getByRole('button', { name: 'Change', exact: true })).toBeEnabled();
  await again.getByRole('button', { name: 'Change', exact: true }).click();
  await expect(page.getByText('Y3').first()).toBeVisible();
});
