import { expect, test } from '@playwright/test';

// Every page at phone and small-tablet widths: nothing may make the document wider than the
// viewport. This is the check that would have caught the cryptid table before #90, and the source
// URL beside it, without anyone remembering to look. 820 is where the stress page's phase grid
// becomes one column, so it is the narrowest width that still uses the wide layout.

const pages = ['/', '/inspector.html', '/stress.html', '/verifier.html', '/hashlife.html'];

const widths = [
  { width: 320, height: 720 },
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
];

for (const path of pages) {
  test(`${path} fits a phone or a small tablet without sideways scrolling`, async ({ page }) => {
    for (const viewport of widths) {
      await page.setViewportSize(viewport);
      await page.goto(path);
      await page.waitForLoadState('load');
      // Let a page that renders from a product finish; the overflow is measured after it settles.
      await page.waitForTimeout(1500);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `at ${viewport.width}px`).toBeLessThanOrEqual(1);
    }
  });
}
