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
  await expect(chart).toHaveAttribute('aria-label', /to 154,330 at 10,000,000,000 steps/);
  await expect(chart).toHaveAttribute('aria-label', /\+105,503/);
  // Seven samples from the producer's own run, and one hollow point only the mirror reaches.
  await expect(chart.locator('circle')).toHaveCount(8);
  await expect(chart.locator('circle[fill="none"]')).toHaveCount(1);
  await expect(table).toContainText('The mirror carries the same walk to 10,000,000,000 steps');
  await expect(table).toContainText('agrees with the product through 1,000,000,000 steps');
  // The growth rate is drawn too: one bar per decade, and the mirror's last decade hollow.
  const growth = table.locator('svg.growth').first();
  await expect(growth).toHaveAttribute('aria-label', /span gained per decade/);
  await expect(growth).toHaveAttribute(
    'aria-label',
    /\+105,503 from 1,000,000,000 to 10,000,000,000/,
  );
  await expect(growth.locator('rect')).toHaveCount(7);
  await expect(growth.locator('rect[fill="none"]')).toHaveCount(1);
  await expect(table.locator('svg.growth')).toHaveCount(4);
  await expect(table).toContainText('span gained per decade');
  // A pointer can read each bar's decade too, in the same words as the label.
  await expect(growth.locator('rect title')).toHaveCount(7);
  await expect(growth.locator('rect title').last()).toHaveText(
    "+105,503 from 1,000,000,000 to 10,000,000,000 (the mirror's longer run)",
  );
  // The two charts sit side by side rather than stacking the cell taller.
  const trace = table.locator('svg.trace').first();
  const traceBox = await trace.boundingBox();
  const growthBox = await growth.boundingBox();
  expect(traceBox).not.toBeNull();
  expect(growthBox).not.toBeNull();
  expect(Math.abs((traceBox?.y ?? 0) - (growthBox?.y ?? 0))).toBeLessThan(5);
  expect(growthBox?.x ?? 0).toBeGreaterThan((traceBox?.x ?? 0) + 100);
  // The sentence starts below the charts rather than wrapping around them.
  const proseBox = await table.locator('p.cryptid-run').first().boundingBox();
  expect(proseBox?.y ?? 0).toBeGreaterThan((traceBox?.y ?? 0) + 40);
  // A pointer can read each point's step and span too.
  await expect(trace.locator('circle title')).toHaveCount(8);
  await expect(trace.locator('circle title').first()).toHaveText(
    "54 cells at 1,000 steps (the product's own samples)",
  );
  await expect(trace.locator('circle title').last()).toHaveText(
    "154,330 cells at 10,000,000,000 steps (the mirror's longer run)",
  );
  await expect(page.locator('#cryptid-note')).toContainText('not evidence');
});

test('the tables stack into cards on a phone, without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/verifier.html');
  await expect(page.locator('#cryptid-table tr').first()).toBeVisible({ timeout: 15_000 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  // The header row is folded into each card: the column name sits above every value.
  // `#cryptid-table` is the tbody, so the table element is found by the body it holds.
  const cryptidTable = page
    .locator('table.data')
    .filter({ has: page.locator('#cryptid-table') });
  await expect(cryptidTable.locator('thead')).toBeHidden();
  await expect(page.locator('#cryptid-table td[data-label="this pipeline"]').first()).toBeVisible();
  await expect(page.locator('#bb-table td[data-label="undecided"]').first()).toBeVisible();
  // Stacking must not cost the semantics: the roles keep it a table to assistive technology.
  await expect(cryptidTable).toHaveAttribute('role', 'table');
  await expect(page.locator('#cryptid-table tr').first()).toHaveAttribute('role', 'row');
  await expect(page.locator('#cryptid-table td').first()).toHaveAttribute('role', 'cell');
  await expect(page.locator('#cryptid-table th').first()).toHaveAttribute('role', 'rowheader');
  // The charts still fit side by side inside the card.
  await expect(page.locator('#cryptid-table svg.trace').first()).toBeVisible();
  await expect(page.locator('#cryptid-table svg.growth').first()).toBeVisible();
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
