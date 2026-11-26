import { expect, test } from '@playwright/test';

test('state consumers subscribe independently and commands still participate in undo', async ({ page }) => {
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const modulePath = '/e2e/support/contextProbe.tsx';
    const { probeContextSubscriptions } = await import(modulePath);
    return probeContextSubscriptions();
  });
  expect(result.zoom).toEqual({ ...result.initial, graph: result.initial.graph + 1 });
  expect(result.selected.project).toBe(result.initial.project);
  expect(result.selected.commands).toBe(result.initial.commands);
  expect(result.selected.selection).toBe(result.initial.selection + 1);
  expect(result.settings.preferences).toBe(result.initial.preferences + 1);
  expect(result.status.commands).toBe(result.initial.commands);
  expect(result.status.project).toBe(result.initial.project);
  expect(result.status.table).toBe(result.initial.table);
  expect(result.status.layout).toBe(result.initial.layout);
  expect(result.editedName).toBe('Context probe');
  expect(result.canUndo).toBe(true);
  expect(result.undoneName).toBe(result.beforeName);
  expect(result.canRedo).toBe(true);
});
