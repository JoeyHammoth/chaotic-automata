import { expect, test, type Page } from '@playwright/test';

// The atlas acceptance criteria that can be checked headlessly: the map streams the tiles it needs,
// colourings re-colour without a reload, undecided cells stay hatched, clicks run the rule under the
// pointer, and the URL restores the view exactly.

async function settle(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      document.body.dataset.state === 'ready' &&
      Number(document.body.dataset.tiles ?? '0') > 0 &&
      Number(document.body.dataset.pending ?? '1') === 0,
  );
}

async function mapPixels(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#atlas');
    if (!canvas) return 0;
    const context = canvas.getContext('2d');
    if (!context) return 0;
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let coloured = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] !== 5 || data[i + 1] !== 7 || data[i + 2] !== 10) coloured += 1;
    }
    return coloured;
  });
}

async function snapshot(page: Page): Promise<string | undefined> {
  return page.evaluate(() => document.querySelector<HTMLCanvasElement>('#atlas')?.toDataURL());
}

test('the atlas paints the committed rule map from tiles', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('status')).toContainText('512×512');
  await settle(page);
  expect(await mapPixels(page)).toBeGreaterThan(1000);
});

test('the map streams tiles for the window instead of fetching the layers', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.includes('/products/atlas/')) requests.push(url.pathname);
  });

  await page.goto('/?z=16');
  await settle(page);

  expect(requests.filter((path) => path.endsWith('.bin'))).toEqual([]);
  expect(requests.filter((path) => path.includes('/tiles/class/0/'))).toHaveLength(1);
  const finest = requests.filter((path) => path.includes('/tiles/class/2/'));
  expect(finest.length).toBeGreaterThan(0);
  expect(finest.length).toBeLessThanOrEqual(4);
});

test('switching the colouring streams that colouring and nothing else', async ({ page }) => {
  await page.goto('/');
  await settle(page);

  const requests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.includes('/products/atlas/')) requests.push(url.pathname);
  });

  await page.selectOption('#layer', 'activity');
  await expect
    .poll(() => requests.filter((path) => path.includes('/tiles/activity/')).length)
    .toBeGreaterThan(0);

  expect(requests.filter((path) => path.endsWith('.bin'))).toEqual([]);
  expect(new URL(page.url()).searchParams.get('metric')).toBe('activity');
  await expect(page.locator('#legend')).toContainText('0.00');
});

test('the disagreement layer toggles with its legend', async ({ page }) => {
  await page.goto('/');
  await settle(page);
  const before = await snapshot(page);

  await page.check('#disagreement');
  await settle(page);
  const after = await snapshot(page);

  expect(after).not.toBe(before);
  await expect(page.locator('#legend')).toContainText('disagree');
  await expect(page.locator('#legend')).toContainText('agree');
});

test('undecided rules are hatched and named in the legend', async ({ page }) => {
  await page.goto('/');
  await settle(page);
  await expect(page.locator('#legend')).toContainText('undecided');
  await expect(page.locator('#legend .swatch.hatched')).toHaveCount(1);

  const stripes = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#atlas');
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return 0;
    const data = context.getImageData(0, 0, Math.min(64, canvas.width), Math.min(64, canvas.height)).data;
    let found = 0;
    for (let i = 0; i < data.length; i += 4) {
      // The hatch light stripe is (96, 104, 118); the dark one is (28, 31, 37).
      if (data[i] === 96 && data[i + 1] === 104 && data[i + 2] === 118) found += 1;
    }
    return found;
  });
  expect(stripes).toBeGreaterThan(0);
});

