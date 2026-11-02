// Browser checks for the sample page fix. Old build on 8791, new on 8790.
// node sample-browser-check.cjs <fallbackHtmlPath>
const { chromium } = require('playwright');
const fs = require('fs');
const S = __dirname;
const NEW = 'http://localhost:8790', OLD = 'http://localhost:8791';
const fallbackHtml = fs.readFileSync(process.argv[2], 'utf8');
let pass = 0, fail = 0;
const check = (ok, what) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`); };

async function open(browser, url, width, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 800 ? 844 : 900 }, isMobile: width < 800, hasTouch: width < 800 });
  const page = await ctx.newPage();
  const errors = [], csp = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/401/.test(m.text())) errors.push(m.text()); });
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  if (opts.route) await opts.route(page);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  csp.push(...(await page.evaluate(() => window.__csp)));
  return { ctx, page, errors, csp };
}
const mainText = (page) => page.evaluate(() => document.querySelector('#root').innerText.replace(/\s+/g, ' ').trim());

(async () => {
  const browser = await chromium.launch({ args: ['--no-proxy-server'] });

  // 1. What a visitor sees once loaded is the same text, old vs new.
  for (const w of [360, 390, 768, 1366]) {
    const o = await open(browser, `${OLD}/sample-analysis`, w);
    await o.page.waitForSelector('.sample-boq');
    const n = await open(browser, `${NEW}/sample-analysis`, w);
    const [ot, nt] = [await mainText(o.page), await mainText(n.page)];
    check(ot === nt && nt.length > 5000, `${w}px: loaded page text identical old vs new (${nt.length} chars)`);
    const sw = await n.page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    check(sw[0] <= sw[1], `${w}px: no horizontal page scroll (${sw.join('/')})`);
    check(n.errors.length === 0, `${w}px: no page errors ${JSON.stringify(n.errors)}`);
    check(n.csp.length === 0, `${w}px: no CSP violations ${JSON.stringify(n.csp)}`);
    await n.page.screenshot({ path: `${S}/cls-after-${w}.png`, fullPage: false });
    await o.ctx.close();
    if (w !== 390) await n.ctx.close();
    else {
      // 2. Interactions on the server-rendered page: Cite popover, checklist groups, links.
      const p = n.page;
      const cite = p.locator('.sample-key-facts .evidence-toggle').first();
      await cite.click();
      check(await p.locator('.evidence-popover').first().isVisible(), '390px: page-number button opens the quote');
      const href = await p.locator('.evidence-popover .sample-pdf-link').first().getAttribute('href');
      check(/NIT11\.pdf#page=\d+$/.test(href || ''), `390px: popover links the PDF page (${href})`);
      const groups = p.locator('details.sample-group');
      check(await groups.first().evaluate((d) => d.open) && !(await groups.nth(1).evaluate((d) => d.open)), '390px: first checklist group open, others closed');
      await groups.nth(1).locator('summary').click();
      check(await groups.nth(1).evaluate((d) => d.open), '390px: a closed group opens');
      check(await p.locator('script#sample-analysis-data').count() === 1, '390px: data block outside #root kept after the app started');
      await p.locator('a[href="/register"]').last().click();
      await p.waitForURL('**/register');
      check(true, '390px: CTA navigates to /register');
      await n.ctx.close();
    }
  }

  // 3. Opened from another page of the app (no data block): still fetched and shown.
  {
    const { ctx, page, errors } = await open(browser, `${NEW}/`, 390);
    let fetched = 0;
    page.on('request', (r) => { if (r.url().includes('/bidpilot/public/sample-analysis')) fetched++; });
    await page.evaluate(() => { window.history.pushState({}, '', '/sample-analysis'); window.dispatchEvent(new PopStateEvent('popstate')); });
    await page.waitForSelector('.sample-boq', { timeout: 10000 });
    check(fetched === 1 && errors.length === 0, `in-app navigation: data fetched once (${fetched}) and shown`);
    await ctx.close();
  }

  // 4. Fallback HTML (server bundle not loaded): plain text first, app shows the
  // loaded page with no loading message and no layout shift.
  {
    const { ctx, page, errors, csp } = await open(browser, `${NEW}/sample-analysis`, 390, {
      route: (p) => p.route(`${NEW}/sample-analysis`, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: fallbackHtml })),
    });
    await page.addInitScript(() => {});
    const shifts = await page.evaluate(() => new Promise((res) => {
      let v = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) v += e.value; }).observe({ type: 'layout-shift', buffered: true });
      setTimeout(() => res(v), 300);
    }));
    const t = await mainText(page);
    check(t.includes('Bill of quantities') && !t.includes('Loading the sample') && /A real government tender/.test(t), 'fallback: app renders the loaded page from the data block');
    check(shifts === 0, `fallback: layout shift ${shifts}`);
    check(errors.length === 0 && csp.length === 0, `fallback: no errors or CSP violations ${JSON.stringify([errors, csp])}`);
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
