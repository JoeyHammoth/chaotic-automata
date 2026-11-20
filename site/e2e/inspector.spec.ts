import { expect, test } from '@playwright/test';

// The panel's acceptance criteria that can be checked headlessly: four panes, the two claim states,
// particle click-through with a URL, a keyboard path to the same selection, and no motion.

test('rule 18 draws four panes and a verified claim', async ({ page }) => {
  await page.goto('/inspector.html?rule=18');
  await expect(page.locator('body')).toHaveAttribute('data-state', 'ready');
  for (const selector of ['#pane-raw', '#pane-filtered', '#pane-complexity', '#pane-damage']) {
    await expect(page.locator(selector)).toBeVisible();
  }
  await expect(page.locator('#claim')).toContainText('verified by this code');
  await expect(page.locator('#filtered-caption')).toContainText('Domain residue');
  await expect(page.locator('#status')).toContainText('seed 11');
});

test('rule 30 is labelled with no decomposition and draws no particles', async ({ page }) => {
  await page.goto('/inspector.html?rule=30');
  await expect(page.locator('body')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#claim')).toContainText('No known domain decomposition');
  await expect(page.locator('#filtered-caption')).toContainText('nothing is invented');
  await expect(page.locator('#track-count')).toHaveText('0 particles');
  await expect(page.locator('#track-list button')).toHaveCount(0);
});

test('a particle reports velocity, period and partners, and the URL names it', async ({ page }) => {
  await page.goto('/inspector.html?rule=36');
  await page.locator('#track-list button').first().click();
  await expect(page.locator('#track-detail')).toContainText('velocity');
  await expect(page.locator('#track-detail')).toContainText('period');
  await expect(page.locator('#track-detail')).toContainText('collision partners');
  expect(new URL(page.url()).searchParams.get('track')).not.toBeNull();
});

test('the track list is keyboard navigable and selects on Enter', async ({ page }) => {
  await page.goto('/inspector.html?rule=36');
  await page.locator('#track-list button').first().focus();
  await page.keyboard.press('ArrowDown');
  const second = page.locator('#track-list button').nth(1);
  await expect(second).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(second).toHaveAttribute('aria-pressed', 'true');
});

test('the URL restores the rule and the selected particle', async ({ page }) => {
  await page.goto('/inspector.html?rule=36&track=0');
  await expect(page.locator('#inspector-rule')).toHaveValue('36');
  await expect(page.locator('#track-list button').first()).toHaveAttribute('aria-pressed', 'true');
});

test('an unsupported rule is refused in words, not silently swapped', async ({ page }) => {
  await page.goto('/inspector.html?rule=110');
  await expect(page.locator('#error')).toContainText('radius 1');
});

test('nothing animates, so reduced motion needs no special case', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/inspector.html?rule=18');
  await expect(page.locator('body')).toHaveAttribute('data-state', 'ready');
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
});
