import { expect, test } from '@playwright/test';

// The slice's acceptance criterion: a CI smoke test drives the page headlessly and fails if the
// canvas stays blank.

test('B3/S23 runs from the URL and paints the canvas', async ({ page }) => {
  await page.goto('/?rule=B3/S23&seed=1');

  await expect(page.getByTestId('status')).toContainText('B3/S23');
  await expect(page.getByTestId('status')).toContainText('seed 1');

  // Wait for at least three painted frames, then check the canvas has live pixels.
  await page.waitForFunction(() => Number(document.body.dataset.frames ?? '0') >= 3);

  const painted = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return { width: 0, nonBlank: 0 };
    const context = canvas.getContext('2d');
    if (!context) return { width: canvas.width, nonBlank: 0 };
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let nonBlank = 0;
    for (let i = 0; i < data.length; i += 4) {
      // DEAD is (8, 11, 15); anything else means a cell was drawn.
      if (data[i] !== 8 || data[i + 1] !== 11 || data[i + 2] !== 15) nonBlank += 1;
    }
    return { width: canvas.width, nonBlank };
  });

  expect(painted.width).toBe(256);
  expect(painted.nonBlank).toBeGreaterThan(100);

  const tier = await page.evaluate(() => document.body.dataset.tier);
  console.log(`engine tier: ${tier}`);
  expect(['wasm', 'cpu']).toContain(tier);
});

test('the URL is canonicalised on load', async ({ page }) => {
  await page.goto('/?rule=b3/s23&seed=4');
  await expect(page.getByTestId('status')).toContainText('B3/S23');
  expect(new URL(page.url()).searchParams.get('rule')).toBe('B3/S23');
});

test('a malformed rule is rejected visibly, not silently', async ({ page }) => {
  await page.goto('/?rule=B9/S23');
  const error = page.locator('#error');
  await expect(error).toBeVisible();
  await expect(error).toContainText('out of range');
  await expect(page.getByTestId('status')).toHaveText('not running');
});

test('first paint is inside the 2.5 s LCP budget', async ({ page }) => {
  // Measured on the dev server; the production budget check belongs to M1 (design doc §8.2).
  await page.goto('/?rule=B3/S23&seed=1');
  const lcp = await page.evaluate(async () => {
    return await new Promise<number>((resolve) => {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        if (last) resolve(last.startTime);
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      setTimeout(() => resolve(performance.now()), 3000);
    });
  });
  console.log(`LCP: ${lcp.toFixed(0)} ms (budget 2500 ms)`);
  expect(lcp).toBeLessThan(2500);
});

test('reloading the same URL reproduces the same first frame', async ({ page }) => {
  const snapshot = async (): Promise<string> =>
    page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return '';
      return canvas.toDataURL();
    });

  // `steps` pins the generation, so the comparison is not a race against the animation loop.
  await page.goto('/?rule=B3/S23&seed=11&steps=5');
  await page.waitForFunction(() => document.body.dataset.state === 'paused');
  expect(await page.evaluate(() => document.body.dataset.generation)).toBe('5');
  const first = await snapshot();

  await page.reload();
  await page.waitForFunction(() => document.body.dataset.state === 'paused');
  const second = await snapshot();

  expect(second).toBe(first);
});
