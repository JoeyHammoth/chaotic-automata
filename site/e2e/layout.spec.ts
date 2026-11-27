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
      const measured = await page.evaluate(() => {
        const { scrollWidth, clientWidth } = document.documentElement;
        const name = (element: Element) => {
          const id = element.id ? `#${element.id}` : '';
          const classes =
            typeof (element as HTMLElement).className === 'string' &&
            (element as HTMLElement).className
              ? `.${(element as HTMLElement).className.trim().split(/\s+/).join('.')}`
              : '';
          return `${element.tagName.toLowerCase()}${id}${classes}`;
        };
        const offenders = Array.from(document.querySelectorAll('body *'))
          .filter((element) => element.getBoundingClientRect().right > clientWidth + 1)
          .sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right)
          .slice(0, 5)
          .map((element) => `${name(element)} right@${Math.round(element.getBoundingClientRect().right)}`);
        // Text can paint past its box, so the box list alone can come back empty; walk the text too.
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const textOffenders: string[] = [];
        for (let node = walker.nextNode(); node && textOffenders.length < 5; ) {
          const range = document.createRange();
          range.selectNodeContents(node);
          const past = Array.from(range.getClientRects()).find((rect) => rect.right > clientWidth + 1);
          if (past && node.parentElement) {
            textOffenders.push(
              `${name(node.parentElement)} text "${(node.textContent ?? '').trim().slice(0, 40)}"`,
            );
          }
          node = walker.nextNode();
        }
        return { overflow: scrollWidth - clientWidth, offenders, textOffenders };
      });
      // The message names what is too wide, so a font-metric difference is diagnosable from CI logs.
      expect(
        measured.overflow,
        `at ${viewport.width}px: ${measured.offenders.join(', ') || 'no box past the edge'}` +
          `; text: ${measured.textOffenders.join(', ') || 'none'}`,
      ).toBeLessThanOrEqual(1);
    }
  });
}
