import { expect, test } from '@playwright/test';

// The Stress Lab's acceptance criteria that can be checked headlessly: both panels render, the
// noise slider moves the figure and the URL, a capped run is printed as a bound, the phase diagram
// reports a clicked point, and the literature claims are labelled as quoted.

test('both panels render and the status names the seeds', async ({ page }) => {
  await page.goto('/stress.html');
  await expect(page.locator('body')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#toom-chart')).toBeVisible();
  await expect(page.locator('#dk-chart')).toBeVisible();
  await expect(page.locator('#status')).toContainText('seed');
  await expect(page.locator('#dk-table tr')).toHaveCount(2);
});

test('the noise slider moves the table, the caption and the URL', async ({ page }) => {
  await page.goto('/stress.html');
  await expect(page.locator('body')).toHaveAttribute('data-state', 'ready');
  await page.locator('#noise').evaluate((element: HTMLInputElement) => {
    element.value = '5';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('#noise-value')).toHaveText('1/4 = 0.25');
  await expect(page.locator('#toom-table')).toContainText('12');
  expect(new URL(page.url()).searchParams.get('noise')).toBe('0.25');
});

test('a noise in the URL is restored', async ({ page }) => {
  await page.goto('/stress.html?noise=0.09375');
  await expect(page.locator('body')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#noise-value')).toHaveText('3/32 = 0.09375');
});

test('a capped run is shown as at least the cap, not as a lifetime', async ({ page }) => {
  await page.goto('/stress.html?noise=0.0625');
  await expect(page.locator('body')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#toom-table')).toContainText('≥ 5,000');
});

test('the phase diagram reports the point that was clicked', async ({ page }) => {
  await page.goto('/stress.html');
  await expect(page.locator('body')).toHaveAttribute('data-state', 'ready');
  await page.locator('#dk-chart').click({ position: { x: 380, y: 260 } });
  await expect(page.locator('#dk-readout')).toContainText('p1 =');
  await expect(page.locator('#dk-readout')).toContainText('seeds');
});

test('the decay verdict names the quoted exponent and its tolerance', async ({ page }) => {
  await page.goto('/stress.html');
  await expect(page.locator('#dk-verdict')).toContainText('0.159464');
  await expect(page.locator('#dk-verdict')).toContainText('tolerance');
  await expect(page.locator('#dk-verdict')).toContainText('32 seeds per lattice');
});

test("Toom's threshold is labelled as quoted, not re-proved", async ({ page }) => {
  await page.goto('/stress.html');
  await expect(page.locator('#toom-claim')).toContainText('not re-proved');
  await expect(page.locator('#toom-claim')).toContainText('Toom');
});

test('the tower is labelled an analogue and reports failure per level', async ({ page }) => {
  await page.goto('/stress.html');
  await expect(page.locator('body')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#tower-table tr')).toHaveCount(5);
  // Level 1 holds 81 blocks of the 243 leaves, and the root one: the tower's shape is in the table.
  await expect(page.locator('#tower-table tr').first()).toContainText('81');
  await expect(page.locator('#tower-table tr').last()).toContainText('1');
  await expect(page.locator('#tower-claim')).toContainText('pedagogical analogue');
  await expect(page.locator('#tower-claim')).toContainText('no threshold is claimed');
  await expect(page.locator('#tower-claim')).toContainText('not Gacs');
});

test('the tower slider moves the per-level failure rates', async ({ page }) => {
  await page.goto('/stress.html');
  await expect(page.locator('body')).toHaveAttribute('data-state', 'ready');
  const before = await page.locator('#tower-table').textContent();

  await page.locator('#tower-rate').evaluate((element: HTMLInputElement) => {
    element.value = '4';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('#tower-rate-value')).toHaveText('0.4000');
  await expect(page.locator('#tower-table')).toContainText('0.3538');
  expect(await page.locator('#tower-table').textContent()).not.toBe(before);
});

test('nothing animates, so reduced motion needs no special case', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/stress.html');
  await expect(page.locator('body')).toHaveAttribute('data-state', 'ready');
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
});
