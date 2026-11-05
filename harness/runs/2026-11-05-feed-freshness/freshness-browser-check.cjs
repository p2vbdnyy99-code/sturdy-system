// Browser check for the feed freshness run (local harness, port 8790).
// node freshness-browser-check.cjs <origin> <stale|fresh>
const { chromium } = require('playwright');
const [origin = 'http://localhost:8790', scenario = 'stale'] = process.argv.slice(2);
let pass = 0, fail = 0;
const check = (ok, what) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} [${scenario}] ${what}`); };

(async () => {
  const browser = await chromium.launch({ args: ['--no-proxy-server'] });
  for (const width of [390, 1366]) {
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width < 800, hasTouch: width < 800 });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error' && !/401/.test(m.text())) errors.push(m.text()); });
    await page.addInitScript(() => {
      window.__cls = 0; window.__csp = [];
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
      document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective));
    });

    // A state landing page (its data is in the page).
    await page.goto(`${origin}/government-tenders/state/maharashtra`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const intro = await page.locator('.tb-intro-count').innerText();
    const main = await page.locator('main').innerText();
    if (scenario === 'stale') {
      check(await page.locator('.tb-stale').isVisible(), `${width}px landing: stale notice visible`);
      check(/This list has not been updated since 23 October 2026\. Tenders published since then are missing/.test(await page.locator('.tb-stale').innerText()), `${width}px landing: notice gives the last successful update`);
      check(intro === '60 open tenders in our last update (23 October 2026)', `${width}px landing: count line (${intro})`);
      check(!/right now/.test(main), `${width}px landing: never says "right now"`);
      check(await page.locator('.tb-fresh').count() === 0, `${width}px landing: no "Updated" line`);
    } else {
      check(/^Updated \d+ \w+, \d+:\d\d [ap]m IST from CPPP\.$/i.test(await page.locator('.tb-fresh').innerText()), `${width}px landing: quiet "Updated" line (${await page.locator('.tb-fresh').innerText()})`);
      check(intro === '60 open tenders right now', `${width}px landing: count says right now (${intro})`);
      check(await page.locator('.tb-stale').count() === 0, `${width}px landing: no stale notice`);
    }
    check(await page.locator('.tb-list .tb-item').count() === 25, `${width}px landing: the list itself still shows 25 rows`);
    const cls = await page.evaluate(() => window.__cls);
    check(cls < 0.01, `${width}px landing: no layout shift (${cls.toFixed(4)})`);
    const sw = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    check(sw[0] <= sw[1], `${width}px landing: no horizontal scroll (${sw.join('/')})`);
    if (width === 390 || width === 1366) await page.screenshot({ path: `${__dirname}/landing-${scenario}-${width}.png` });

    // The main search, all lists.
    await page.goto(`${origin}/government-tenders`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.tb-list .tb-item');
    await page.waitForTimeout(800);
    if (scenario === 'stale') {
      check(/^Central government tenders, State tenders and GeM bids have not been updated since 23 October 2026/.test(await page.locator('.tb-stale').innerText()), `${width}px search: notice names the lists`);
      check(/open tenders in our last update \(23 October 2026\)/.test(await page.locator('.tb-intro-count').innerText()), `${width}px search: count line`);
    } else {
      check(await page.locator('.tb-fresh').isVisible() && await page.locator('.tb-stale').count() === 0, `${width}px search: quiet line, no notice`);
    }
    // Filters still work: switching to GeM fetches the GeM list.
    await page.locator('button[aria-pressed]', { hasText: 'GeM' }).first().click();
    await page.waitForResponse((r) => r.url().includes('kind=gem'));
    await page.waitForTimeout(500);
    check(await page.locator('.tb-list .tb-item').count() > 0, `${width}px search: GeM filter still lists tenders`);
    const csp = await page.evaluate(() => window.__csp);
    check(errors.length === 0 && csp.length === 0, `${width}px: no page errors or CSP violations ${JSON.stringify([errors, csp])}`);
    if (width === 390) await page.screenshot({ path: `${__dirname}/search-${scenario}-${width}.png` });
    await ctx.close();
  }

  // The founder's dashboard card (desktop).
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await ctx.request.post(`${origin}/bidpilot/register`, { data: { email: 'founder@example.test', password: 'harness-pass-123456' } });
  const page = await ctx.newPage();
  await page.goto(`${origin}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type=email]', 'founder@example.test');
  await page.fill('input[type=password]', 'harness-pass-123456');
  await page.locator('form button[type=submit]').click();
  await page.waitForURL(/\/dashboard/);
  await page.goto(`${origin}/insights`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.ins-feed');
  const card = await page.locator('.ins-feed').innerText();
  if (scenario === 'stale') {
    check(/Central government tenders\s+Unavailable[\s\S]*Last success: 23 Oct/.test(card), 'insights: status and last success');
    check(/Last failure: .* · CPPP answered 404/.test(card), 'insights: last failure and error, shown separately');
  } else {
    check((card.match(/Fresh/g) || []).length === 3, 'insights: all three fresh');
  }
  await page.locator('.ins-feed').screenshot({ path: `${__dirname}/insights-feed-${scenario}.png` });
  await ctx.close();
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
