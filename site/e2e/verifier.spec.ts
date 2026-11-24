import { expect, test } from '@playwright/test';

test('the undecided residue is shown, not hidden', async ({ page }) => {
  await page.goto('/verifier.html');
  const residue = page.locator('#residue');
  await expect(residue).toContainText('undecided', { timeout: 15_000 });
  await expect(residue).not.toContainText('loading');
  await expect(page.locator('#residue-note')).toContainText('not a non-halting machine');
});

test('the busy beaver table reproduces the values it quotes', async ({ page }) => {
  await page.goto('/verifier.html');
  const rows = page.locator('#bb-table tr');
  await expect(rows).toHaveCount(3, { timeout: 15_000 });
  // Two and three states reproduce; the row's reproduced column equals its quoted column.
  const first = rows.first();
  await expect(first.locator('th')).toHaveText('2');
  await expect(first.locator('td').nth(0)).toHaveText('6');
  await expect(first.locator('td').nth(1)).toHaveText('6');
  await expect(page.locator('#champion')).toContainText('47,176,870');
  await expect(page.locator('#champion')).toContainText('quoted, not re-proved');
});

test('a certified class and a heuristic class are distinguishable by words, not colour', async ({
  page,
}) => {
  await page.goto('/verifier.html');
  const body = page.locator('#labelled-table');
  await expect(body).toContainText('certified non-halting', { timeout: 15_000 });
  await expect(body).toContainText('heuristic');
  await expect(page.locator('#symbol-legend')).toContainText('▲');
});

test('a certificate is shown with its mutations refused', async ({ page }) => {
  await page.goto('/verifier.html');
  await expect(page.locator('#certificate-json')).toContainText('"kind"', { timeout: 15_000 });
  const mutations = page.locator('#mutation-table tr');
  await expect(mutations.first()).toBeVisible();
  const text = await page.locator('#mutation-table').textContent();
  expect(text).toContain('refused');
  expect(text).not.toContain('accepted');
});
