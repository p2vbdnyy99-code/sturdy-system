// Stage A browser checks for the tender list pages (local harness server).
// node list-browser-check.cjs <origin> [fresh|stale] [expected last-update date, e.g. "23 October 2026"]
// The state says what the server's lists should be (freshness.js): "fresh",
// or "stale" for stale or unavailable. The check first confirms the server
// really is in that state, then checks that state's wording; everything else
// is the same in both.
const { chromium } = require('playwright');
// Screenshots go next to this file unless SHOTS names another folder.
const SHOTS = process.env.SHOTS || __dirname;

const [origin = 'http://localhost:8790', scenario = 'fresh', staleDate = '23 October 2026'] = process.argv.slice(2);
if (!['fresh', 'stale'].includes(scenario)) { console.error(`unknown state ${scenario}`); process.exit(2); }
const STALE = scenario === 'stale';
let pass = 0, fail = 0;
const check = (ok, what) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} [${scenario}] ${what}`); };

// The freshness wording each list page must show in this state.
async function freshnessWording(page, where, { count = null } = {}) {
  const main = await page.locator('main').innerText();
  const intro = await page.locator('.tb-intro-count').innerText();
  if (STALE) {
    check(await page.locator('.tb-stale').isVisible(), `${where}: freshness warning visible`);
    // One list: "This list has …"; all lists: "Central government tenders, … have …".
    check(/ (has|have) not been updated since /.test(await page.locator('.tb-stale').innerText())
      && (await page.locator('.tb-stale').innerText()).includes(`since ${staleDate}.`), `${where}: warning gives the last successful update (${staleDate})`);
    check(/missing/.test(await page.locator('.tb-stale').innerText()) && /Check the portal before you bid/.test(await page.locator('.tb-stale').innerText()), `${where}: warning says newer tenders are missing and to check the portal`);
    check(count === null
      ? intro.endsWith(`open tenders in our last update (${staleDate})`)
      : intro === `${count} open tenders in our last update (${staleDate})`, `${where}: dated snapshot count line (${intro})`);
    check(!/right now/i.test(main), `${where}: never says "right now"`);
    check(await page.locator('.tb-fresh').count() === 0, `${where}: no quiet "Updated" line`);
  } else {
    check(/^Updated \d+ \w+, \d+:\d\d [ap]m IST from CPPP\.$/i.test(await page.locator('.tb-fresh').innerText().catch(() => '')), `${where}: quiet "Updated" line`);
    check(await page.locator('.tb-stale').count() === 0, `${where}: no freshness warning`);
    check(count === null ? intro.endsWith('open tenders right now') : intro === `${count} open tenders right now`, `${where}: count says right now (${intro})`);
  }
}

(async () => {
  // The server must be in the state this run checks, or the run proves nothing.
  const facets = await (await fetch(`${origin}/bidpilot/public/tenders/facets`)).json();
  const statuses = Object.values(facets.freshness?.sources ?? {}).map((s) => s.status);
  check(statuses.length === 3 && statuses.every((s) => (STALE ? ['stale', 'unavailable'].includes(s) : s === 'fresh')),
    `server lists are ${scenario} (${statuses.join('/')})`);

  const browser = await chromium.launch({ args: ['--no-proxy-server'] });
  for (const width of [390, 1366]) {
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width < 800, hasTouch: width < 800 });
    const page = await ctx.newPage();
    const api = [];
    const errors = [];
    page.on('request', (r) => { const u = new URL(r.url()); if (u.pathname.startsWith('/bidpilot/public/tenders')) api.push(u.pathname + u.search); });
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error' && !/401/.test(m.text())) errors.push(m.text()); });
    await page.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective)); });

    await page.goto(`${origin}/government-tenders/state/maharashtra`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    check(api.length === 0, `${width}px: first load made no tender API requests (${JSON.stringify(api)})`);
    check(/kind=state&state=Maharashtra/.test(page.url()), `${width}px: URL carries the list's filter (${page.url()})`);
    check(await page.locator('h1').first().innerText() === 'Maharashtra government tenders', `${width}px: heading`);
    const countLine = STALE ? `60 open tenders in our last update (${staleDate})` : '60 open tenders right now';
    check(await page.locator('.tb-intro-count').innerText() === countLine, `${width}px: count line (${countLine})`);
    await freshnessWording(page, `${width}px state list`, { count: 60 });
    check(await page.locator('.tb-list .tb-item').count() === 25, `${width}px: 25 rows on page 1`);
    check(/60 tenders in Maharashtra/.test(await page.locator('.tb-total').innerText()), `${width}px: total line`);
    check(await page.locator('.tb-source').isVisible(), `${width}px: CPPP source note visible`);
    check(/Maharashtra \(60\)/.test(await page.locator('.tb-select-wide select').innerText()), `${width}px: state select has the facets`);
    const sw = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    check(sw[0] <= sw[1], `${width}px: no horizontal scroll (${sw.join('/')})`);

    // Filters still fetch: sort, then page 2, then back to the start.
    await page.locator('label.tb-select:has-text("Sort") select').selectOption('closing');
    await page.waitForResponse((r) => r.url().includes('/bidpilot/public/tenders?') && r.url().includes('sort=closing'));
    await page.waitForTimeout(300);
    check(/sort=closing/.test(page.url()) && api.some((a) => /sort=closing/.test(a)), `${width}px: changing sort fetches the new list`);
    await page.locator('.pagination button:has-text("Next")').click();
    await page.waitForResponse((r) => r.url().includes('page=2'));
    await page.waitForTimeout(300);
    check(await page.locator('.tb-list .tb-item').count() === 25 && /Page 2 of 3/.test(await page.locator('.pagination').innerText()), `${width}px: page 2 loads`);
    await page.locator('label.tb-select:has-text("Sort") select').selectOption('newest');
    await page.waitForTimeout(800);
    const back = api.filter((a) => /sort=newest|^\/bidpilot\/public\/tenders\?kind=state&status=open&state/.test(a)).length;
    check(back >= 1, `${width}px: going back to the first filters fetches them again, not the stale start (${back})`);
    await page.locator('input[type=search]').fill('ward 3');
    await page.waitForResponse((r) => r.url().includes('search=ward'));
    await page.waitForTimeout(300);
    check(await page.locator('.tb-list .tb-item').count() > 0, `${width}px: search works`);

    // In-app navigation to the main search, then back to the list page.
    await page.goto(`${origin}/government-tenders/organisation/central-public-works-department-cpwd`, { waitUntil: 'networkidle' });
    // L1: the server's data is used for the first render only, then taken out.
    check(await page.evaluate(() => document.getElementById('landing-data') === null), `${width}px: the data block is removed once read`);
    const orgRequests = () => api.filter((a) => /organisation=Central/.test(a)).length;
    const orgBefore = orgRequests();
    check(orgBefore === 0, `${width}px: organisation list first load made no list request (${orgBefore})`);
    await freshnessWording(page, `${width}px organisation list`, { count: 40 });
    await page.locator('a[href="/government-tenders"]').locator('visible=true').first().click();
    await page.waitForURL(`${origin}/government-tenders`);
    await page.waitForSelector('.tb-list .tb-item');
    check(/Find government tenders across India/.test(await page.locator('h1').first().innerText()), `${width}px: in-app navigation to the main search shows the main search`);
    await page.waitForTimeout(300);
    await freshnessWording(page, `${width}px main search`);
    await page.goBack();
    await page.waitForTimeout(800);
    check(/Central Public Works Department/.test(await page.locator('h1').first().innerText()) && await page.locator('.tb-list .tb-item').count() > 0, `${width}px: back to the organisation list shows it`);
    check(orgRequests() >= 1, `${width}px: back to the same list fetches it fresh, not the page-load data (${orgRequests()} list requests)`);
    // And again by an in-app link (not the back button): away to pricing, then a link to the list.
    await page.evaluate(() => { window.history.pushState({}, '', '/pricing'); window.dispatchEvent(new PopStateEvent('popstate')); });
    await page.waitForURL(`${origin}/pricing`);
    const beforeLink = orgRequests();
    await page.evaluate(() => { window.history.pushState({}, '', '/government-tenders/organisation/central-public-works-department-cpwd'); window.dispatchEvent(new PopStateEvent('popstate')); });
    await page.waitForResponse((r) => r.url().includes('organisation=Central'), { timeout: 10000 }).catch(() => null);
    await page.waitForTimeout(500);
    check(orgRequests() > beforeLink && await page.locator('.tb-list .tb-item').count() > 0, `${width}px: returning to the list inside the app fetches fresh data (${beforeLink} -> ${orgRequests()})`);

    const csp = await page.evaluate(() => window.__csp);
    check(errors.length === 0 && csp.length === 0, `${width}px: no page errors or CSP violations ${JSON.stringify([errors, csp])}`);
    // The committed list-390.png is the fresh state; other states get their own file.
    if (width === 390) await page.goto(`${origin}/government-tenders/state/maharashtra`, { waitUntil: 'networkidle' }).then(() => page.screenshot({ path: `${SHOTS}/list-${STALE ? 'stale-' : ''}390.png` }));
    await ctx.close();
  }
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
