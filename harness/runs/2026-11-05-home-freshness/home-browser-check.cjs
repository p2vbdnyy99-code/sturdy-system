// Home page count band, FAQ and Features (local harness on 8790).
// node home-browser-check.cjs <origin> <fresh|stale-same|stale-different|never|delayed|unknown>
// Screenshots go next to this file unless SHOTS names another folder.
//   delayed: at least one list delayed (2–24 h), none stale; the band keeps
//            its usual wording and shows no date; the search page it links
//            to carries the "next update is late" notice.
//   unknown: the server's lists are stale, and the browser is given facets
//            without freshness (field missing, or null) or no facets at all
//            (request fails), as an older server or a failed request would.
//            The band must fall back to its usual wording without a date; a
//            stale server underneath proves the fallback is what is shown.
const { chromium } = require('playwright');
const [origin = 'http://localhost:8790', scenario = 'stale-same'] = process.argv.slice(2);
const SHOTS = process.env.SHOTS || __dirname;
let pass = 0, fail = 0;
const check = (ok, what) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} [${scenario}] ${what}`); };
const USUAL = { labels: ['open', 'open', 'open'], note: null, button: /^Search 130 open tenders$/ };
const EXPECT = {
  fresh: USUAL,
  'stale-same': { labels: Array(3).fill('open in our last update'), note: /^Last updated 23 October 2026\. New tenders published since then are missing\.$/, button: /^Search 130 tenders from our last update$/ },
  'stale-different': { labels: Array(3).fill('open in our last update'), note: /^Last updated: Central government 23 October 2026, State portals 20 October 2026, GeM bids 24 October 2026\. Newer tenders in those lists are missing\.$/, button: /^Search 130 tenders from our last update$/ },
  never: { labels: Array(3).fill('open in our last update'), note: /\(no update recorded\)/, button: /^Search 130 tenders from our last update$/ },
  delayed: USUAL,
  unknown: USUAL,
}[scenario];
if (!EXPECT) { console.error(`unknown scenario ${scenario}`); process.exit(2); }
// What the server must report for this run to mean anything.
const SERVER = {
  fresh: (s) => s.every((x) => x === 'fresh'),
  delayed: (s) => s.includes('delayed') && s.every((x) => x === 'fresh' || x === 'delayed'),
}[scenario] ?? ((s) => s.every((x) => x === 'stale' || x === 'unavailable'));
// unknown: how the browser's facets request is answered.
const VARIANTS = scenario === 'unknown' ? ['no-freshness', 'null-freshness', 'facets-failed'] : [null];
const MONTH = /\b\d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/;

(async () => {
  const facets = await (await fetch(`${origin}/bidpilot/public/tenders/facets`)).json();
  const statuses = Object.values(facets.freshness?.sources ?? {}).map((s) => s.status);
  check(statuses.length === 3 && SERVER(statuses), `server lists match the scenario (${statuses.join('/')})`);

  const browser = await chromium.launch({ args: ['--no-proxy-server'] });
  for (const width of [390, 1366]) {
    for (const variant of VARIANTS) {
      const at = `${width}px${variant ? ` ${variant}` : ''}`;
      const ctx = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width < 800, hasTouch: width < 800 });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('console', (m) => {
        if (m.type() !== 'error' || /401/.test(m.text())) return;
        if (variant === 'facets-failed' && /status of 500/.test(m.text())) return; // the failure this variant makes on purpose
        errors.push(m.text());
      });
      let intercepted = 0;
      if (variant) {
        await page.route('**/bidpilot/public/tenders/facets*', async (route) => {
          intercepted += 1;
          if (variant === 'facets-failed') return route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"harness: facets unavailable"}' });
          const res = await route.fetch();
          const body = await res.json();
          if (variant === 'no-freshness') delete body.freshness; else body.freshness = null;
          return route.fulfill({ response: res, json: body });
        });
      }
      await page.addInitScript(() => {
        window.__shifts = []; window.__csp = [];
        new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__shifts.push(e.value); }).observe({ type: 'layout-shift', buffered: true });
        document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective));
      });
      await page.goto(`${origin}/`, { waitUntil: 'networkidle' });
      if (variant !== 'facets-failed') {
        await page.waitForFunction(() => document.querySelectorAll('.home-tender-kind strong')[0]?.textContent !== '—', null, { timeout: 15000 });
      }
      await page.waitForTimeout(800);
      if (variant) check(intercepted >= 1, `${at}: the facets request was answered by the check (${intercepted})`);
      const loadCls = await page.evaluate(() => window.__shifts.reduce((a, b) => a + b, 0));
      const labels = await page.locator('.home-tender-kind small').allInnerTexts();
      const counts = await page.locator('.home-tender-kind strong').allInnerTexts();
      const expectCounts = variant === 'facets-failed' ? ['—', '—', '—'] : ['40', '60', '30'];
      check(JSON.stringify(counts) === JSON.stringify(expectCounts), `${at}: counts (${counts.join('/')})`);
      check(JSON.stringify(labels) === JSON.stringify(EXPECT.labels), `${at}: labels (${labels.join(' | ')})`);
      const note = await page.locator('.home-tenders-stale').innerText().catch(() => null);
      check(EXPECT.note === null ? note === null : EXPECT.note.test(note ?? ''), `${at}: note (${note})`);
      const button = (await page.locator('.home-tenders a.btn-primary').innerText()).trim();
      const expectButton = variant === 'facets-failed' ? /^Search tenders$/ : EXPECT.button;
      check(expectButton.test(button), `${at}: button (${button})`);
      if (scenario === 'delayed' || scenario === 'unknown') {
        // No date the page can't back up, and no claim of being current.
        const bandText = await page.locator('.home-tenders').innerText();
        check(!MONTH.test(bandText) && !/Last updated/i.test(bandText), `${at}: band shows no date`);
        check(!/\b(right now|live|real[- ]time|today|up to date|latest|updated)\b/i.test(bandText), `${at}: band makes no current-data claim`);
      }
      const band = page.locator('.home-tenders');
      await band.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      const sw = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      check(sw[0] <= sw[1], `${at}: no horizontal overflow (${sw.join('/')})`);
      const box = await band.boundingBox();
      check(loadCls < 0.01, `${at}: no layout shift while loading (${loadCls.toFixed(4)}; band starts at y=${Math.round(box.y + await page.evaluate(() => window.scrollY))}px, viewport 844px)`);
      await band.screenshot({ path: `${SHOTS}/home-band-${scenario}${variant ? `-${variant}` : ''}-${width}.png` });
      // The FAQ and Features wording (same in every state).
      if (scenario === 'stale-same') {
        await page.goto(`${origin}/faq`, { waitUntil: 'networkidle' });
        // FAQ answers sit in collapsed <details>, which innerText skips: read the text content.
        const faq = (await page.locator('main').textContent()).replace(/\s+/g, ' ');
        check(/Signed in, you can save a search, and new tenders that match it show in the app whenever the tender lists are being updated \(each list shows when it was last updated\)\./.test(faq), `${width}px: FAQ wording`);
        await page.goto(`${origin}/features`, { waitUntil: 'networkidle' });
        check(/new matching tenders show in the app while the lists are being updated/.test(await page.locator('main').innerText()), `${width}px: Features wording`);
      }
      // Delayed: the band's search button leads to the list, which says the update is late.
      if (scenario === 'delayed') {
        await page.locator('.home-tenders a.btn-primary').click();
        await page.waitForURL(`${origin}/government-tenders`);
        await page.waitForSelector('.tb-list .tb-item');
        await page.waitForTimeout(500);
        const cls = (await page.locator('.tb-stale').getAttribute('class').catch(() => '')) ?? '';
        const text = await page.locator('.tb-stale').innerText().catch(() => '');
        check(/notice-info/.test(cls) && /^Last updated \d+ \w+, \d+:\d\d [ap]m IST\. The next update is late, so the newest tenders may be missing\.$/i.test(text), `${at}: the search page says the update is late (${text})`);
        check(!/right now/i.test(await page.locator('main').innerText()), `${at}: the search page never says "right now"`);
      }
      const csp = await page.evaluate(() => window.__csp);
      check(errors.length === 0 && csp.length === 0, `${at}: no page errors or CSP violations ${JSON.stringify([errors, csp])}`);
      await ctx.close();
    }
  }
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
