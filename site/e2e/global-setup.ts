import { chromium } from '@playwright/test';

// Vite's dependency optimiser reloads a page the first time it discovers a module it has not
// pre-bundled. That reload lands mid-navigation for whichever test happens to be first, which is
// why one test per run used to fail with `net::ERR_ABORTED` and a different one each time. Warming
// the pages here moves that reload into setup, where it costs a second instead of a test.
const PAGES = ['/hashlife.html', '/verifier.html', '/inspector.html', '/stress.html'];

export default async function globalSetup(): Promise<void> {
  const base = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173';
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    for (const path of PAGES) {
      // A page that fails to load is a test failure, not a setup failure: let the tests say so.
      await page.goto(`${base}${path}`, { waitUntil: 'load', timeout: 30_000 }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    }
  } finally {
    await browser.close();
  }
}
