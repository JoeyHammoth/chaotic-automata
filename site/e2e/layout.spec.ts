import { expect, test } from '@playwright/test';

// Every page at a phone width: nothing may make the document wider than the viewport. This is the
// check that would have caught the cryptid table before #90, and the source URL beside it, without
// anyone remembering to look.

const pages = ['/', '/inspector.html', '/stress.html', '/verifier.html', '/hashlife.html'];

for (const path of pages) {
  test(`${path} fits a phone without sideways scrolling`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path);
    await page.waitForLoadState('load');
    // Let a page that renders from a product finish; the overflow is measured after it settles.
    await page.waitForTimeout(1500);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
}