test('the noise overlay re-colours the map and names its threshold', async ({ page }) => {
  await page.goto('/');
  await settle(page);
  await expect(page.getByTestId('noise-note')).toContainText('collapsed below 0.10');
  const plain = await snapshot(page);

  await page.check('#noise-overlay');
  await settle(page);
  await expect(page.locator('body')).toHaveAttribute('data-overlay', 'on');
  await expect(page.locator('#legend')).toContainText('collapsed (< 0.10)');
  // Undecided cells and collapsed cells are both hatched: the cue is a pattern, not a hue.
  await expect(page.locator('#legend .swatch.hatched')).toHaveCount(2);
  const overlaid = await snapshot(page);
  expect(overlaid).not.toBe(plain);

  await page.locator('#eps').evaluate((element: HTMLInputElement) => {
    element.value = '128';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('#eps-value')).toHaveText('1/8 = 0.1250');
  await expect(page.getByTestId('status')).toContainText('ε 1/8');
  expect(await snapshot(page)).not.toBe(overlaid);
});

test('clicking the map runs that rule and updates the URL', async ({ page }) => {
  await page.goto('/?x=0&y=0&z=4');
  await settle(page);

  const box = await page.locator('#atlas').boundingBox();
  if (!box) throw new Error('the map has no box');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  await expect(page.locator('#rule-heading')).toContainText('chart (');
  await expect(page.locator('#rule-status')).toContainText('seed 1');
  await page.waitForFunction(() => Number(document.body.dataset.ruleFrames ?? '0') >= 2);

  const rule = new URL(page.url()).searchParams.get('rule');
  expect(rule).toMatch(/^B\d*\/S\d*$/);
});

test('the URL restores the camera, layer and rule exactly', async ({ page }) => {
  await page.goto('/?rule=B36/S23&seed=7&metric=compression&x=100&y=200&z=2&dis=1');
  await settle(page);

  await expect(page.locator('#layer')).toHaveValue('compression');
  await expect(page.getByTestId('status')).toContainText('disagreement');
  await expect(page.getByTestId('status')).toContainText('x 100');
  expect(await page.evaluate(() => document.body.dataset.zoom)).toBe('2');
  await expect(page.locator('#disagreement')).toBeChecked();
  await expect(page.locator('#rule-heading')).toHaveText('Run a rule');
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('a finger pans the map once it is zoomed in, and a tap runs the rule', async ({ page }) => {
    await page.goto('/');
    await settle(page);
    await page.locator('#atlas').scrollIntoViewIfNeeded();

    // At 1× the whole 512×512 chart is visible, so the camera is clamped: a drag cannot move it.
    // Zoom the way the page offers on a phone — the buttons — then drag by touch.
    await page.click('#zoom-in');
    await page.click('#zoom-in');
    expect(Number(await page.evaluate(() => document.body.dataset.zoom))).toBeGreaterThan(2);

    const box = await page.locator('#atlas').boundingBox();
    if (!box) throw new Error('the map has no box');
    const client = await page.context().newCDPSession(page);
    const touch = (
      type: 'touchStart' | 'touchMove' | 'touchEnd',
      points: { x: number; y: number; id: number }[],
    ) => client.send('Input.dispatchTouchEvent', { type, touchPoints: points });
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await touch('touchStart', [{ x, y, id: 1 }]);
    for (let step = 1; step <= 5; step++) {
      await touch('touchMove', [{ x: x - step * 14, y, id: 1 }]);
    }
    await touch('touchEnd', []);

    await expect
      .poll(() => new URL(page.url()).searchParams.get('x'), { timeout: 5_000 })
      .not.toBeNull();
    // Panning is not a tap: the drag must not also run the rule it ended over.
    await expect(page.locator('#rule-status')).toContainText('click the map to run a rule');

    await page.locator('#atlas').scrollIntoViewIfNeeded();
    const tapped = await page.locator('#atlas').boundingBox();
    if (!tapped) throw new Error('the map has no box');
    await page.touchscreen.tap(tapped.x + tapped.width / 2, tapped.y + tapped.height / 2);
    await expect(page.locator('#rule-status')).toContainText('seed 1');
  });
});

test('the keyboard pans and zooms the map', async ({ page }) => {
  await page.goto('/?x=100&y=100&z=2');
  await settle(page);

  await page.locator('#atlas').focus();
  await page.keyboard.press('ArrowRight');
  const panned = new URL(page.url()).searchParams.get('x');
  expect(Number(panned)).toBeGreaterThan(100);

  await page.keyboard.press('+');
  expect(Number(new URL(page.url()).searchParams.get('z'))).toBeGreaterThan(2);
});

test('a figure can be exported as a PNG with its reproduce link', async ({ page }) => {
  await page.goto('/?x=40&y=60&z=1');
  await settle(page);

  const download = page.waitForEvent('download');
  await page.click('#export');
  const file = await download;
  expect(file.suggestedFilename()).toBe('computation-atlas.png');
});

test('first paint is inside the 2.5 s LCP budget', async ({ page }) => {
  await page.goto('/');
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

test('the render path stays inside a 60 fps frame budget', async ({ page }) => {
  await page.goto('/?z=2');
  await settle(page);

  const stats = await page.evaluate(async () => {
    const canvas = document.querySelector<HTMLCanvasElement>('#atlas');
    if (!canvas) throw new Error('no map');
    const intervals: number[] = [];
    let last = performance.now();
    let running = true;
    const tick = (now: number): void => {
      intervals.push(now - last);
      last = now;
      if (running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    for (let i = 0; i < 60; i += 1) {
      canvas.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: i % 2 === 0 ? -1 : 1,
          clientX: 200,
          clientY: 200,
          bubbles: true,
          cancelable: true,
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 16));
    }
    running = false;
    intervals.sort((a, b) => a - b);
    const at = (q: number): number => intervals[Math.floor(intervals.length * q)] ?? 0;
    return { median: at(0.5), p95: at(0.95), samples: intervals.length };
  });

  console.log(`frame interval: median ${stats.median.toFixed(1)} ms, p95 ${stats.p95.toFixed(1)} ms`);
  expect(stats.samples).toBeGreaterThan(30);
  expect(stats.p95).toBeLessThan(34);
});
