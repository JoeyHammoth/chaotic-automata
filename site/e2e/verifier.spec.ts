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

test('a cryptid is shown with its string and without a verdict', async ({ page }) => {
  await page.goto('/verifier.html');
  const table = page.locator('#cryptid-table');
  await expect(table).toContainText('Antihydra', { timeout: 15_000 });
  await expect(table).toContainText('1RB1RA_0LC1LE_1LD1LC_1LA0LB_1LF1RE_---0RA');
  await expect(table).toContainText('probviously non-halting');
  await expect(table).toContainText('nothing about halting');
  // The long run is shown as growth, not as a verdict.
  await expect(table).toContainText('no halt in 1,000,000,000 steps');
  await expect(table).toContainText('span');
  // The growth is also drawn, and the drawing says its numbers out loud — including the decade the
  // span grows fastest in, which is what makes the picture more than "it went up".
  const chart = table.locator('svg.trace').first();
  await expect(chart).toHaveAttribute('aria-label', /to 48,827 at 1,000,000,000 steps/);
  await expect(chart).toHaveAttribute('aria-label', /\+33,373/);
  await expect(chart.locator('circle')).toHaveCount(7);
  await expect(page.locator('#cryptid-note')).toContainText('not evidence');
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
