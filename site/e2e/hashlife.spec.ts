import { expect, test } from '@playwright/test';

test('the plane loads, steps, and reports the tree', async ({ page }) => {
  await page.goto('/hashlife.html');
  const readout = page.locator('#readout');
  await expect(readout).toContainText('generation 0', { timeout: 20_000 });
  await expect(page.locator('#tree-table')).toContainText('nodes');
  await expect(page.locator('#memory-gauge')).toHaveAttribute('aria-valuenow', /\d+/);

  await page.getByRole('button', { name: 'Advance' }).click();
  await expect(readout).not.toContainText('generation 0');
  await expect(page.locator('#status')).toContainText('Loaded');
});

test('zooming out renders nodes as density rather than cells', async ({ page }) => {
  await page.goto('/hashlife.html');
  await expect(page.locator('#plane-caption')).toContainText('One pixel per cell', {
    timeout: 20_000,
  });
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Zoom out' }).click();
  await expect(page.locator('#plane-caption')).toContainText('population density');
});

test('the step size is visible and adjustable', async ({ page }) => {
  await page.goto('/hashlife.html');
  const select = page.locator('#step-size');
  await expect(select).toHaveValue('1', { timeout: 20_000 });
  await select.selectOption('1024');
  await expect(page.locator('#step-note')).toContainText('2^10 = 1024 generations');
});

test('RLE and macrocell import both report what they read', async ({ page }) => {
  await page.goto('/hashlife.html');
  const paste = page.locator('#paste');
  await expect(paste).toBeVisible({ timeout: 20_000 });

  await paste.fill('x = 2, y = 2\n2o$2o!');
  await page.getByRole('button', { name: 'Import' }).click();
  await expect(page.locator('#import-note')).toContainText('from rle');

  await paste.fill('[M2] (golly 2.0)\n#R B3/S23\n$$..*$...*$.***$$$$');
  await page.getByRole('button', { name: 'Import' }).click();
  await expect(page.locator('#import-note')).toContainText('from macrocell');
});

test('the URL carries the pattern and the generation', async ({ page }) => {
  await page.goto('/hashlife.html?pattern=gun&gen=16');
  await expect(page.locator('#readout')).toContainText('generation 16', { timeout: 20_000 });
  await page.getByRole('button', { name: 'Advance' }).click();
  await expect(page).toHaveURL(/gen=17/);
});
