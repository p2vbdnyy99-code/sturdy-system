// Runs the in-game performance test headlessly and prints the report.
// Note: headless Chromium renders on the CPU (SwiftShader), so FPS here is NOT representative
// of any real GPU; the build/rebuild columns (JavaScript cost) are the useful part.
// Usage: node scripts/bench.mjs [url]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const url = process.argv[2] ?? 'http://localhost:4173/';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1112, height: 834 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url);
await page.waitForFunction(() => window.__game);
await page.evaluate(() => window.__game.updateSettings({ quality: 'medium' }));
await page.evaluate(() => window.__game.runBenchmark());
console.log(await page.evaluate(() => window.__game.getState().bench.report));
if (errors.length) console.log('ERRORS:', errors.join(' | '));
await browser.close();
